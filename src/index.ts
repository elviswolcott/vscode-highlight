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
import { load as loadTheme, ThemeData } from "./vscode/themes";
import { LUT } from "./utils";
import {
  Languages,
  LanguagesByIndex,
  Grammars,
  ScopesByIndex,
  Themes,
} from "./extract";
import { TokenizerState, Line, RawToken } from "./lineTokenizers";
import { tokenizeLine as directives } from "./lineTokenizers/directives";
import { tokenizeLine as highlight } from "./lineTokenizers/highlight";

export const readFile = (path: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    fsReadFile(path, (error, data) => (error ? reject(error) : resolve(data)));
  });
};

// load extracted data
const defaultLanguages = readJson<Languages>(
  resolvePath(STATIC, "languages.json")
);

const defaultLanguagesByIndex = readJson<LanguagesByIndex>(
  resolvePath(STATIC, "languagesByindex.json")
);

const defaultGrammars = readJson<Grammars>(
  resolvePath(STATIC, "grammars.json")
);

const defaultScopesByIndex = readJson<ScopesByIndex>(
  resolvePath(STATIC, "scopesByIndex.json")
);

const defaultThemes = readJson<Themes>(resolvePath(STATIC, "themes.json"));

interface Token {
  content: string;
  style: Style;
}

interface HighlightJson {
  style: Style;
  content: Line<Token>[];
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

const styles = (raw: number, colors: string[], parentStyles: Style): Style => {
  const color = colors[unpack(raw, MC.FOREGROUND_MASK, MC.FOREGROUND_OFFSET)];
  const background =
    colors[unpack(raw, MC.BACKGROUND_MASK, MC.BACKGROUND_OFFSET)];
  const styleColors = {} as Style;
  if (color !== parentStyles.color) {
    styleColors.color = color;
  }
  if (background !== parentStyles.background) {
    styleColors.background = background;
  }
  return {
    ...styleColors,
    ...unpackFontStyle(unpack(raw, MC.FONT_STYLE_MASK, MC.FONT_STYLE_OFFSET)),
  };
};

// join all the masks used
const VisualStylesMask =
  MC.BACKGROUND_MASK | MC.FOREGROUND_MASK | MC.FONT_STYLE_MASK;

const styleEqual = (a: number, b: number, mask: number): boolean => {
  // a ^ b is the difference between the two
  // applying the mask checks if the difference is visual
  // the result is inverted, because a visual difference means not equal
  return !((a ^ b) & mask);
};

const styleToCSS = (style: Style): string => {
  const CSSProperties = {
    color: (value) => `color: ${value};`,
    background: (value): string => `background: ${value};`,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    underline: (value) => `text-decoration: underline;`,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    bold: (value) => `font-weight: bold;`,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    italic: (value) => `font-style: italic;`,
  } as { [key: string]: (v: string | true) => string };
  return (Object.keys(style) as (keyof Style)[])
    .map((prop) => CSSProperties[prop](style[prop] || ""))
    .join("");
};

const escapeHTML = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

class Highlight {
  content: HighlightJson;
  constructor(tokenized: Line<RawToken>[], theme: ThemeData, colors: string[]) {
    this.content = this.preprocess(tokenized, theme, colors);
  }
  // expand styles and combine tokens as possible
  private preprocess(
    tokenized: Line<RawToken>[],
    theme: ThemeData,
    colors: string[]
  ): HighlightJson {
    const themeColors = theme.resultColors;
    const rootStyles = {
      background: themeColors["editor.background"],
      color: themeColors["editor.foreground"],
    };
    return {
      style: rootStyles,
      content: tokenized.map((line) => {
        // merge tokens
        const [rest, last] = line.content.reduce(
          ([passed, last], current): [RawToken[], RawToken] => {
            // tokens can be merged if they have the same styles or one is whitespace with the same font styles
            if (styleEqual(last.style, current.style, VisualStylesMask)) {
              // combine content
              last.content += current.content;
              return [passed, last];
            } else if (
              styleEqual(last.style, current.style, MC.FONT_STYLE_MASK) &&
              (last.content.trim() === "" || current.content.trim() === "")
            ) {
              // use the style of the non-whitespace token
              if (last.content.trim() === "") {
                last.style = current.style;
              }
              last.content += current.content;
              return [passed, last];
            } else {
              passed.push(last);
              return [passed, current];
            }
          },
          [[], { content: "", style: 0 }] as [RawToken[], RawToken]
        );
        return {
          highlighted: line.highlighted,
          // remove empty tokens
          // unpack styles
          content: [...rest, last]
            .filter((token) => token.content !== "")
            .map((token) => ({
              content: token.content,
              style: styles(token.style, colors, rootStyles),
            })),
        };
      }),
    };
  }
  toJSON(): HighlightJson {
    return this.content;
  }
  toHTML(): string {
    const style = this.content.style;
    const lines = this.content.content;
    return `<pre style="${styleToCSS(style)}"><code>${lines
      .map(
        (line) =>
          `<div${line.highlighted ? ` class="highlighted"` : ""}>${
            line.content
              .map(
                (token) =>
                  `<span style="${styleToCSS(token.style)}">${escapeHTML(
                    token.content
                  )}</span>`
              )
              .join("") || " "
          }</div>`
      )
      .join("")}</pre></code>`;
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
    this.loaded.push(defaultLanguages);
    this.loaded.push(defaultLanguagesByIndex);
    this.loaded.push(defaultGrammars);
    this.loaded.push(defaultScopesByIndex);
    this.loaded.push(defaultThemes);

    this.registry = this.prepareRegistry();
  }

