import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

/**
 * Safely loads a configuration file from disk.
 * Returns an empty object if the file doesn't exist or can't be parsed.
 */
export function safelyLoadConfig(filePath: string): any {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`Failed to load config from ${filePath}:`, error);
  }
  return {};
}

/**
 * Safely saves a configuration file to disk.
 * Creates any necessary parent directories.
 */
export function safelySaveConfig(filePath: string, config: any): boolean {
  try {
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Failed to save config to ${filePath}:`, error);
    return false;
  }
}

/**
 * Ensures a configuration object has the required structure for core properties.
 * Adds missing properties with default values.
 */
export function ensureConfigStructure(config: any): any {
  // Clone the object to avoid modifying the original
  const safedConfig = { ...config };

  // Ensure contextProviders is an array
  if (!safedConfig.contextProviders || !Array.isArray(safedConfig.contextProviders)) {
    safedConfig.contextProviders = [];
  }

  // Ensure at least one default context provider exists
  if (safedConfig.contextProviders.length === 0) {
    safedConfig.contextProviders.push({
      name: "file-context",
      priority: 2
    });
  }

  // Ensure indexing is enabled
  safedConfig.indexingEnabled = safedConfig.indexingEnabled !== false;
  safedConfig.disableIndexing = false;

  // Ensure codebaseConfigurations exists and is properly structured
  if (!safedConfig.codebaseConfigurations || !Array.isArray(safedConfig.codebaseConfigurations)) {
    safedConfig.codebaseConfigurations = [{
      name: "Current Project",
      rootPath: "${workspaceRoot}",
      ignore: ["node_modules", ".git", "dist", "build", "out"],
      include: ["**/*"]
    }];
  }

  return safedConfig;
}

/**
 * Gets the workspace state for the extension, with fallback values.
 */
export function getExtensionState(context: vscode.ExtensionContext, key: string, defaultValue: any): any {
  try {
    return context.workspaceState.get(key) ?? defaultValue;
  } catch (error) {
    console.error(`Failed to get workspace state for ${key}:`, error);
    return defaultValue;
  }
}
