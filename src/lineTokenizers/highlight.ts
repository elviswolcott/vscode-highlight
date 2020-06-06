import { TokenizerState, Line, RawToken, Data } from ".";
import { IGrammar } from "vscode-textmate";

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

export const tokenizeLine = (
  line: string,
  state: TokenizerState,
  textmate: IGrammar,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  data: Data
): Line<RawToken> => {
  const { tokens } = textmate.tokenizeLine(line, state.rules);
  // response is formated in repeating pairs of a start index followed by style info
  const { tokens: packed, ruleStack } = textmate.tokenizeLine2(
    line,
    state.rules
  );
  // add tokenized line
  const tokenized = {
    highlighted: state.next.highlight || state.persisted.highlight,
    content: tokens.map(({ startIndex, endIndex }) => ({
      content: line.substring(startIndex, endIndex),
      style: findStyle(packed, startIndex),
    })),
  };
  // update state
  state.rules = ruleStack;
  state.next.highlight = false;
  // return tokenized line
  return tokenized;
};
