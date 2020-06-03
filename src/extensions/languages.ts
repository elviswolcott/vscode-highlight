import { readJson } from "../data";
import { resolve as resolvePath } from "path";
import { LUT, IndexMap } from "../utils";

export interface RawLanguageContribution {
  // match to GrammarContribution.language
  id: string;
  // first alias can be used for display
  aliases?: string[];
  extensions?: string[];
  filenames?: string[];
  // LanguageConfiguration (relative path)
  configuration?: string;
}

export interface Language {
  id: string;
  name: string;
  aliases: string[];
  extensions: string[];
  filenames: string[];
  comments: Comments;
}

export interface Comments {
  blockComment?: string[2];
  lineComment?: string;
}

// used for comment directives
interface LanguageConfiguration {
  comments: Comments;
}

const loadComments = ({
  comments: { blockComment, lineComment },
}: LanguageConfiguration): Comments => {
  return {
    blockComment,
    lineComment,
  };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const load = (extension: string, dataPath: string) => async ({
  id,
  aliases: rawAliases,
  extensions = [],
  filenames = [],
  configuration,
}: RawLanguageContribution): Promise<Language> => {
  const [name = id, ...aliases] = rawAliases || [];
  const comments = configuration
    ? await readJson<LanguageConfiguration, Comments>(
        resolvePath(extension, configuration),
        loadComments
      )
    : {};
  return {
    id,
    name,
    aliases,
    extensions,
    filenames,
    comments,
  };
};

const merge = (a: Language, b: Language): Language => ({
  id: a.id,
  name: a.name === a.id ? b.name : a.name,
  aliases: a.aliases.concat(b.aliases),
  extensions: a.extensions.concat(b.extensions),
  filenames: a.filenames.concat(a.filenames),
  comments: { ...a.comments, ...b.comments },
});

export interface RegisteredLanguage extends Language {
  index: number;
}

export const register = (start: number) => (
  all: LUT<RegisteredLanguage>,
  language: Language,
  index: number
): LUT<RegisteredLanguage> => {
  // when there are multiple languages with the same id, they need to be merged
  const merged = all.hasOwnProperty(language.id)
    ? merge(all[language.id], language)
    : language;
  all[language.id] = {
    ...merged,
    index: index + start,
  };
  return all;
};

export const registerIndex = (
  all: IndexMap,
  language: RegisteredLanguage
): IndexMap => {
  all[language.index] = language.id;
  return all;
};
