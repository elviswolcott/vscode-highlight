import { Comments } from "../extensions/languages";
import { TokenizerState, Line, RawToken, Data } from ".";
import { IGrammar, MetadataConsts as MC } from "vscode-textmate";

const unpack = (raw: number, mask: number, offset: number): number => {
  return (raw & mask) >>> offset;
};

const highlightDirectives = [
  "highlight-next-line",
  "highlight-start",
  "highlight-end",
];

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

export const tokenizeLine = (
  line: string,
  state: TokenizerState,
  textmate: IGrammar,
  data: Data
): null | string | Line<RawToken> => {
  // the rule stack can't be read from directly, so pass an empty line to get the language
  const { tokens: peekLanguage } = textmate.tokenizeLine2("", state.rules);
  // get the comments based on the current language
  const comments =
    data.languages[
      data.languagesByIndex[
        unpack(peekLanguage[1], MC.LANGUAGEID_MASK, MC.LANGUAGEID_OFFSET)
      ]
    ].comments;
  // create a regexp matcher
  const directiveMatcher = createDirectiveMatcher(
    highlightDirectives,
    comments
  );
  // find the directive
  const match = directiveMatcher.exec(line);
  //
  if (match) {
    const directive = match[2] || match[3];
    switch (directive) {
      case "highlight-next-line":
        state.next.highlight = true;
        break;

      case "highlight-start":
        state.persisted.highlight = true;
        break;

      case "highlight-end":
        state.persisted.highlight = false;
        break;

      default:
        break;
    }
    return null; // line won't be tokenized (as if it wasn't in the source)
  } else {
    return line;
  }
};
