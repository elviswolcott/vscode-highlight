import { RawLanguageContribution } from "./languages";
import { RawGrammarContribution } from "./grammars";
import { RawThemeContribution } from "./themes";
import { readJson } from "../data";
import { resolve as resolvePath } from "path";

export const transform = ({ name, contributes }: RawPackage): Package => {
  const { languages = [], grammars = [], themes = [] } = contributes || {};
  return {
    name,
    languages,
    grammars,
    themes,
  };
};

export const load = async (
  extension: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  dataPath: string
): Promise<Package> => {
  const packageJSON = await readJson<RawPackage, Package>(
    resolvePath(extension, "package.json"),
    transform
  );
  return packageJSON;
};

export interface RawPackage {
  name: string;
  contributes?: {
    languages?: RawLanguageContribution[];
    grammars?: RawGrammarContribution[];
    themes?: RawThemeContribution[];
  };
}

export interface Package {
  name: string;
  languages: RawLanguageContribution[];
  grammars: RawGrammarContribution[];
  themes: RawThemeContribution[];
}
