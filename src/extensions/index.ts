import { readJson, copy } from "../fsPromise";
import { resolve as resolvePath, basename, relative } from "path";
import { info, warn } from "loglevel";
import { yellow } from "chalk";
import { success, error, info as status } from "log-symbols";
const indent = (n: number): string => "  ".repeat(n);
const count = (n: number, name: string): string =>
  `${n} ${name}${n !== 1 ? "s" : ""}.`;

const transformLanguageContribution = ({
  id,
  aliases: rawAliases,
  extensions = [],
  filenames = [],
  configuration,
}: RawLanguageContribution): LanguageContribution => {
  const [name = id, ...aliases] = rawAliases || [];
  return {
    id,
    name,
    aliases,
    extensions,
    filenames,
    configuration,
  };
};

interface RawLanguageContribution {
  // match to GrammarContribution.language
  id: string;
  // first alias can be used for display
  aliases?: string[];
  extensions?: string[];
  filenames?: string[];
  // LanguageConfiguration (relative path)
  configuration?: string;
}

interface LanguageContribution {
  id: string;
  name: string;
  aliases: string[];
  extensions: string[];
  filenames: string[];
  configuration?: string;
}

interface LoadedLanguageContribution {
  id: string;
  name: string;
  aliases: string[];
  extensions: string[];
  filenames: string[];
  comments: Comments;
}

interface LanguageContributionWithGrammars extends LoadedLanguageContribution {
  scope: string;
  path: string;
}

const transformLanguageConfiguration = ({
  comments: { blockComment, lineComment },
}: LanguageConfiguration): Comments => {
  return {
    blockComment,
    lineComment,
  };
};

interface Comments {
  blockComment?: string[2];
  lineComment?: string;
}

// used for comment directives
interface LanguageConfiguration {
  comments: Comments;
}

interface GrammarContribution {
  language: string;
  // TextMate scope
  scopeName: string;
  // TextMate grammar (relative path)
  path: string;
}

interface ThemeContribution {
  label: string;
  path: string;
  uiTheme: string;
  id?: string;
}

const transformPackage = ({ name, contributes }: RawPackage): Package => {
  const { languages = [], grammars = [], themes = [] } = contributes || {};
  return {
    name,
    languages,
    grammars,
    themes,
  };
};

interface RawPackage {
  name: string;
  contributes?: {
    languages?: RawLanguageContribution[];
    grammars?: GrammarContribution[];
    themes?: ThemeContribution[];
  };
}

interface Package {
  name: string;
  languages: RawLanguageContribution[];
  grammars: GrammarContribution[];
  themes: ThemeContribution[];
}

interface LoadedExtension {
  scopes: { [scope: string]: string };
}

const load = async (
  extension: string,
  data: string
): Promise<LoadedExtension> => {
  try {
    // read package.json
    const packageJson = await readJson<RawPackage, Package>(
      resolvePath(extension, "package.json"),
      transformPackage
    );
    // load language configuration json
    // TODO: link (e.g. when configuration is undefined)
    /*
    {
      id: 'jsonc',
      name: 'jsonc',
      aliases: [],
      extensions: [],
      filenames: [ 'tsconfig.json', 'jsconfig.json' ],
      configuration: undefined
    }
    */
    const languages = await Promise.all(
      packageJson.languages
        .map(transformLanguageContribution)
        .map(async ({ configuration, ...language }) => ({
          ...language,
          comments: configuration
            ? await readJson<LanguageConfiguration, Comments>(
                resolvePath(extension, configuration),
                transformLanguageConfiguration
              )
            : {},
        }))
    );
    const languagesById = languages.reduce((all, current) => {
      all[current.id] = current;
      return all;
    }, {} as { [id: string]: LoadedLanguageContribution });
    // add to languages by id
    // TODO: embedded languages
    const grammars = packageJson.grammars;
    await Promise.all(
      grammars.map((grammar) =>
        copy(resolvePath(extension, grammar.path), "grammars")
      )
    );
    const scopesByName = grammars.reduce(
      (scopes, { scopeName: scope, path }) => {
        // keep as relative paths for redistrobution
        scopes[scope] = relative(
          __dirname,
          resolvePath(__dirname, "../data", "grammars", basename(path))
        );
        return scopes;
      },
      {} as {
        [name: string]: string;
      }
    );
    const themes = packageJson.themes;
    await Promise.all(
      themes.map((theme) => copy(resolvePath(extension, theme.path), "themes"))
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

    return { scopes: scopesByName };
  } catch (e) {
    warn(error, yellow(e));
    return { scopes: {} };
  }
};

export { load };