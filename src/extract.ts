import { writeManifest, STATIC } from "./data";
import { resolve as resolvePath } from "path";
import { readdir } from "fs";
import { setLevel, info } from "loglevel";
import { load, CompleteLanguageContribution } from "./extensions";
import { info as status, success } from "log-symbols";

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
  // TODO: consider moving merge funcitions into ./extensions
  const allScopes = extensions.reduce((all, { scopes }) => {
    return {
      ...all,
      ...scopes,
    };
  }, {} as { [scope: string]: string });
  const allThemes = extensions.reduce((all, { themes }) => {
    return {
      ...all,
      ...themes,
    };
  }, {} as { [scope: string]: string });
  // sometimes the scope grammar and language are in different files
  const allLanguageScopes = extensions.reduce((all, { languageScopes }) => {
    return {
      ...all,
      ...languageScopes,
    };
  }, {} as { [scope: string]: string });
  // to reduce file size, aliases are expanded during runtime
  const allLanguages = extensions.reduce((all, { languages }) => {
    // join by combining aliases, extensions, and filenames
    // prefer name !== id
    // add in scope
    const mergedLanguages = Object.keys(languages).reduce(
      (merged, languageId) => {
        const language = {
          scope: allLanguageScopes[languageId],
          ...languages[languageId],
        };
        const existing = all[languageId];
        if (existing) {
          merged[languageId] = {
            id: languageId,
            scope: language.scope,
            name: existing.name === languageId ? language.name : existing.name,
            aliases: [...existing.aliases, ...language.aliases],
            extensions: [...existing.extensions, ...language.extensions],
            filenames: [...existing.filenames, ...language.filenames],
            comments: { ...existing.comments, ...language.comments },
          };
        } else {
          merged[languageId] = language;
        }
        return merged;
      },
      {} as { [language: string]: CompleteLanguageContribution }
    );
    return {
      ...all,
      ...mergedLanguages,
    };
  }, {} as { [language: string]: CompleteLanguageContribution });
  await writeManifest(STATIC, "scopes", allScopes);
  info(success, `found ${Object.keys(allScopes).length} scopes.`);
  await writeManifest(STATIC, "themes", allThemes);
  info(success, `found ${Object.keys(allThemes).length} themes.`);
  await writeManifest(STATIC, "languages", allLanguages);
  info(success, `found ${Object.keys(allLanguages).length} languages.`);
  info(status, "done.");
})();
