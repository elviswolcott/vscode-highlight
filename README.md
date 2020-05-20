[![Travis (.com)](https://img.shields.io/travis/com/elviswolcott/vscode-highlight?logo=travis)](https://travis-ci.com/elviswolcott/vscode-highlight)
[![npm](https://img.shields.io/npm/v/vscode-highlight?label=vscode-highlight&logo=npm)](https://www.npmjs.com/package/vscode-highlight)
# vscode-highlight

> Syntax highlighting powered by VS Code

# Usage

> Important: `vscode-highlight` can only run in Node due to the depedency on the oniguruma regex library (which is written in C).

```js
const Highligter = require("vscode-highlight");
const fs = require("fs");
const highlighter = new Highlighter();

// any string of code works
const code = fs.readFileSync("./somefile.js");
const highlighted = highlighter.highlight(code, "js").toHTML();
```

# Credit

This is inspired by and based in part on [andrewbranch/gatsby-remark-vscode](https://github.com/andrewbranch/gatsby-remark-vscode/).

# Development

## Available Scripts

In the project directory, you can run:

### `npm run build`

Builds the package using typescript into `./lib`

### `npm test`

Launches the Jest to run tests.

### `npm run lint`

Checks code for style issues and syntax errors with TSLint and Prettier.

### `npm run lint:fix`

Checks code for style issues and syntax errors with TSLint and Prettier, attempting to fix them when possible.

## Publishing a new version

Travis is configured to run deploys on tags.

## Tenative API Design

Highligher({ extensions?: string[], defaultTheme?: string})
+ loads extensions
+ loads built in extensions
Highlighter.highlight(code: string, lang: string, theme?: string)
+ returns a Highlight for the code
Highlight.toJSON()
+ returns the JSON represenation of the highlighted code
Highlight.toHTML()
+ returns an HTML string of the highlighted code
Highlight.toANSI(8 | 16 | 256) (experimental)
+ returns a string colored using ANSI color sequences
+ great for console.log() in node
+ up to you to check for compatibility
Highlight.toBrowserConsole
+ returns an arguments list to pass to console.log
+ great for console.log in the browser