  async highlight(
    code: string,
    lang: string,
    themeName?: string
  ): Promise<Highlight> {
    const registry = await this.registry;
    const themes = await defaultThemes;
    const scopes = await defaultScopesByIndex;
    const grammars = await defaultGrammars;
    const languages = await defaultLanguages;
    const languagesByIndex = await defaultLanguagesByIndex;
    const data = {
      themes,
      scopes,
      grammars,
      languages,
      languagesByIndex,
    };
    // get specific data
    const theme = themes[themeName || this.theme];
    // TODO: impliment better language matching
    const language = languages[lang];
    const scope = scopes[language.index];
    const grammar = grammars[scope];
    // process the theme
    const themeData = loadTheme(resolvePath(STATIC, theme.path));
    registry.setTheme(themeData);
    const colors = registry.getColorMap();
    // map embedded languages to language indices
    const baseEmbeddedLanguages = grammar.embeddedLanguages || {};
    const embeddedLanguages = Object.keys(baseEmbeddedLanguages).reduce(
      (all: LUT<number>, scopeName: string) => {
        const languageId = baseEmbeddedLanguages[scopeName];
        const language = languages[languageId];
        all[scopeName] = language ? language.index : 1;
        return all;
      },
      {}
    );
    // load the grammar from the registry
    const textmate = await registry.loadGrammarWithConfiguration(
      scopes[language.index],
      language.index,
      {
        embeddedLanguages,
      }
    );
    // if it can't be parsed, the text can't be highlighted
    if (textmate === null) {
      return new Highlight(
        code
          .split("\n")
          .map((line) => ({ content: [{ content: line, style: 0 }] })),
        themeData,
        []
      );
    }
    // split text by line
    const lines = code.split("\n");
    // setup initial state
    const state: TokenizerState = {
      rules: INITIAL,
      next: { highlight: false },
      persisted: { highlight: false },
    };
    const tokenized = [] as Line<RawToken>[];
    lines.forEach((line) => {
      // check for directives
      if (directives(line, state, textmate, data) === null) {
        return;
      }
      tokenized.push(highlight(line, state, textmate, data));
    });
    return new Highlight(tokenized, themeData, colors);
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
        const grammars = await defaultGrammars;
        const scope = grammars[scopeName];
        if (scope) {
          // load the grammar from the file (plist or json)
          const data = await (
            await readFile(resolvePath(__dirname, STATIC, scope.path))
          ).toString();
          // undefined indicates a parsing error
          return parseRawGrammar(data, scope.path);
        }
        // return null to indicate the grammar couldn't be loaded
        warn(warning, `unable to find grammar for ${scopeName}.`);
        return null;
      },
      // It looks like VSCode has moved away from this (no built in extensions are using it anymore afaik)
      // It could be implimented if needed by a 3rd party extension
      getInjections: (): undefined | string[] => {
        return undefined;
      },
    });
  }
}
