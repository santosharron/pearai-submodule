import * as fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage, ContextItemId, IDE, IndexingProgressUpdate } from ".";
import { CompletionProvider } from "./autocomplete/completionProvider";
import { ConfigHandler } from "./config/ConfigHandler";
import {
  setupApiKeysMode,
  setupFreeTrialMode,
  setupLocalAfterFreeTrial,
  setupLocalMode,
} from "./config/onboarding";
import { createNewPromptFile } from "./config/promptFile";
import { addModel, addOpenAIKey, deleteModel, toggleIntegration } from "./config/util";
import { recentlyEditedFilesCache } from "./context/retrieval/recentlyEditedFilesCache";
import { ContinueServerClient } from "./continueServer/stubs/client";
import { getAuthUrlForTokenPage } from "./control-plane/auth/index";
import { ControlPlaneClient } from "./control-plane/client";
import { CodebaseIndexer, PauseToken } from "./indexing/CodebaseIndexer";
import DocsService from "./indexing/docs/DocsService";
import Ollama from "./llm/llms/Ollama";
import type { FromCoreProtocol, ToCoreProtocol } from "./protocol";
import { GlobalContext } from "./util/GlobalContext";
import { logDevData } from "./util/devdata";
import { DevDataSqliteDb } from "./util/devdataSqlite";
import { fetchwithRequestOptions } from "./util/fetchWithOptions";
import historyManager from "./util/history";
import type { IMessenger, Message } from "./util/messenger";
import { editConfigJson } from "./util/paths";
import { Telemetry } from "./util/posthog";
import { streamDiffLines } from "./util/verticalEdit";
import PearAIServer from "./llm/llms/PearAIServer";


export class Core {
  // implements IMessenger<ToCoreProtocol, FromCoreProtocol>
  configHandler: ConfigHandler;
  codebaseIndexerPromise: Promise<CodebaseIndexer>;
  completionProvider: CompletionProvider;
  continueServerClientPromise: Promise<ContinueServerClient>;
  indexingState: IndexingProgressUpdate;
  controlPlaneClient: ControlPlaneClient;
  private docsService: DocsService;
  private globalContext = new GlobalContext();

  private readonly indexingPauseToken = new PauseToken(
    this.globalContext.get("indexingPaused") === true,
  );

  private abortedMessageIds: Set<string> = new Set();

  private selectedModelTitle: string | undefined;

  private async config() {
    return this.configHandler.loadConfig();
  }

  private async getSelectedModel() {
    return await this.configHandler.llmFromTitle(this.selectedModelTitle);
  }

  invoke<T extends keyof ToCoreProtocol>(
    messageType: T,
    data: ToCoreProtocol[T][0],
  ): ToCoreProtocol[T][1] {
    return this.messenger.invoke(messageType, data);
  }

  send<T extends keyof FromCoreProtocol>(
    messageType: T,
    data: FromCoreProtocol[T][0],
    messageId?: string,
  ): string {
    return this.messenger.send(messageType, data);
  }

