import * as fs from "node:fs";
import * as path from "node:path";
import mergeJson from "../../../../core/util/merge.js";
import { convertTheme } from "monaco-vscode-textmate-theme-converter/lib/cjs";
import * as vscode from "vscode";
import { getExtensionUri } from "./vscode";
import { DEFAULT_THEME, getSafeTheme } from "./themeHelper";

const builtinThemes: any = {
  "Default Dark Modern": "dark_modern",
  "Dark+": "dark_plus",
  "Default Dark+": "dark_plus",
  "Dark (Visual Studio)": "dark_vs",
  "Visual Studio Dark": "dark_vs",
  "Dark High Contrast": "hc_black",
  "Default High Contrast": "hc_black",
  "Light High Contrast": "hc_light",
  "Default High Contrast Light": "hc_light",
  "Default Light Modern": "light_modern",
  "Light+": "light_plus",
  "Default Light+": "light_plus",
  "Light (Visual Studio)": "light_vs",
  "Visual Studio Light": "light_vs",
};

function parseThemeString(themeString: string | undefined): any {
  try {
    themeString = themeString
      ?.split("\n")
      .filter((line) => {
        return !line.trim().startsWith("//");
      })
      .join("\n");
    return JSON.parse(themeString ?? "{}");
  } catch (e) {
    console.log("Error parsing theme string: ", e);
    return {};
  }
}

export function getTheme() {
  let currentTheme = undefined;
  const colorTheme =
    vscode.workspace.getConfiguration("workbench").get<string>("colorTheme") ||
    "Default Dark Modern";

  try {
    // Pass color theme to webview for syntax highlighting
    for (let i = vscode.extensions.all.length - 1; i >= 0; i--) {
      if (currentTheme) {
        break;
      }
      const extension = vscode.extensions.all[i];
      if (extension.packageJSON?.contributes?.themes?.length > 0) {
        for (const theme of extension.packageJSON.contributes.themes) {
          if (theme.label === colorTheme) {
            try {
              const themePath = path.join(extension.extensionPath, theme.path);
              currentTheme = fs.readFileSync(themePath).toString();
              break;
            } catch (e) {
              console.log(`Failed to load theme from ${theme.path}: `, e);
            }
          }
        }
      }
    }

    if (currentTheme === undefined && builtinThemes[colorTheme]) {
      const filename = `${builtinThemes[colorTheme]}.json`;
      try {
        currentTheme = fs
          .readFileSync(
            path.join(getExtensionUri().fsPath, "builtin-themes", filename),
          )
          .toString();
      } catch (err) {
        console.log(`Failed to load built-in theme: ${filename}`, err);
        // Use default theme
        currentTheme = "{}";
      }
    }

    // If we still don't have a theme, use a default
    if (currentTheme === undefined) {
      console.log(`No theme found for ${colorTheme}, using default`);
      return DEFAULT_THEME;
    }

    // Strip comments from theme
    let parsed = parseThemeString(currentTheme);

    if (parsed && parsed.include) {
      try {
        const includeThemeString = fs
          .readFileSync(
            path.join(getExtensionUri().fsPath, "builtin-themes", parsed.include),
          )
          .toString();
        const includeTheme = parseThemeString(includeThemeString);
        parsed = mergeJson(parsed, includeTheme);
      } catch (err) {
        console.log(`Failed to load included theme: ${parsed.include}`, err);
      }
    }

    try {
      // Safely convert the theme with error handling
      if (!parsed || typeof parsed !== 'object') {
        console.log("Theme parsing failed, using default theme");
        return DEFAULT_THEME;
      }

      const converted = convertTheme(parsed);
      return getSafeTheme(converted);
    } catch (e) {
      console.log("Error converting color theme: ", e);
      return DEFAULT_THEME;
    }
  } catch (e) {
    console.log("Error loading color theme: ", e);
    return DEFAULT_THEME;
  }
}

export { getThemeType } from "./themeHelper";
