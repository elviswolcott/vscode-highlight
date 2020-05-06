[![Travis (.com)](https://img.shields.io/travis/com/elviswolcott/vscode-highlight?logo=travis)](https://travis-ci.com/elviswolcott/vscode-highlight)
[![npm](https://img.shields.io/npm/v/vscode-highlight?label=vscode-highlight&logo=npm)](https://www.npmjs.com/package/vscode-highlight)
# <package-name>

> tagline

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

## Initial Setup

1. Edit `.travis.yml` so the repository and npm credentials match your project
    * Encrypting your NPM token requires the Travis CLI
