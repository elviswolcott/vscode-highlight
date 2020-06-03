import { readJson, dataBlock, copyEntry, portable } from "../data";
import { dirname, resolve as resolvePath } from "path";
import { LUT } from "../utils";

export const load = (extension: string, dataPath: string) => async (
  theme: RawThemeContribution
): Promise<Theme> => {
  const path = await copyEntry(
    resolvePath(extension, theme.path),
    dataBlock(dataPath, "themes")
  );
  const content = await readJson<{ include?: string }>(
    resolvePath(extension, theme.path)
  );
  if (content.include) {
    // TODO: check how this path needs to be updated
    await copyEntry(
      resolvePath(extension, dirname(theme.path), content.include),
      dataBlock(dataPath, "themes")
    );
  }
  return {
    ...theme,
    path: portable(path),
  };
};

export const register = (all: LUT<Theme>, theme: Theme): LUT<Theme> => {
  all[theme.label] = theme;
  return all;
};

export interface Theme {
  label: string;
  path: string;
  uiTheme: string;
  id?: string;
}

export type RawThemeContribution = Theme;
