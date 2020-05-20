import {
  Registry,
  parseRawGrammar,
  OnigScanner as IOnigScanner,
  IRawGrammar,
  INITIAL,
} from "vscode-textmate";
import { OnigScanner, OnigString } from "oniguruma";
import { readFile as fsReadFile } from "fs";
import { readJson } from "./data";
import { warn } from "loglevel";
import { warning } from "log-symbols";
import { resolve as resolvePath } from "path";

export const readFile = (path: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    fsReadFile(path, (error, data) => (error ? reject(error) : resolve(data)));
  });
};

// only load once
const defaultScopes = readJson<{ [scope: string]: string }>(
  resolvePath(__dirname, "../data/scopes.json")
);

// global registry for highlighter
const registry = new Registry({
  // onigurama library
  onigLib: Promise.resolve({
    // the types from oniguruma and vscode-textmate differ on wether a match can be null
    createOnigScanner: (sources) => new OnigScanner(sources) as IOnigScanner,
    createOnigString: (str) => new OnigString(str),
  }),
  // load a grammar from a scope name
  loadGrammar: async (scopeName): Promise<IRawGrammar | null | undefined> => {
    // look for the grammar in vscode extensions
    const scopes = await defaultScopes;
    const grammarPath = scopes[scopeName];
    if (grammarPath) {
      // load the grammar from the file (plist or json)
      const data = await (
        await readFile(resolvePath(__dirname, grammarPath))
      ).toString();
      // undefined indicates a parsing error
      return parseRawGrammar(data, grammarPath);
    }
    // return null to indicate the grammar couldn't be loaded
    warn(warning, `unable to find grammar for ${scopeName}.`);
    return null;
  },
  // get additional scopes to inject
  // makes it possible for a grammar to request being injected into another grammar
  getInjections: (scopeName): undefined | string[] => {
    return undefined;
  },
});

// todo: language => scope conversation
// todo: injections
// todo: thmemes
// consider using tokenizeLine2 for theming

interface Token {
  scopes: string[];
  content: string;
}

type Line = Token[];

export const highlight = async (code: string): Promise<Line[] | null> => {
  const grammar = await registry.loadGrammar("source.js");
  if (grammar === null) {
    warn(warning, `unable to highlight`);
    return null;
  }
  const lines = code.split("\n");
  let rules = INITIAL;
  const tokenized = [] as Line[];
  lines.map((line) => {
    const { tokens, ruleStack } = grammar.tokenizeLine(line, rules);
    tokenized.push(
      tokens.map(({ scopes, startIndex, endIndex }) => ({
        scopes,
        content: line.substring(startIndex, endIndex),
      }))
    );
    rules = ruleStack;
  });
  return tokenized;
};
