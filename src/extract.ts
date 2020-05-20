import { writeManifest, STATIC } from "./data";
import { resolve as resolvePath } from "path";
import { readdir } from "fs";
import { setLevel, info } from "loglevel";
import { load } from "./extensions";
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
  const allScopes = extensions.reduce((all, { scopes }) => {
    return {
      ...all,
      ...scopes,
    };
  }, {} as { [scope: string]: string });
  await writeManifest(STATIC, "scopes", allScopes);
  info(success, `found ${Object.keys(allScopes).length} scopes.`);
  info(status, "done.");
})();
