/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License in the vscoe directory for license information.
 *--------------------------------------------------------------------------------------------*/

// adpated from https://github.com/andrewbranch/gatsby-remark-vscode/blob/bd95106ff71943c6a6a9d7e263aed27d49ac1b1d/lib/vscode/colorThemeData.js

import { extname, dirname, join as joinPath } from "path";
import { readFileSync } from "fs";
import { parse as parseJson } from "json5";
import { parse as parsePlist } from "plist";

const settingToColorIdMapping = {
  background: ["editor.background"],
  foreground: ["editor.foreground"],
} as { [key: string]: string[] };

interface Rule {
  name?: string;
  scope?: string | string[];
  settings: { [id: string]: string };
}

interface ColorMap {
  [id: string]: string;
}

const convertSettings = (
  oldSettings: Rule[],
  resultRules: Rule[],
  resultColors: ColorMap
): void => {
  for (const rule of oldSettings) {
    resultRules.push(rule);
    if (!rule.scope) {
      const settings = rule.settings;
      if (!settings) {
        rule.settings = {};
      } else {
        for (const key in settings) {
          const mappings = settingToColorIdMapping[key];
          if (mappings) {
            const colorHex = settings[key];
            if (typeof colorHex === "string") {
              for (const colorId of mappings) {
                resultColors[colorId] = colorHex;
              }
            }
          }
          if (
            key !== "foreground" &&
            key !== "background" &&
            key !== "fontStyle"
          ) {
            delete settings[key];
          }
        }
      }
    }
  }
};

const loadSyntaxTokens = (
  themeLocation: string,
  resultRules: Rule[],
  resultColors: ColorMap
): void => {
  const content = readFileSync(themeLocation, "utf8");
  /** @type {any} */
  const contentValue = parsePlist(content) as { settings: Rule[] | unknown };
  const settings = contentValue.settings;
  if (!Array.isArray(settings)) {
    throw new Error(
      `Problem parsing tmTheme file: ${themeLocation}. 'settings' is not array.`
    );
  }
  convertSettings(settings, resultRules, resultColors);
};

const loadRawTheme = (
  themeLocation: string,
  resultRules = [] as Rule[],
  resultColors = {} as ColorMap
): { resultRules: Rule[]; resultColors: ColorMap } => {
  // load json files using json5
  if (extname(themeLocation) === ".json") {
    const content = readFileSync(themeLocation, "utf8");
    const contentValue = parseJson(content) as {
      settings?: Rule[];
      include?: string;
      name?: string;
      colors: ColorMap | number;
      tokenColors: Rule[] | string;
    };
    // load referenced themes
    if (contentValue.include) {
      loadRawTheme(
        joinPath(dirname(themeLocation), contentValue.include),
        resultRules,
        resultColors
      );
    }

    if (Array.isArray(contentValue.settings)) {
      convertSettings(contentValue.settings, resultRules, resultColors);
    } else {
      const colors = contentValue.colors;
      if (colors) {
        if (typeof colors !== "object") {
          throw new Error(
            `Problem parsing color theme file: ${themeLocation}. Property 'colors' is not of type 'object'.`
          );
        }
        // new JSON color themes format
        for (const colorId in colors) {
          const colorHex = colors[colorId];
          if (typeof colorHex === "string") {
            // ignore colors that are null
            resultColors[colorId] = colors[colorId];
          }
        }
      }
      const tokenColors = contentValue.tokenColors;
      if (tokenColors) {
        if (Array.isArray(tokenColors)) {
          resultRules.push(...tokenColors);
        } else if (typeof tokenColors === "string") {
          loadSyntaxTokens(
            joinPath(dirname(themeLocation), tokenColors),
            resultRules,
            {}
          );
        } else {
          throw new Error(
            `Problem parsing color theme file: ${themeLocation}. Property 'tokenColors' should be either an array specifying colors or a path to a TextMate theme file`
          );
        }
      }
    }
  } else {
    loadSyntaxTokens(themeLocation, resultRules, resultColors);
  }

  return { resultRules, resultColors };
};

const load = (path: string): { settings: Rule[]; resultColors: ColorMap } => {
  const { resultRules: rules, resultColors: colors } = loadRawTheme(path);
  const defaultTokenColors = {
    settings: {
      foreground: colors["editor.foreground"] || colors.foreground,
      background: colors["editor.background"] || colors.background,
    },
  } as Rule;
  return {
    settings: [defaultTokenColors, ...rules],
    resultColors: colors,
  };
};

export { load, loadRawTheme };
