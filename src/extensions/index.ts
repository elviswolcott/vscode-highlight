import { readJson, copyEntry, dataBlock } from "../data";
import { resolve as resolvePath, basename, dirname, relative } from "path";
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

export interface CompleteLanguageContribution
  extends LoadedLanguageContribution {
  scope: string;
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
  tokenTypes?: { [type: string]: string };
  embeddedLanguages?: { [language: string]: string };
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
  themes: { [scope: string]: string };
  languages: { [language: string]: LoadedLanguageContribution };
  languageScopes: { [language: string]: string };
}

const load = async (
  extension: string,
  dataPath: string
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
    // TODO: embedded languages?
    const languagesById = languages.reduce((all, current) => {
      all[current.id] = current;
      return all;
    }, {} as { [id: string]: LoadedLanguageContribution });
    const grammars = packageJson.grammars;
    await Promise.all(
      grammars.map((grammar) =>
        copyEntry(
          resolvePath(extension, grammar.path),
          dataBlock(dataPath, "grammars")
        )
      )
    );
    const scopesByName = grammars.reduce(
      (scopes, { scopeName: scope, path }) => {
        // keep as relative paths for redistrobution
        scopes[scope] = relative(
          dataPath,
          resolvePath(dataPath, "grammars", basename(path))
        );
        return scopes;
      },
      {} as {
        [name: string]: string;
      }
    );
    const scopesByLanguage = grammars.reduce(
      (scopes, { language, scopeName: scope }) => {
        scopes[language] = scope;
        return scopes;
      },
      {} as {
        [language: string]: string;
      }
    );
    const themes = packageJson.themes;
    await Promise.all(
      themes.map((theme) =>
        copyEntry(
          resolvePath(extension, theme.path),
          dataBlock(dataPath, "themes")
        )
      )
    );
    // copy included (referenced) themes
    await Promise.all(
      themes.map(async (theme) => {
        const content = await readJson<{ include?: string }>(
          resolvePath(extension, theme.path)
        );
        if (content.include) {
          await copyEntry(
            resolvePath(extension, dirname(theme.path), content.include),
            dataBlock(dataPath, "themes")
          );
        }
      })
    );
    const themesByName = themes.reduce(
      (themes, { label: name, path }) => {
        // keep as relative paths for redistrobution
        themes[name] = relative(
          dataPath,
          resolvePath(dataPath, "themes", basename(path))
        );
        return themes;
      },
      {} as {
        [name: string]: string;
      }
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
      scopes: scopesByName,
      themes: themesByName,
      languages: languagesById,
      languageScopes: scopesByLanguage,
    };
  } catch (e) {
    warn(error, yellow(e));
    return { scopes: {}, themes: {}, languages: {}, languageScopes: {} };
  }
};

export { load };
