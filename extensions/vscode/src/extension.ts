/**
 * This is the entry point for the extension.
 *
 * Note: This file has been significantly modified from its original contents. pearai-submodule is a fork of Continue (https://github.com/continuedev/continue).
 */

import { setupCa } from "core/util/ca";
import { Telemetry } from "core/util/posthog";
import * as vscode from "vscode";
import { getExtensionVersion } from "./util/util";
import { safelyLoadConfig, safelySaveConfig, ensureConfigStructure } from "./util/configSafety";
import path from "path";
import os from "os";

async function dynamicImportAndActivate(context: vscode.ExtensionContext) {
  const { activateExtension } = await import("./activation/activate");
  try {
    return activateExtension(context);
  } catch (e) {
    console.log("Error activating extension: ", e);
    vscode.window
      .showInformationMessage(
        "Error activating the Dropstone extension.",
        "View Logs",
        "Retry",
      )
      .then((selection) => {
        if (selection === "View Logs") {
          vscode.commands.executeCommand("pearai.viewLogs");
        } else if (selection === "Retry") {
          // Reload VS Code window
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
  }
}

export async function activate(context: vscode.ExtensionContext) {
  // Safety check for configuration files
  const configPath = path.join(os.homedir(), ".dropstone", "config.json");
  let config = safelyLoadConfig(configPath);
  config = ensureConfigStructure(config);
  safelySaveConfig(configPath, config);

  // Check .dropstonerc.json in workspace root if exists
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const rcPath = path.join(workspaceRoot, ".dropstonerc.json");
    let rcConfig = safelyLoadConfig(rcPath);
    if (Object.keys(rcConfig).length > 0) {
      rcConfig = ensureConfigStructure(rcConfig);
      safelySaveConfig(rcPath, rcConfig);
    }
  }

  setupCa();
  dynamicImportAndActivate(context);
}

export function deactivate() {
  Telemetry.capture(
    "deactivate",
    {
      extensionVersion: getExtensionVersion(),
    },
    true,
  );

  Telemetry.shutdownPosthogClient();
}
