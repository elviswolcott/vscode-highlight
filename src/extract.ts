import { writeManifest, STATIC } from "./data";
import { resolve as resolvePath } from "path";
import { readdir } from "fs";
import { setLevel, info } from "loglevel";
import { load } from "./extensions";
import { register as registerTheme } from "./extensions/themes";
import {
  register as registerLanguage,
  registerIndex,
} from "./extensions/languages";
import { info as status, success } from "log-symbols";
import {
  register as registerGrammar,
  registerInitialScopes,
} from "./extensions/grammars";

const VSCODE = resolvePath(__dirname, "../vscode");
const BUILTIN_EXTENSIONS = resolvePath(VSCODE, "extensions");

const childDirectories = (path: string): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    readdir(path, { withFileTypes: true }, (error, files) => {
      if (error) reject(error);
      resolve(
        files
          .filter((file) => file.isDirectory())
          .map((file) => resolvePath(path, file.name))
      );
    });
  });
};

(async (): Promise<void> => {
  setLevel("info");
  // find all pre installed extensions
  const extensionsList = await childDirectories(BUILTIN_EXTENSIONS);
  // read package, copy related files, and parse
  const extensions = await Promise.all(
    extensionsList.map((extension) => load(extension, STATIC))
  );
  // combine all the extension data into a single extension
  const joined = extensions.reduce(
    (joined, extension) => {
      joined.grammars = joined.grammars.concat(extension.grammars);
      joined.themes = joined.themes.concat(extension.themes);
      joined.languages = joined.languages.concat(extension.languages);
      return joined;
    },
    { name: "built-in", themes: [], languages: [], grammars: [] }
  );
  // get all themes and register them
  const themes = joined.themes.reduce(registerTheme, {});
  // save the result to disk
  await writeManifest(STATIC, "themes", themes);
  info(success, `found ${joined.themes.length} themes.`);
  // get all languages and register them
  const languages = joined.languages.reduce(registerLanguage(1), {});
  const languagesByIndex = Object.values(languages).reduce(registerIndex, {});
  // save the result to disk
  await writeManifest(STATIC, "languages", languages);
  await writeManifest(STATIC, "languagesByIndex", languagesByIndex);
  info(success, `found ${joined.languages.length} languages.`);
  // get all the grammars and register
  const grammars = joined.grammars.reduce(registerGrammar, {});
  const scopesByIndex = Object.values(grammars).reduce(
    registerInitialScopes(languages),
    {}
  );
  // save to disk
  await writeManifest(STATIC, "grammars", grammars);
  await writeManifest(STATIC, "scopesByIndex", scopesByIndex);
  info(success, `found ${joined.grammars.length} grammars.`);
  info(status, "done.");
})();
