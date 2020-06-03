import { info, warn } from "loglevel";
import { yellow } from "chalk";
import { success, error, info as status } from "log-symbols";
import { Language, load as loadLanguage } from "./languages";
import { Grammar, load as loadGrammar } from "./grammars";
import { Theme, load as loadTheme } from "./themes";
import { load as loadPackage } from "./package";
const indent = (n: number): string => "  ".repeat(n);
const count = (n: number, name: string): string =>
  `${n} ${name}${n !== 1 ? "s" : ""}.`;

interface Extension {
  name: string;
  themes: Theme[];
  languages: Language[];
  grammars: Grammar[];
}

const load = async (
  extension: string,
  dataPath: string
): Promise<Extension> => {
  try {
    // read package.json
    const packageJson = await loadPackage(extension, dataPath);
    const languages = await Promise.all(
      packageJson.languages.map(loadLanguage(extension, dataPath))
    );
    const grammars = await Promise.all(
      packageJson.grammars.map(loadGrammar(extension, dataPath))
    );
    const themes = await Promise.all(
      packageJson.themes.map(loadTheme(extension, dataPath))
    );

    // log info
    info(success, `${packageJson.name} loaded.`);
    info(indent(1), status, count(languages.length, "language"));
    languages.forEach((language) => {
      info(indent(2), `+ ${language.name}`);
    });
    info(indent(1), status, count(grammars.length, "grammar"));
    grammars.forEach((grammar) => {
      info(indent(2), `+ ${grammar.scopeName}`);
    });
    info(indent(1), status, count(themes.length, "theme"));
    themes.forEach((theme) => {
      info(indent(2), `+ ${theme.label}`);
    });

    return {
      name: packageJson.name,
      languages,
      grammars,
      themes,
    };
  } catch (e) {
    warn(error, yellow(e));
    return {
      name: "failed-extension",
      grammars: [],
      themes: [],
      languages: [],
    };
  }
};

export { load };
