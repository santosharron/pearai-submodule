// Note: This file has been modified significantly from its original contents. New commands have been added, and there has been renaming from Continue to PearAI. dropstone-submodule is a fork of Continue (https://github.com/continuedev/continue).

import { IContextProvider } from "core";
import { ConfigHandler } from "core/config/ConfigHandler";
import { Core } from "core/core";
import { FromCoreProtocol, ToCoreProtocol } from "core/protocol";
import { InProcessMessenger } from "core/util/messenger";
import { getConfigJsonPath, getConfigTsPath } from "core/util/paths";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";
import { ContinueCompletionProvider } from "../autocomplete/completionProvider";
import {
  monitorBatteryChanges,
  setupStatusBar,
  StatusBarStatus,
} from "../autocomplete/statusBar";
import { registerAllCommands } from "../commands";
import { ContinueGUIWebviewViewProvider } from "../ContinueGUIWebviewViewProvider";
import { registerDebugTracker } from "../debug/debug";
import { DiffManager } from "../diff/horizontal";
import { VerticalPerLineDiffManager } from "../diff/verticalPerLine/manager";
import { VsCodeIde } from "../ideProtocol";
import { registerAllCodeLensProviders } from "../lang-server/codeLens";
import { QuickEdit } from "../quickEdit/QuickEditQuickPick";
import { setupRemoteConfigSync } from "../stubs/activation";
import {
  getControlPlaneSessionInfo,
  WorkOsAuthProvider,
} from "../stubs/WorkOsAuthProvider";
import { Battery } from "../util/battery";
import { TabAutocompleteModel } from "../util/loadAutocompleteModel";
import type { VsCodeWebviewProtocol } from "../webviewProtocol";
import { VsCodeMessenger } from "./VsCodeMessenger";
import { PEARAI_CHAT_VIEW_ID, PEARAI_MEM0_VIEW_ID, PEARAI_SEARCH_VIEW_ID } from "../util/pearai/pearaiViewTypes";

export class VsCodeExtension {
  // Currently some of these are public so they can be used in testing (test/test-suites)

  private configHandler: ConfigHandler;
  private extensionContext: vscode.ExtensionContext;
  private ide: VsCodeIde;
  private tabAutocompleteModel: TabAutocompleteModel;
  private sidebar: ContinueGUIWebviewViewProvider;
  private windowId: string;
  private diffManager: DiffManager;
  private verticalDiffManager: VerticalPerLineDiffManager;
  webviewProtocolPromise: Promise<VsCodeWebviewProtocol>;
  private core: Core;
  private battery: Battery;
  private workOsAuthProvider: WorkOsAuthProvider;

