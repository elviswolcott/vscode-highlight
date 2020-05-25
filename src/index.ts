import {
  Registry,
  parseRawGrammar,
  OnigScanner as IOnigScanner,
  IRawGrammar,
  INITIAL,
  MetadataConsts as MC,
} from "vscode-textmate";
import { OnigScanner, OnigString } from "oniguruma";
import { readFile as fsReadFile } from "fs";
import { readJson, RUNTIME, STATIC } from "./data";
import { warn } from "loglevel";
import { warning } from "log-symbols";
import { resolve as resolvePath } from "path";
import { load } from "./extensions";
import { load as loadTheme } from "./vscode/themes";

export const readFile = (path: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    fsReadFile(path, (error, data) => (error ? reject(error) : resolve(data)));
  });
};

interface Scopes {
  [scope: string]: string;
}

interface Themes {
  [scope: string]: string;
}

// only load once
const defaultScopes = readJson<Scopes>(
  resolvePath(__dirname, "../data/scopes.json")
);

const defaultThemes = readJson<Themes>(
  resolvePath(__dirname, "../data/themes.json")
);

// textmate registry for highlighter

// todo: language => scope conversation

interface Token {
  scopes: string[];
  content: string;
  style: Style;
}

type Line = Token[];

interface HighlightJson {
  style: Style;
  content: Line[];
}

enum FontStyleConstants {
  Unset = -1,
  None = 0,
  ItalicMask = 1,
  BoldMask = 2,
  UnderlineMask = 4,
}

interface FontStyle {
  italic?: boolean;
  bold?: boolean;
  underline?: boolean;
}

interface Style extends FontStyle {
  color?: string;
  background?: string;
}

class Highlight {
  tokenized: Line[];
  rootStyles: Style;
  constructor(tokenized: Line[], rootStyles: Style) {
    this.tokenized = tokenized;
    this.rootStyles = rootStyles;
  }
  toJSON(): HighlightJson {
    return {
      style: this.rootStyles,
      content: this.tokenized,
    };
  }
}

// credit: https://github.com/andrewbranch/gatsby-remark-vscode/blob/bd95106ff71943c6a6a9d7e263aed27d49ac1b1d/src/tokenizeWithTheme.js#L64-L73
const findStyle = (packed: Uint32Array, startIndex: number): number => {
  let i;
  for (i = 0; i < packed.length; i += 2) {
    const start = packed[i];
    const end = packed[i + 2];
    if (start <= startIndex && startIndex < end) {
      return packed[i + 1];
    }
  }
  return packed[i - 1];
};

const unpackFontStyle = (fontStyle: number): FontStyle => {
  if (
    fontStyle === FontStyleConstants.None ||
    fontStyle === FontStyleConstants.Unset
  ) {
    return {};
  }
  const styles = {} as FontStyle;
  if (fontStyle & FontStyleConstants.ItalicMask) {
    styles.italic = true;
  }
  if (fontStyle & FontStyleConstants.BoldMask) {
    styles.bold = true;
  }
  if (fontStyle & FontStyleConstants.UnderlineMask) {
    styles.underline = true;
  }
  return styles;
};

const unpack = (raw: number, mask: number, offset: number): number => {
  return (raw & mask) >>> offset;
};

const styles = (
  packed: Uint32Array,
  startIndex: number,
  colors: string[]
): Style => {
  const raw = findStyle(packed, startIndex);
  return {
    color: colors[unpack(raw, MC.FOREGROUND_MASK, MC.FOREGROUND_OFFSET)],
    background: colors[unpack(raw, MC.BACKGROUND_MASK, MC.BACKGROUND_OFFSET)],
    ...unpackFontStyle(unpack(raw, MC.FONT_STYLE_MASK, MC.FONT_STYLE_OFFSET)),
  };
};

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
    this.loaded.push(defaultThemes);

    this.registry = this.prepareRegistry();
  }

  async highlight(
    code: string,
    lang: string,
    theme?: string
  ): Promise<Highlight> {
    const registry = await this.registry;
    const themes = await defaultThemes;
    const themeData = loadTheme(
      resolvePath(__dirname, STATIC, themes[theme || this.theme])
    );
    registry.setTheme(themeData);
    const colors = registry.getColorMap();
    // extract the colors we care about
    const themeColors = themeData.resultColors;
    const rootStyles = {
      background: themeColors["editor.background"],
      color: themeColors["editor.foreground"],
    };
    // TODO: map from lang to scopename
    const grammar = await registry.loadGrammar(lang);
    if (grammar === null) {
      return new Highlight([], { color: "#ffffff", background: "#000000" });
    }
    const lines = code.split("\n");
    let rules = INITIAL;
    const tokenized = [] as Line[];
    lines.map((line) => {
      const { tokens } = grammar.tokenizeLine(line, rules);
      // response is formated in repeating pairs of a start index followed by style info
      const { tokens: packed, ruleStack } = grammar.tokenizeLine2(line, rules);
      tokenized.push(
        tokens.map(({ scopes, startIndex, endIndex }) => {
          return {
            scopes,
            content: line.substring(startIndex, endIndex),
            style: styles(packed, startIndex, colors),
          };
        })
      );
      rules = ruleStack;
    });
    return new Highlight(tokenized, rootStyles);
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
            await readFile(resolvePath(__dirname, STATIC, grammarPath))
          ).toString();
          // undefined indicates a parsing error
          return parseRawGrammar(data, grammarPath);
        }
        // return null to indicate the grammar couldn't be loaded
        warn(warning, `unable to find grammar for ${scopeName}.`);
        return null;
      },
      // It looks like VSCode has moved away from this (no built in extensions are using it anymore afaik)
      // It could be implimented if needed by a 3rd party extension
      getInjections: (scopeName): undefined | string[] => {
        return undefined;
      },
    });
  }
}