  // TODO: It shouldn't actually need an IDE type, because this can happen
  // through the messenger (it does in the case of any non-VS Code IDEs already)
  constructor(
    private readonly messenger: IMessenger<ToCoreProtocol, FromCoreProtocol>,
    private readonly ide: IDE,
    private readonly onWrite: (text: string) => Promise<void> = async () => {},
  ) {
    this.indexingState = { status: "loading", desc: "loading", progress: 0 };

    const ideSettingsPromise = messenger.request("getIdeSettings", undefined);
    const sessionInfoPromise = messenger.request("getControlPlaneSessionInfo", {
      silent: true,
    });

    // Add timeout to IDE settings promise to prevent indefinite hanging
    const ideSettingsWithTimeout = Promise.race([
      ideSettingsPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("IDE settings request timed out after 30 seconds")), 30000)
      )
    ]) as Promise<typeof ideSettingsPromise extends Promise<infer T> ? T : never>;

    this.controlPlaneClient = new ControlPlaneClient(sessionInfoPromise);

    try {
    this.configHandler = new ConfigHandler(
      this.ide,
        ideSettingsWithTimeout,
      this.onWrite,
      this.controlPlaneClient,
    );
    } catch (error) {
      console.error("Error initializing ConfigHandler:", error);
      // Create a fallback minimal config handler or re-throw if critical
      throw new Error(`Failed to initialize configuration system: ${error instanceof Error ? error.message : String(error)}`);
    }

    this.docsService = DocsService.createSingleton(
      this.configHandler,
      this.ide,
      this.messenger,
    );

    this.configHandler.onConfigUpdate(
      (() => this.messenger.send("configUpdate", undefined)).bind(this),
    );

    this.configHandler.onDidChangeAvailableProfiles((profiles) =>
      this.messenger.send("didChangeAvailableProfiles", { profiles }),
    );

    // Codebase Indexer and ContinueServerClient depend on IdeSettings
    let codebaseIndexerResolve: (_: any) => void | undefined;
    this.codebaseIndexerPromise = new Promise(
      async (resolve) => (codebaseIndexerResolve = resolve),
    );

    let continueServerClientResolve: (_: any) => void | undefined;
    this.continueServerClientPromise = new Promise(
      (resolve) => (continueServerClientResolve = resolve),
    );

    ideSettingsWithTimeout.then((ideSettings) => {
      const continueServerClient = new ContinueServerClient(
        ideSettings.remoteConfigServerUrl,
        ideSettings.userToken,
      );

      this.codebaseIndexerPromise = new Promise(async (resolve) => {
        const codebaseIndexer = new CodebaseIndexer(
          this.configHandler,
          this.ide,
          this.indexingPauseToken,
          continueServerClient,
      );
        resolve(codebaseIndexer);
      });

      // Index on initialization
      void this.refreshCodebaseIndex();
    }).catch((error) => {
      console.error("Error getting IDE settings:", error);

      // Set a more specific error state
      const errorState = {
        progress: 0,
        desc: error.message.includes("timeout")
          ? "IDE settings request timed out - retrying..."
          : `Configuration error: ${error.message}`,
        status: "failed" as const,
      };
      this.indexingState = errorState;
      this.messenger.request("indexProgress", errorState);

      // Try to create a fallback codebase indexer with default settings
      try {
        console.log("Attempting to create fallback indexer...");
        this.codebaseIndexerPromise = new Promise(async (resolve) => {
          // Create a minimal continueServerClient for fallback
          const fallbackClient = new ContinueServerClient(
            undefined, // no remote config server
            undefined, // no user token
          );

          const codebaseIndexer = new CodebaseIndexer(
            this.configHandler,
            this.ide,
            this.indexingPauseToken,
            fallbackClient,
          );
          resolve(codebaseIndexer);
        });

        // Try to start indexing with fallback
        setTimeout(() => {
          console.log("Starting fallback indexing...");
          void this.refreshCodebaseIndex();
        }, 2000); // Wait 2 seconds before retrying

      } catch (fallbackError) {
        console.error("Fallback indexer creation failed:", fallbackError);
        this.indexingState = {
          progress: 0,
          desc: "Failed to initialize indexing system",
          status: "failed" as const,
        };
        this.messenger.request("indexProgress", this.indexingState);
      }
    });

    const getLlm = async () => {
      const config = await this.configHandler.loadConfig();
      const selected = this.globalContext.get("selectedTabAutocompleteModel");
      return (
        config.tabAutocompleteModels?.find(
          (model) => model.title === selected,
        ) ?? config.tabAutocompleteModels?.[0]
      );
    };
    this.completionProvider = new CompletionProvider(
      this.configHandler,
      ide,
      getLlm,
      (e) => {},
      (..._) => Promise.resolve([]),
    );

    const on = this.messenger.on.bind(this.messenger);

    this.messenger.onError((err) => {
      console.error(err);
      this.messenger.request("errorPopup", { message: err.message });
    });

    // New
    on("update/modelChange", (msg) => {
      this.selectedModelTitle = msg.data;
    });

    on("update/selectTabAutocompleteModel", async (msg) => {
      this.globalContext.update("selectedTabAutocompleteModel", msg.data);
      this.configHandler.reloadConfig();
    });

    // Special
    on("abort", (msg) => {
      this.abortedMessageIds.add(msg.messageId);
    });

    on("ping", (msg) => {
      if (msg.data !== "ping") {
        throw new Error("ping message incorrect");
      }
      return "pong";
    });

    // History
    on("history/list", (msg) => {
      return historyManager.list(msg.data);
    });

    on("history/delete", (msg) => {
      historyManager.delete(msg.data.id);
    });

    on("history/load", (msg) => {
      return historyManager.load(msg.data.id);
    });

    on("history/save", (msg) => {
      historyManager.save(msg.data);
    });

    // Dev data
    on("devdata/log", (msg) => {
      logDevData(msg.data.tableName, msg.data.data);
    });

    // Edit config
    on("config/addModel", (msg) => {
      const model = msg.data.model;
      addModel(model);
      this.configHandler.reloadConfig();
    });

    on("config/addOpenAiKey", (msg) => {
      addOpenAIKey(msg.data);
      this.configHandler.reloadConfig();
    });

    on("config/deleteModel", (msg) => {
      deleteModel(msg.data.title);
      this.configHandler.reloadConfig();
    });
    on("config/toggleIntegration", (msg) => {
      toggleIntegration(msg.data.name);
      this.configHandler.reloadConfig();
    });

    on("config/newPromptFile", async (msg) => {
      createNewPromptFile(
        this.ide,
        (await this.config()).experimental?.promptPath,
      );
      this.configHandler.reloadConfig();
    });

    on("config/reload", (msg) => {
      this.configHandler.reloadConfig();
      return this.configHandler.getSerializedConfig();
    });

    on("config/ideSettingsUpdate", (msg) => {
      this.configHandler.updateIdeSettings(msg.data);
    });
    on("config/listProfiles", (msg) => {
      return this.configHandler.listProfiles();
    });

    // Context providers
    on("context/addDocs", async (msg) => {
      let hasFailed = false;

      for await (const result of this.docsService.indexAndAdd(msg.data)) {
        if (result.status === "failed") {
          hasFailed = true;
          break;
        }
      }

      if (hasFailed) {
        this.ide.infoPopup(`Failed to index ${msg.data.startUrl}`);
      } else {
        this.ide.infoPopup(`Successfully indexed ${msg.data.startUrl}`);
        this.messenger.send("refreshSubmenuItems", undefined);
      }
    });

    on("context/removeDocs", async (msg) => {
      await this.docsService.delete(msg.data.startUrl);
      this.messenger.send("refreshSubmenuItems", undefined);
    });

    on("context/indexDocs", async (msg) => {
      await this.docsService.indexAllDocs(msg.data.reIndex);
      this.messenger.send("refreshSubmenuItems", undefined);
    });

    on("context/loadSubmenuItems", async (msg) => {
      const config = await this.config();
      const items = await config.contextProviders
        ?.find((provider) => provider.description.title === msg.data.title)
        ?.loadSubmenuItems({
          config,
          ide: this.ide,
          fetch: (url, init) =>
            fetchwithRequestOptions(url, init, config.requestOptions),
        });
      return items || [];
    });

    on("context/getContextItems", async (msg) => {
      const { name, query, fullInput, selectedCode } = msg.data;
      const config = await this.config();
      const llm = await this.getSelectedModel();
      const provider = config.contextProviders?.find(
        (provider) => provider.description.title === name,
      );
      if (!provider) {
        return [];
      }

      try {
        const id: ContextItemId = {
          providerTitle: provider.description.title,
          itemId: uuidv4(),
        };

        const items = await provider.getContextItems(query, {
          config,
          llm,
          embeddingsProvider: config.embeddingsProvider,
          fullInput,
          ide,
          selectedCode,
          reranker: config.reranker,
          fetch: (url, init) =>
            fetchwithRequestOptions(url, init, config.requestOptions),
        });

        Telemetry.capture(
          "useContextProvider",
          {
            name: provider.description.title,
          },
          true,
        );

        return items.map((item) => ({
          ...item,
          id,
        }));
      } catch (e) {
        this.ide.errorPopup(`Error getting context items from ${name}: ${e}`);
        return [];
      }
    });

    on("config/getSerializedProfileInfo", async (msg) => {
      return {
        config: await this.configHandler.getSerializedConfig(),
        profileId: this.configHandler.currentProfile.profileId,
      };
    });

    async function* llmStreamChat(
      configHandler: ConfigHandler,
      abortedMessageIds: Set<string>,
      msg: Message<ToCoreProtocol["llm/streamChat"][0]>,
    ) {
      const model = await configHandler.llmFromTitle(msg.data.title);
      console.log(model)
      const gen = model.streamChat(
        msg.data.messages,
        msg.data.completionOptions,
      );
      let next = await gen.next();
      while (!next.done) {
        if (abortedMessageIds.has(msg.messageId)) {
          abortedMessageIds.delete(msg.messageId);
          next = await gen.return({
            completion: "",
            prompt: "",
            completionOptions: {
              ...msg.data.completionOptions,
              model: model.model,
            },
          });
          break;
        }
        // Assert that next.value is a ChatMessage
        const chatMessage = next.value as ChatMessage;

        yield {
          content: chatMessage.content,
          citations: chatMessage.citations
        };

        next = await gen.next();
      }

      return { done: true, content: next.value };
    }

  on("llm/streamChat", (msg) => {
    return llmStreamChat(this.configHandler, this.abortedMessageIds, msg);
  });


    async function* llmStreamComplete(
      configHandler: ConfigHandler,
      abortedMessageIds: Set<string>,

      msg: Message<ToCoreProtocol["llm/streamComplete"][0]>,
    ) {
      const model = await configHandler.llmFromTitle(msg.data.title);
      const gen = model.streamComplete(
        msg.data.prompt,
        msg.data.completionOptions,
      );
      let next = await gen.next();
      while (!next.done) {
        if (abortedMessageIds.has(msg.messageId)) {
          abortedMessageIds.delete(msg.messageId);
          next = await gen.return({
            completion: "",
            prompt: "",
            completionOptions: {
              ...msg.data.completionOptions,
              model: model.model,
            },
          });
          break;
        }
        yield { content: next.value };
        next = await gen.next();
      }

      return { done: true, content: next.value };
    }

    on("llm/streamComplete", (msg) =>
      llmStreamComplete(this.configHandler, this.abortedMessageIds, msg),
    );

    on("llm/complete", async (msg) => {
      const model = await this.configHandler.llmFromTitle(msg.data.title);
      const completion = await model.complete(
        msg.data.prompt,
        msg.data.completionOptions,
      );
      return completion;
    });

    on("llm/setPearAICredentials", async (msg) => {
      const { accessToken, refreshToken } = msg.data || {};
      const config = await this.configHandler.loadConfig();
      const pearAIModels = config.models.filter(model => model instanceof PearAIServer) as PearAIServer[];

      try {
        if (pearAIModels.length > 0) {
          pearAIModels.forEach(model => {
            model.setPearAIAccessToken(accessToken);
            model.setPearAIRefreshToken(refreshToken);
          });
        }
      } catch (e) {
        console.warn(`Error resetting PearAI credentials: ${e}`);
        return undefined;
      }
    });

    on("llm/checkPearAITokens", async (msg) => {
      const config = await this.configHandler.loadConfig();
      const pearAIModels = config.models.filter(model => model instanceof PearAIServer) as PearAIServer[];
      let tokensEdited = false;
      let accessToken: string | undefined;
      let refreshToken: string | undefined;

      try {
        if (pearAIModels.length > 0) {
          for (const model of pearAIModels) {
            const result = await model.checkAndUpdateCredentials();
            if (result.tokensEdited) {
              tokensEdited = true;
              accessToken = result.accessToken;
              refreshToken = result.refreshToken;
              break; // Use first updated model's tokens
            }
          }
        }
        return { tokensEdited, accessToken, refreshToken };
      } catch (e) {
        console.warn(`Error checking PearAI tokens: ${e}`);
        return { tokensEdited: false };
      }
    });

    on("llm/listModels", async (msg) => {
      const config = await this.configHandler.loadConfig();
      const model =
        config.models.find((model) => model.title === msg.data.title) ??
        config.models.find((model) => model.title?.startsWith(msg.data.title));
      try {
        if (model) {
          return model.listModels();
        } else {
          if (msg.data.title === "Ollama") {
            const models = await new Ollama({ model: "" }).listModels();
            return models;
          } else {
            return undefined;
          }
        }
      } catch (e) {
        console.warn(`Error listing Ollama models: ${e}`);
        return undefined;
      }
    });

    async function* runNodeJsSlashCommand(
      configHandler: ConfigHandler,
      abortedMessageIds: Set<string>,
      msg: Message<ToCoreProtocol["command/run"][0]>,
      messenger: IMessenger<ToCoreProtocol, FromCoreProtocol>,
    ) {
      const {
        input,
        history,
        modelTitle,
        slashCommandName,
        contextItems,
        params,
        historyIndex,
        selectedCode,
      } = msg.data;

      const config = await configHandler.loadConfig();
      const llm = await configHandler.llmFromTitle(modelTitle);
      const slashCommand = config.slashCommands?.find(
        (sc) => sc.name === slashCommandName,
      );
      if (!slashCommand) {
        throw new Error(`Unknown slash command ${slashCommandName}`);
      }

      Telemetry.capture(
        "useSlashCommand",
        {
          name: slashCommandName,
        },
        true,
      );

      const checkActiveInterval = setInterval(() => {
        if (abortedMessageIds.has(msg.messageId)) {
          abortedMessageIds.delete(msg.messageId);
          clearInterval(checkActiveInterval);
        }
      }, 100);

      for await (const content of slashCommand.run({
        input,
        history,
        llm,
        contextItems,
        params,
        ide,
        addContextItem: (item) => {
          messenger.request("addContextItem", {
            item,
            historyIndex,
          });
        },
        selectedCode,
        config,
        fetch: (url, init) =>
          fetchwithRequestOptions(url, init, config.requestOptions),
      })) {
        if (abortedMessageIds.has(msg.messageId)) {
          abortedMessageIds.delete(msg.messageId);
          break;
        }
        if (content) {
          yield { content };
        }
      }
      clearInterval(checkActiveInterval);
      yield { done: true, content: "" };
    }
    on("command/run", (msg) =>
      runNodeJsSlashCommand(
        this.configHandler,
        this.abortedMessageIds,
        msg,
        this.messenger,
      ),
    );

    // Autocomplete
    on("autocomplete/complete", async (msg) => {
      const outcome =
        await this.completionProvider.provideInlineCompletionItems(
          msg.data,
          undefined,
        );
      return outcome ? [outcome.completion] : [];
    });
    on("autocomplete/accept", async (msg) => {});
    on("autocomplete/cancel", async (msg) => {
      this.completionProvider.cancel();
    });

    async function* streamDiffLinesGenerator(
      configHandler: ConfigHandler,
      abortedMessageIds: Set<string>,
      msg: Message<ToCoreProtocol["streamDiffLines"][0]>,
    ) {
      const data = msg.data;
      const llm = await configHandler.llmFromTitle(msg.data.modelTitle);
      for await (const diffLine of streamDiffLines(
        data.prefix,
        data.highlighted,
        data.suffix,
        llm,
        data.input,
        data.language,
      )) {
        if (abortedMessageIds.has(msg.messageId)) {
          abortedMessageIds.delete(msg.messageId);
          break;
        }
        console.log(diffLine);
        yield { content: diffLine };
      }

      return { done: true };
    }

    on("streamDiffLines", (msg) =>
      streamDiffLinesGenerator(this.configHandler, this.abortedMessageIds, msg),
    );

    on("completeOnboarding", (msg) => {
      const mode = msg.data.mode;

      Telemetry.capture("onboardingSelection", {
        mode,
      });

      if (mode === "custom") {
        return;
      }

      let editConfigJsonCallback: Parameters<typeof editConfigJson>[0];

      switch (mode) {
        case "local":
          editConfigJsonCallback = setupLocalMode;
          break;

        case "freeTrial":
          editConfigJsonCallback = setupFreeTrialMode;
          break;

        case "localAfterFreeTrial":
          editConfigJsonCallback = setupLocalAfterFreeTrial;
          break;

        case "apiKeys":
          editConfigJsonCallback = setupApiKeysMode;
          break;

        default:
          console.error(`Invalid mode: ${mode}`);
          editConfigJsonCallback = (config) => config;
      }

      editConfigJson(editConfigJsonCallback);

      this.configHandler.reloadConfig();
    });

    on("addAutocompleteModel", (msg) => {
      editConfigJson((config) => {
        return {
          ...config,
          tabAutocompleteModel: msg.data.model,
        };
      });
      this.configHandler.reloadConfig();
    });

    on("stats/getTokensPerDay", async (msg) => {
      const rows = await DevDataSqliteDb.getTokensPerDay();
      return rows;
    });
    on("stats/getTokensPerModel", async (msg) => {
      const rows = await DevDataSqliteDb.getTokensPerModel();
      return rows;
    });
    on("index/forceReIndex", async ({ data }) => {
      // if (data?.shouldClearIndexes) {
      //   const codebaseIndexer = await this.codebaseIndexerPromise;
      //   await codebaseIndexer.clearIndexes();
      // }
      const dirs = data?.dir ? [data.dir] : await this.ide.getWorkspaceDirs();
      await this.refreshCodebaseIndex(dirs);
    });
    on("index/setPaused", (msg) => {
      new GlobalContext().update("indexingPaused", msg.data);
      this.indexingPauseToken.paused = msg.data;
    });
    on("index/indexingProgressBarInitialized", async (msg) => {
      // Always send a valid state, even if indexing hasn't started yet
      let stateToSend = this.indexingState;

      if (!stateToSend) {
        // If no indexing state is available, check if we have workspace directories
        try {
          const workspaceDirs = await this.ide.getWorkspaceDirs();
          if (workspaceDirs.length === 0) {
            stateToSend = {
              status: "disabled",
              desc: "No workspace directories found",
              progress: 0,
            };
          } else {
            // Return loading state as default
            stateToSend = {
              status: "loading",
              desc: "Initializing indexing...",
              progress: 0,
            };
          }
        } catch (error) {
          console.error("Error checking workspace directories:", error);
          stateToSend = {
            status: "failed",
            desc: "Failed to check workspace",
            progress: 0,
          };
        }
      }

      // Send the state to update the progress bar
      this.messenger.request("indexProgress", stateToSend);
    });

    on("didChangeSelectedProfile", (msg) => {
      this.configHandler.setSelectedProfile(msg.data.id);
      this.configHandler.reloadConfig();
    });
    on("didChangeControlPlaneSessionInfo", async (msg) => {
      this.configHandler.updateControlPlaneSessionInfo(msg.data.sessionInfo);
    });
    on("auth/getAuthUrl", async (msg) => {
      const url = await getAuthUrlForTokenPage();
      return { url };
    });

    on("didChangeActiveTextEditor", ({ data: { filepath } }) => {
      recentlyEditedFilesCache.set(filepath, filepath);
    });
  }

  private indexingCancellationController: AbortController | undefined;

  private async refreshCodebaseIndex(dirs?: string[]): Promise<void> {
    // If no dirs provided, this is the initialization call
    if (!dirs) {
      try {
        const workspaceDirs = await this.ide.getWorkspaceDirs();
        if (workspaceDirs.length === 0) {
          this.indexingState = {
            status: "failed",
            desc: "No workspace directories found",
            progress: 0,
          };
          return;
        }

        // Call recursively with the workspace directories
        return this.refreshCodebaseIndex(workspaceDirs);
      } catch (error) {
        console.error("Error getting workspace directories:", error);
        this.indexingState = {
          status: "failed",
          desc: `Failed to get workspace directories: ${error instanceof Error ? error.message : "Unknown error"}`,
          progress: 0,
        };
        return;
      }
    }

    // Actual indexing logic with directories
    if (this.indexingCancellationController) {
      this.indexingCancellationController.abort();
    }
    this.indexingCancellationController = new AbortController();

    try {
      const codebaseIndexer = await this.codebaseIndexerPromise;

      for await (const update of codebaseIndexer.refresh(
      dirs,
      this.indexingCancellationController.signal,
    )) {
      let updateToSend = { ...update };
      if (update.status === "failed") {
        updateToSend.status = "done";
        updateToSend.desc = "Indexing complete";
        updateToSend.progress = 1.0;
      }

      void this.messenger.request("indexProgress", updateToSend);
      this.indexingState = updateToSend;

      if (update.status === "failed") {
        console.debug(
          "Indexing failed with error: ",
          update.desc,
          // update.debugInfo,
        );
        void Telemetry.capture(
          "indexing_error",
          {
            error: update.desc,
            // stack: update.debugInfo,
          },
          false,
        );
      }
    }
    this.messenger.send("refreshSubmenuItems", undefined);
    } catch (error) {
      console.error("Error during codebase indexing:", error);
      const errorState = {
        progress: 0,
        desc: `Indexing error: ${error}`,
        status: "failed" as const,
      };
      this.indexingState = errorState;
      void this.messenger.request("indexProgress", errorState);
      void Telemetry.capture(
        "indexing_error",
        {
          error: String(error),
        },
        false,
      );
    }
  }
}