  constructor(context: vscode.ExtensionContext) {
    // Register auth provider
    this.workOsAuthProvider = new WorkOsAuthProvider(context);
    this.workOsAuthProvider.initialize();
    context.subscriptions.push(this.workOsAuthProvider);

    let resolveWebviewProtocol: any = undefined;
    this.webviewProtocolPromise = new Promise<VsCodeWebviewProtocol>(
      (resolve) => {
        resolveWebviewProtocol = resolve;
      },
    );
    this.diffManager = new DiffManager(context);
    this.ide = new VsCodeIde(this.diffManager, this.webviewProtocolPromise);
    this.extensionContext = context;
    this.windowId = uuidv4();

    // Dependencies of core
    let resolveVerticalDiffManager: any = undefined;
    const verticalDiffManagerPromise = new Promise<VerticalPerLineDiffManager>(
      (resolve) => {
        resolveVerticalDiffManager = resolve;
      },
    );
    let resolveConfigHandler: any = undefined;
    const configHandlerPromise = new Promise<ConfigHandler>((resolve) => {
      resolveConfigHandler = resolve;
    });

    this.sidebar = new ContinueGUIWebviewViewProvider(
      configHandlerPromise,
      this.windowId,
      this.extensionContext,
    );

    // Sidebar + Overlay
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        PEARAI_CHAT_VIEW_ID,
        this.sidebar,
        {
          webviewOptions: { retainContextWhenHidden: true },
        },
      ),
    );

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        PEARAI_SEARCH_VIEW_ID,
        this.sidebar,
        {
          webviewOptions: { retainContextWhenHidden: true },
        },
      ),
    );

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        PEARAI_MEM0_VIEW_ID,
        this.sidebar,
        {
          webviewOptions: { retainContextWhenHidden: true },
        },
      ),
    );

    resolveWebviewProtocol(this.sidebar.webviewProtocol);

    // Config Handler with output channel
    const outputChannel = vscode.window.createOutputChannel("PearAI");
    const inProcessMessenger = new InProcessMessenger<
      ToCoreProtocol,
      FromCoreProtocol
    >();

    new VsCodeMessenger(
      inProcessMessenger,
      this.sidebar.webviewProtocol,
      this.ide,
      verticalDiffManagerPromise,
      configHandlerPromise,
      this.workOsAuthProvider,
    );

    this.core = new Core(inProcessMessenger, this.ide, async (log: string) => {
      outputChannel.appendLine(
        "==========================================================================",
      );
      outputChannel.appendLine(
        "==========================================================================",
      );
      outputChannel.append(log);
    });
    this.configHandler = this.core.configHandler;
    resolveConfigHandler?.(this.configHandler);

    this.configHandler.reloadConfig();
    this.verticalDiffManager = new VerticalPerLineDiffManager(
      this.configHandler,
    );
    resolveVerticalDiffManager?.(this.verticalDiffManager);
    this.tabAutocompleteModel = new TabAutocompleteModel(this.configHandler);

    setupRemoteConfigSync(
      this.configHandler.reloadConfig.bind(this.configHandler),
    );

    // handleURI
    // This is the entry point when user signs in from web app
    context.subscriptions.push(
      vscode.window.registerUriHandler({
        handleUri(uri: vscode.Uri) {
          console.log(uri);
          console.log("Received a custom URI!");
          if (uri.authority === "dropstone.pearai") {
            if (uri.path === "/ping") {
              vscode.window.showInformationMessage(
                "PearAI received a custom URI!",
              );
            } else if (uri.path === "/auth") {
              const queryParams = new URLSearchParams(uri.query);
              const data = {
                accessToken: queryParams.get("accessToken"),
                refreshToken: queryParams.get("refreshToken"),
                fromLogin: true,
              };
              vscode.commands.executeCommand("dropstone.updateUserAuth", data);
            }
          }
        },
      }),
    );

    // Indexing + pause token
    this.diffManager.webviewProtocol = this.sidebar.webviewProtocol;

    this.configHandler.loadConfig().then((config) => {
      const { verticalDiffCodeLens } = registerAllCodeLensProviders(
        context,
        this.diffManager,
        this.verticalDiffManager.filepathToCodeLens,
        config,
      );

      this.verticalDiffManager.refreshCodeLens =
        verticalDiffCodeLens.refresh.bind(verticalDiffCodeLens);
    });

    this.configHandler.onConfigUpdate((newConfig) => {
      this.sidebar.webviewProtocol?.request("configUpdate", undefined);

      this.tabAutocompleteModel.clearLlm();

      registerAllCodeLensProviders(
        context,
        this.diffManager,
        this.verticalDiffManager.filepathToCodeLens,
        newConfig,
      );
    });

    // Tab autocomplete
    const config = vscode.workspace.getConfiguration("pearai");
    const enabled = config.get<boolean>("enableTabAutocomplete");

    // Listen for configuration changes that affect authentication
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("dropstone.dropstoneApiKey")) {
        // Reload config when dropstoneApiKey changes
        this.configHandler.reloadConfig();
      }
    });

    // Register inline completion provider
    setupStatusBar(
      enabled ? StatusBarStatus.Enabled : StatusBarStatus.Disabled,
    );
    context.subscriptions.push(
      vscode.languages.registerInlineCompletionItemProvider(
        [{ pattern: "**" }],
        new ContinueCompletionProvider(
          this.configHandler,
          this.ide,
          this.tabAutocompleteModel,
        ),
      ),
    );

    // Battery
    this.battery = new Battery();
    context.subscriptions.push(this.battery);
    context.subscriptions.push(monitorBatteryChanges(this.battery));

    const quickEdit = new QuickEdit(
      this.verticalDiffManager,
      this.configHandler,
      this.sidebar.webviewProtocol,
      this.ide,
      context,
    );

    // Commands
    registerAllCommands(
      context,
      this.ide,
      context,
      this.sidebar,
      this.configHandler,
      this.diffManager,
      this.verticalDiffManager,
      this.core.continueServerClientPromise,
      this.battery,
      quickEdit,
      this.core,
    );

    registerDebugTracker(this.sidebar.webviewProtocol, this.ide);

    // Listen for file saving - use global file watcher so that changes
    // from outside the window are also caught
    fs.watchFile(getConfigJsonPath(), { interval: 1000 }, async (stats) => {
      await this.configHandler.reloadConfig();
    });

    fs.watchFile(getConfigTsPath(), { interval: 1000 }, (stats) => {
      this.configHandler.reloadConfig();
    });

    // Create a file system watcher
    const watcher = vscode.workspace.createFileSystemWatcher(
      "**/*",
      false,
      false,
      false,
    );

    // Handle file creation
    watcher.onDidCreate((uri) => {
      this.refreshContextProviders();
    });

    // Handle file deletion
    watcher.onDidDelete((uri) => {
      this.refreshContextProviders();
    });

    context.subscriptions.push(watcher);

    vscode.workspace.onDidSaveTextDocument(async (event) => {
      // Listen for file changes in the workspace
      const filepath = event.uri.fsPath;

      if (filepath === getConfigJsonPath()) {
        // Trigger a toast notification to provide UI feedback that config
        // has been updated
        const showToast = context.globalState.get<boolean>(
          "showConfigUpdateToast",
          true,
        );
        if (showToast) {
          vscode.window
            .showInformationMessage("Config updated", "Don't show again")
            .then((selection) => {
              if (selection === "Don't show again") {
                context.globalState.update("showConfigUpdateToast", false);
              }
            });
        }
      }

      if (filepath.endsWith(".pearairc.json") || filepath.endsWith(".prompt")) {
        this.configHandler.reloadConfig();
      } else if (
        filepath.endsWith(".pearaiignore") ||
        filepath.endsWith(".gitignore")
      ) {
        // Reindex the workspaces
        this.core.invoke("index/forceReIndex", undefined);
      } else {
        // Reindex the file
        const indexer = await this.core.codebaseIndexerPromise;
        indexer.refreshFile(filepath);
      }
    });

    // When GitHub sign-in status changes, reload config
    vscode.authentication.onDidChangeSessions(async (e) => {
      if (e.provider.id === "github") {
        this.configHandler.reloadConfig();
      } else if (e.provider.id === "dropstone") {
        const sessionInfo = await getControlPlaneSessionInfo(true);
        this.webviewProtocolPromise.then(async (webviewProtocol) => {
          webviewProtocol.request("didChangeControlPlaneSessionInfo", {
            sessionInfo,
          });

          // To make sure continue-proxy models and anything else requiring it get updated access token
          this.configHandler.reloadConfig();
        });
        this.core.invoke("didChangeControlPlaneSessionInfo", { sessionInfo });
      }
    });

    // Refresh index when branch is changed
    this.ide.getWorkspaceDirs().then((dirs) =>
      dirs.forEach(async (dir) => {
        const repo = await this.ide.getRepo(vscode.Uri.file(dir));
        if (repo) {
          repo.state.onDidChange(() => {
            // args passed to this callback are always undefined, so keep track of previous branch
            const currentBranch = repo?.state?.HEAD?.name;
            if (currentBranch) {
              if (this.PREVIOUS_BRANCH_FOR_WORKSPACE_DIR[dir]) {
                if (
                  currentBranch !== this.PREVIOUS_BRANCH_FOR_WORKSPACE_DIR[dir]
                ) {
                  // Trigger refresh of index only in this directory
                  this.core.invoke("index/forceReIndex", { dir });
                }
              }

              this.PREVIOUS_BRANCH_FOR_WORKSPACE_DIR[dir] = currentBranch;
            }
          });
        }
      }),
    );

    // Register a content provider for the readonly virtual documents
    const documentContentProvider = new (class
      implements vscode.TextDocumentContentProvider
    {
      // emitter and its event
      onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
      onDidChange = this.onDidChangeEmitter.event;

      provideTextDocumentContent(uri: vscode.Uri): string {
        return uri.query;
      }
    })();
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        VsCodeExtension.continueVirtualDocumentScheme,
        documentContentProvider,
      ),
    );

    vscode.workspace.onDidCloseTextDocument(async () => {
      const openFiles = vscode.workspace.textDocuments;
      if (openFiles.length === 1) {
        // the count is amount of last open files
        this.sidebar.webviewProtocol.request("setActiveFilePath", "", [PEARAI_CHAT_VIEW_ID]);
      }
    });

    this.ide.onDidChangeActiveTextEditor((filepath) => {
      this.core.invoke("didChangeActiveTextEditor", { filepath });
      this.sidebar.webviewProtocol.request("setActiveFilePath", filepath, [PEARAI_CHAT_VIEW_ID]);
    });

    this.updateNewWindowActiveFilePath();
  }

  static continueVirtualDocumentScheme = "pearai";

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private PREVIOUS_BRANCH_FOR_WORKSPACE_DIR: { [dir: string]: string } = {};

  private async refreshContextProviders() {
    this.sidebar.webviewProtocol.request("refreshSubmenuItems", undefined); // Refresh all context providers
  }

  private async updateNewWindowActiveFilePath() {
    const currentFile = await this.ide.getCurrentFile();
    this.sidebar.webviewProtocol?.request("setActiveFilePath", currentFile, [PEARAI_CHAT_VIEW_ID]);
  }

  registerCustomContextProvider(contextProvider: IContextProvider) {
    this.configHandler.registerCustomContextProvider(contextProvider);
  }
}
