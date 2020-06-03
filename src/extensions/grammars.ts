import { LUT, IndexMap } from "../utils";
import { dataBlock, copyEntry, portable } from "../data";
import { resolve as resolvePath } from "path";
import { RegisteredLanguage } from "./languages";

export const load = (extension: string, dataPath: string) => async (
  grammar: RawGrammarContribution
): Promise<Grammar> => {
  const path = await copyEntry(
    resolvePath(extension, grammar.path),
    dataBlock(dataPath, "grammars")
  );
  return {
    ...grammar,
    path: portable(path),
  };
};

export interface Grammar {
  language?: string;
  // TextMate scope
  scopeName: string;
  // TextMate grammar (relative path)
  path: string;
  tokenTypes?: LUT<string>;
  embeddedLanguages?: LUT<string>;
}

export type RawGrammarContribution = Grammar;

export type RegisteredGrammar = Grammar;

export const register = (
  all: LUT<RegisteredGrammar>,
  grammar: Grammar
): LUT<RegisteredGrammar> => {
  all[grammar.scopeName] = grammar;
  return all;
};

export const registerInitialScopes = (languages: LUT<RegisteredLanguage>) => (
  all: IndexMap,
  grammar: Grammar
): IndexMap => {
  if (grammar.language) {
    // link language to scope
    all[languages[grammar.language].index] = grammar.scopeName;
  }
  return all;
};
