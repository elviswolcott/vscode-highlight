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
import {
  load,
  LUT,
  Scopes,
  Themes,
  CompleteLanguageContribution,
  Comments,
} from "./extensions";
import { load as loadTheme, ThemeData } from "./vscode/themes";

export const readFile = (path: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    fsReadFile(path, (error, data) => (error ? reject(error) : resolve(data)));
  });
};

type Languages = LUT<CompleteLanguageContribution>;

// only load once
const defaultScopes = readJson<Scopes>(
  resolvePath(__dirname, "../data/scopes.json")
);

const defaultThemes = readJson<Themes>(
  resolvePath(__dirname, "../data/themes.json")
);

// auto expand aliases and comments
const defaultLanguages = readJson<Languages>(
  resolvePath(__dirname, "../data/languages.json")
).then(async (languages) => {
  Object.keys(languages).forEach((languageId) => {
    const language = languages[languageId];
    if (language.aliases.length > 0) {
      language.aliases.forEach((alias) => {
        languages[alias] = language;
      });
    }
  });
  return languages;
});

interface Token {
  content: string;
  style: Style;
}

interface RawToken {
  content: string;
  style: number;
}

interface Line<T> {
  highlighted?: boolean;
  content: Array<T>;
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
    underline: (_value) => `text-decoration: underline;`,
    bold: (_value) => `font-weight: bold;`,
    italic: (_value) => `font-style: italic;`,
  } as { [key: string]: (v: string | true) => string };
  return (Object.keys(style) as (keyof Style)[])
    .map((prop) => CSSProperties[prop](style[prop] || ""))
    .join("");
};

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
          `<div${
            line.highlighted ? ` class="highlighted"` : ""
          }>${line.content
            .map(
              (token) =>
                `<span style="${styleToCSS(token.style)}">${
                  token.content
                }</span>`
            )
            .join("")}</div>`
      )
      .join("")}</pre></code>`;
  }
}

const highlightDirectives = [
  "highlight-next-line",
  "highlight-start",
  "highlight-end",
];

const dedupe = <T>(arr: T[]): T[] =>
  arr.filter((item, index) => arr.indexOf(item) === index);

const escapeRegExp = (string: string): string =>
  string.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");

const orRegExp = (args: string[]): string => args.join("|");

const captureRegExp = (group: string): string => `(${group})`;

const whitespaceRegExp = `\\s*`;

const createDirectiveMatcher = (
  directives: string[],
  comments: Comments
): RegExp => {
  const directive =
    whitespaceRegExp +
    captureRegExp(orRegExp(directives.map(escapeRegExp))) +
    whitespaceRegExp;
  const expressions = [];
  if (comments.blockComment) {
    expressions.push(
      escapeRegExp(comments.blockComment[0]) +
        directive +
        escapeRegExp(comments.blockComment[1]) +
        whitespaceRegExp
    );
  }
  if (comments.lineComment) {
    expressions.push(escapeRegExp(comments.lineComment) + directive);
  }
  return new RegExp(whitespaceRegExp + captureRegExp(orRegExp(expressions)));
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
    this.loaded.push(defaultLanguages);

    this.registry = this.prepareRegistry();
  }

  async highlight(
    code: string,
    lang: string,
    theme?: string
  ): Promise<Highlight> {
    const registry = await this.registry;
    const themes = await defaultThemes;
    const scopes = await defaultScopes;
    const themeData = loadTheme(
      resolvePath(__dirname, STATIC, themes[theme || this.theme])
    );
    registry.setTheme(themeData);
    const colors = registry.getColorMap();
    // find the scope for the language
    const languages = await defaultLanguages;
    const language = languages[lang];
    const scope = scopes[language.scope];
    const indexToLanguageId = [
      "do-not-use",
      language.id,
      ...dedupe(Object.values(scope.embeddedLanguages)),
    ];
    const languageIdToIndex = indexToLanguageId.reduce((map, id, index) => {
      map[id] = index;
      return map;
    }, {} as LUT<number>);
    const scopeNameToIndex = Object.keys(scope.embeddedLanguages).reduce(
      (map, name) => {
        map[name] = languageIdToIndex[scope.embeddedLanguages[name]];
        return map;
      },
      {} as LUT<number>
    );
    scopeNameToIndex[language.scope] = 1;
    const embeddedLanguages = Object.keys(scope.embeddedLanguages).reduce(
      (all, key) => {
        all[key] = scopeNameToIndex[key];
        return all;
      },
      {} as LUT<number>
    );
    const grammar = await registry.loadGrammarWithConfiguration(
      language.scope,
      1,
      {
        embeddedLanguages,
      }
    );
    if (grammar === null) {
      return new Highlight([], themeData, []);
    }
    const lines = code.split("\n");
    let rules = INITIAL;
    const tokenized = [] as Line<RawToken>[];
    const state = { highlightSingle: false, highlighting: false };
    lines.forEach((line) => {
      // the rule stack can't be read from directly, so pass an empty line to get the language
      const { tokens: peekLanguage } = grammar.tokenizeLine2("", rules);
      const comments =
        languages[
          indexToLanguageId[
            unpack(peekLanguage[1], MC.LANGUAGEID_MASK, MC.LANGUAGEID_OFFSET)
          ]
        ].comments;
      const directiveMatcher = createDirectiveMatcher(
        highlightDirectives,
        comments
      );
      const match = directiveMatcher.exec(line);
      if (match) {
        const directive = match[2] || match[3];
        switch (directive) {
          case "highlight-next-line":
            state.highlightSingle = true;
            break;

          case "highlight-start":
            state.highlighting = true;
            break;

          case "highlight-end":
            state.highlighting = false;
            break;

          default:
            break;
        }
        return; // line won't be tokenized (as if it wasn't in the source)
      }
      const { tokens } = grammar.tokenizeLine(line, rules);
      // response is formated in repeating pairs of a start index followed by style info
      const { tokens: packed, ruleStack } = grammar.tokenizeLine2(line, rules);
      tokenized.push({
        highlighted: state.highlightSingle || state.highlighting,
        content: tokens.map(({ startIndex, endIndex }) => ({
          content: line.substring(startIndex, endIndex),
          style: findStyle(packed, startIndex),
        })),
      });
      rules = ruleStack;
      state.highlightSingle = false;
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
        const scopes = await defaultScopes;
        const scope = scopes[scopeName];
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
