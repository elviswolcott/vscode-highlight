import { childDirectories, writeJson } from "./fsPromise";
import { resolve as resolvePath } from "path";
import { setLevel, info } from "loglevel";
import { load } from "./extensions";
import { info as status, success } from "log-symbols";

(async (): Promise<void> => {
  setLevel("info");
  // find all pre installed extensions
  const extensionsList = await childDirectories("../vscode/extensions");
  // read package, copy related files, and parse
  const extensions = await Promise.all(
    extensionsList.map((extension) =>
      load(extension, resolvePath(__dirname, "../data"))
    )
  );
  const allScopes = extensions.reduce((all, { scopes }) => {
    return {
      ...all,
      ...scopes,
    };
  }, {} as { [scope: string]: string });
  await writeJson(resolvePath(__dirname, "../data", "scopes.json"), allScopes);
  info(success, `found ${Object.keys(allScopes).length} scopes.`);
  info(status, "done.");
})();
