import * as vscode from "vscode";

/**
 * This is a fallback theme object when the theme conversion fails
 */
export const DEFAULT_THEME = {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {}
};

/**
 * Safely wraps the theme object to provide fallbacks for any missing properties
 */
export function getSafeTheme(theme: any) {
  // If theme is null or undefined, return the default theme
  if (!theme) {
    console.log("Theme is null or undefined, using default theme");
    return DEFAULT_THEME;
  }

  // Ensure theme.rules exists and is an array
  if (!theme.rules || !Array.isArray(theme.rules)) {
    console.log("Theme rules are missing or not an array, using empty array");
    theme.rules = [];
  }

  // Ensure theme.colors exists
  if (!theme.colors) {
    console.log("Theme colors are missing, using empty object");
    theme.colors = {};
  }

  // Ensure theme.base is a string
  if (!theme.base) {
    theme.base = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? "vs" : "vs-dark";
  }

  return theme;
}

/**
 * Get the current theme type as a string
 */
export function getThemeType() {
  switch (vscode.window.activeColorTheme.kind) {
    case vscode.ColorThemeKind.Light:
      return 'light';
    case vscode.ColorThemeKind.Dark:
      return 'dark';
    case vscode.ColorThemeKind.HighContrast:
      return 'high-contrast';
    case vscode.ColorThemeKind.HighContrastLight:
      return 'high-contrast-light';
    default:
      return 'dark'; // Default to dark if unknown
  }
}
