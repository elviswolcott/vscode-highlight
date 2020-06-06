import { StackElement } from "vscode-textmate";
import {
  Themes,
  ScopesByIndex,
  Grammars,
  Languages,
  LanguagesByIndex,
} from "../extract";

interface LineState {
  highlight: boolean;
}

export interface TokenizerState {
  rules: StackElement;
  next: LineState;
  persisted: LineState;
}

export interface Line<T> {
  highlighted?: boolean;
  content: Array<T>;
}

export interface RawToken {
  content: string;
  style: number;
}

export interface Data {
  themes: Themes;
  scopes: ScopesByIndex;
  grammars: Grammars;
  languages: Languages;
  languagesByIndex: LanguagesByIndex;
}
