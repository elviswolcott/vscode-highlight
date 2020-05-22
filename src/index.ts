import {
  Registry,
  parseRawGrammar,
  OnigScanner as IOnigScanner,
  IRawGrammar,
  INITIAL,
} from "vscode-textmate";
import { OnigScanner, OnigString } from "oniguruma";
import { readFile as fsReadFile } from "fs";
import { readJson, RUNTIME } from "./data";
import { warn } from "loglevel";
import { warning } from "log-symbols";
import { resolve as resolvePath } from "path";
import { load } from "./extensions";

export const readFile = (path: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    fsReadFile(path, (error, data) => (error ? reject(error) : resolve(data)));
  });
};

interface Scopes {
  [scope: string]: string;
}

// only load once
const defaultScopes = readJson<Scopes>(
  resolvePath(__dirname, "../data/scopes.json")
);

// textmate registry for highlighter

// todo: language => scope conversation
// todo: injections
// todo: thmemes
// consider using tokenizeLine2 for theming

interface Token {
  scopes: string[];
  content: string;
}

type Line = Token[];

class Highlight {
  tokenized: Line[];
  constructor(tokenized: Line[]) {
    this.tokenized = tokenized;
  }
  toJSON(): Line[] {
    return this.tokenized;
  }
}

export class Highlighter {
  private theme = "Dark (Visual Studio)";
  private extensions: string[];
  private registry: Promise<Registry>;
  // any async effects fired off in the contructor should be added here
  private loaded: Promise<unknown>[] = [];

  constructor();
  constructor(defaultTheme: string);
  constructor(extensions: string[]);
  constructor(extensions: string[], defaultTheme: string);
  constructor(extensions?: string | string[], defaultTheme?: string) {
    // set extensions and theme based on parameters
    if (Array.isArray(extensions)) {
      this.extensions = extensions;
      this.theme = defaultTheme || this.theme;
    } else {
      this.extensions = [];
      this.theme = extensions || this.theme;
    }

    // start loading the extensions
    this.loaded.concat(this.extensions.map((path) => load(path, RUNTIME)));

    // start loading defaults
    this.loaded.push(defaultScopes);

    this.registry = this.prepareRegistry();
  }

  async highlight(
    code: string,
    lang: string,
    theme?: string
  ): Promise<Highlight> {
    const registry = await this.registry;
    // TODO: map from lang to scopename
    const grammar = await registry.loadGrammar(lang);
    if (grammar === null) {
      return new Highlight([]);
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
    return new Highlight(tokenized);
  }

  private async prepareRegistry(): Promise<Registry> {
    // wait for dependencies to load
    await this.loaded;
    // setup the registry
    return new Registry({
      // onigurama library
      onigLib: Promise.resolve({
        // the types from oniguruma and vscode-textmate differ on wether a match can be null
        createOnigScanner: (sources) =>
          new OnigScanner(sources) as IOnigScanner,
        createOnigString: (str) => new OnigString(str),
      }),
      // load a grammar from a scope name
      loadGrammar: async (
        scopeName
      ): Promise<IRawGrammar | null | undefined> => {
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
  }
}
