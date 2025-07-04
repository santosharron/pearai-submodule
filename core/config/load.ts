import * as JSONC from "comment-json";
import * as fs from "fs";
import path from "path";
import {
  slashCommandFromDescription,
  slashFromCustomCommand,
} from "../commands/index.js";
import CustomContextProviderClass from "../context/providers/CustomContextProvider.js";
import FileContextProvider from "../context/providers/FileContextProvider.js";
import { contextProviderClassFromName } from "../context/providers/index.js";
import { AllRerankers } from "../context/rerankers/index.js";
import { LLMReranker } from "../context/rerankers/llm.js";
import {
  BrowserSerializedContinueConfig,
  Config,
  ContextProviderWithParams,
  ContinueConfig,
  ContinueRcJson,
  CustomContextProvider,
  CustomLLM,
  EmbeddingsProviderDescription,
  IContextProvider,
  IDE,
  IdeSettings,
  IdeType,
  ModelDescription,
  Reranker,
  RerankerDescription,
  SerializedContinueConfig,
  SlashCommand,
  PearAuth,
} from "../index.js";
import TransformersJsEmbeddingsProvider from "../indexing/embeddings/TransformersJsEmbeddingsProvider.js";
import { allEmbeddingsProviders } from "../indexing/embeddings/index.js";
import { BaseLLM } from "../llm/index.js";
import CustomLLMClass from "../llm/llms/CustomLLM.js";
import FreeTrial from "../llm/llms/FreeTrial.js";
import { llmFromDescription } from "../llm/llms/index.js";

import { execSync } from "child_process";
import CodebaseContextProvider from "../context/providers/CodebaseContextProvider.js";
import ContinueProxyContextProvider from "../context/providers/ContinueProxyContextProvider.js";
import { fetchwithRequestOptions } from "../util/fetchWithOptions.js";
import { copyOf } from "../util/index.js";
import mergeJson from "../util/merge.js";
import {
  getConfigJsPath,
  getConfigJsPathForRemote,
  getConfigJsonPath,
  getConfigJsonPathForRemote,
  getConfigTsPath,
  getContinueDotEnv,
  readAllGlobalPromptFiles,
  editConfigJson
} from "../util/paths.js";
import {
  defaultConfig,
  defaultContextProvidersJetBrains,
  defaultContextProvidersVsCode,
  defaultSlashCommandsJetBrains,
  defaultSlashCommandsVscode,
  defaultCustomCommands,
} from "./default.js";
import {
  DEFAULT_PROMPTS_FOLDER,
  getPromptFiles,
  slashCommandFromPromptFile,
} from "./promptFile.js";
import { SERVER_URL } from "../util/parameters";

function resolveSerializedConfig(filepath: string): SerializedContinueConfig {
  let content = fs.readFileSync(filepath, "utf8");

  // Replace "pearai-server" with "pearai_server" at the beginning
  // This is to make v0.0.3 backwards compatible with v0.0.2
  content = content.replace(/"pearai-server"/g, '"pearai_server"');

  const config = JSONC.parse(content) as unknown as SerializedContinueConfig;
  if (config.env && Array.isArray(config.env)) {
    const env = {
      ...process.env,
      ...getContinueDotEnv(),
    };

    config.env.forEach((envVar) => {
      if (envVar in env) {
        content = (content as any).replaceAll(
          new RegExp(`"${envVar}"`, "g"),
          `"${env[envVar]}"`,
        );
      }
    });
  }

  return JSONC.parse(content) as unknown as SerializedContinueConfig;
}

const configMergeKeys = {
  models: (a: any, b: any) => a.title === b.title,
  contextProviders: (a: any, b: any) => a.name === b.name,
  slashCommands: (a: any, b: any) => a.name === b.name,
  customCommands: (a: any, b: any) => a.name === b.name,
};

function loadSerializedConfig(
  workspaceConfigs: ContinueRcJson[],
  ideSettings: IdeSettings,
  ideType: IdeType,
  overrideConfigJson: SerializedContinueConfig | undefined,
): SerializedContinueConfig {
  const configPath = getConfigJsonPath(ideType);
  let config: SerializedContinueConfig = overrideConfigJson!;
  if (!config) {
    try {
      config = resolveSerializedConfig(configPath);
    } catch (e) {
      throw new Error(`Failed to parse config.json: ${e}`);
    }
  }

  if (config.allowAnonymousTelemetry === undefined) {
    config.allowAnonymousTelemetry = true;
  }

  // If integrations doesn't exist in config, write it to config.json
  if (!config.integrations) {
    config.integrations = [];
  }

  if (ideSettings.remoteConfigServerUrl) {
    try {
      const remoteConfigJson = resolveSerializedConfig(
        getConfigJsonPathForRemote(ideSettings.remoteConfigServerUrl),
      );
      config = mergeJson(config, remoteConfigJson, "merge", configMergeKeys);
    } catch (e) {
      console.warn("Error loading remote config: ", e);
    }
  }

  for (const workspaceConfig of workspaceConfigs) {
    config = mergeJson(
      config,
      workspaceConfig,
      workspaceConfig.mergeBehavior,
      configMergeKeys,
    );
  }

  // Set defaults if undefined (this lets us keep config.json uncluttered for new users)
  config.contextProviders ??=
    ideType === "vscode"
      ? [...defaultContextProvidersVsCode]
      : [...defaultContextProvidersJetBrains];

  // Slash commands are only added for existing installs if config.json is empty.
  config.slashCommands ??=
    ideType === "vscode"
      ? [...defaultSlashCommandsVscode]
      : [...defaultSlashCommandsJetBrains];

  return config;
}

async function serializedToIntermediateConfig(
  initial: SerializedContinueConfig,
  ide: IDE,
  loadPromptFiles: boolean = true,
): Promise<Config> {
  const slashCommands: SlashCommand[] = [];
  for (const command of initial.slashCommands || []) {
    const newCommand = slashCommandFromDescription(command);
    if (newCommand) {
      slashCommands.push(newCommand);
    }
  }
  for (const command of initial.customCommands || []) {
    slashCommands.push(slashFromCustomCommand(command));
  }

  const workspaceDirs = await ide.getWorkspaceDirs();
  const promptFolder = initial.experimental?.promptPath;

  if (loadPromptFiles) {
    let promptFiles: { path: string; content: string } [] = [];
    promptFiles = (
      await Promise.all(
        workspaceDirs.map((dir) =>
          getPromptFiles(
            ide,
            path.join(dir, promptFolder ?? DEFAULT_PROMPTS_FOLDER),
          ),
        ),
      )
    )
      .flat()
      .filter(({ path }) => path.endsWith(".prompt"));

    // Also read from ~/.dropstone/.prompts
    promptFiles.push(...readAllGlobalPromptFiles());

    for (const file of promptFiles) {
      slashCommands.push(slashCommandFromPromptFile(file.path, file.content));
    }
  }

  const config: Config = {
    ...initial,
    slashCommands,
    contextProviders: initial.contextProviders || [],
  };

  return config;
}

function isModelDescription(
  llm: ModelDescription | CustomLLM,
): llm is ModelDescription {
  return (llm as ModelDescription).title !== undefined;
}

function isContextProviderWithParams(
  contextProvider: CustomContextProvider | ContextProviderWithParams,
): contextProvider is ContextProviderWithParams {
  return (contextProvider as ContextProviderWithParams).name !== undefined;
}

/** Only difference between intermediate and final configs is the `models` array */
async function intermediateToFinalConfig(
  config: Config,
  ide: IDE,
  ideSettings: IdeSettings,
  uniqueId: string,
  writeLog: (log: string) => Promise<void>,
  workOsAccessToken: string | undefined,
  allowFreeTrial: boolean = false,
): Promise<ContinueConfig> {
  // Auto-detect models
  let models: BaseLLM[] = [];
  for (const desc of config.models) {
    if (isModelDescription(desc)) {
      const llm = await llmFromDescription(
        desc,
        ide.readFile.bind(ide),
        uniqueId,
        ideSettings,
        writeLog,
        config.completionOptions,
        config.systemMessage,
        ide.getCurrentDirectory.bind(ide),
        async () => await ide.getPearAuth(),
        async (auth: PearAuth) => await ide.updatePearAICredentials(auth),
      );
      if (!llm) {
        continue;
      }

      if (llm.model === "AUTODETECT") {
        try {
          const modelNames = await llm.listModels();
          const detectedModels = await Promise.all(
            modelNames.map(async (modelName) => {
              return await llmFromDescription(
                {
                  ...desc,
                  model: modelName,
                  title: `${llm.title} - ${modelName}`,
                },
                ide.readFile.bind(ide),
                uniqueId,
                ideSettings,
                writeLog,
                copyOf(config.completionOptions),
                config.systemMessage,
              );
            }),
          );
          models.push(
            ...(detectedModels.filter(
              (x) => typeof x !== "undefined",
            ) as BaseLLM[]),
          );
        } catch (e) {
          console.warn("Error listing models: ", e);
        }
      } else {
        models.push(llm);
      }
    } else {
      const llm = new CustomLLMClass({
        ...desc,
        options: { ...desc.options, writeLog } as any,
      });
      if (llm.model === "AUTODETECT") {
        try {
          const modelNames = await llm.listModels();
          const models = modelNames.map(
            (modelName) =>
              new CustomLLMClass({
                ...desc,
                options: { ...desc.options, model: modelName, writeLog },
              }),
          );

          models.push(...models);
        } catch (e) {
          console.warn("Error listing models: ", e);
        }
      } else {
        models.push(llm);
      }
    }
  }

  // Prepare models
  for (const model of models) {
    model.requestOptions = {
      ...model.requestOptions,
      ...config.requestOptions,
    };
  }

  if (allowFreeTrial) {
    // Obtain auth token (iff free trial being used)
    const freeTrialModels = models.filter(
      (model) => model.providerName === "free-trial",
    );
    if (freeTrialModels.length > 0) {
      const ghAuthToken = await ide.getGitHubAuthToken();
      for (const model of freeTrialModels) {
        (model as FreeTrial).setupGhAuthToken(ghAuthToken);
      }
    }
    console.log("Free trial models:", freeTrialModels);
  } else {
    // Remove free trial models
    models = models.filter((model) => model.providerName !== "free-trial");
    // console.log("Models:", models);
  }

  // Tab autocomplete model
  let tabAutocompleteModels: BaseLLM[] = [];
  if (config.tabAutocompleteModel) {
    tabAutocompleteModels = (
      await Promise.all(
        (Array.isArray(config.tabAutocompleteModel)
          ? config.tabAutocompleteModel
          : [config.tabAutocompleteModel]
        ).map(async (desc) => {
          if (isModelDescription(desc)) {
            const llm = await llmFromDescription(
              desc,
              ide.readFile.bind(ide),
              uniqueId,
              ideSettings,
              writeLog,
              config.completionOptions,
              config.systemMessage,
            );

            // if (llm?.providerName === "free-trial") {
            //   if (!allowFreeTrial) {
            //     // This shouldn't happen
            //     throw new Error("Free trial cannot be used with control plane");
            //   }
            //   const ghAuthToken = await ide.getGitHubAuthToken();
            //   (llm as FreeTrial).setupGhAuthToken(ghAuthToken);
            // }
            return llm;
          } else {
            return new CustomLLMClass(desc);
          }
        }),
      )
    ).filter((x) => x !== undefined) as BaseLLM[];
  }

  // These context providers are always included, regardless of what, if anything,
  // the user has configured in config.json
  const DEFAULT_CONTEXT_PROVIDERS : any[] = [
    // new FileContextProvider({}),
    // new CodebaseContextProvider({}),
  ];

  const DEFAULT_CONTEXT_PROVIDERS_TITLES = DEFAULT_CONTEXT_PROVIDERS.map(
    ({ description: { title } }) => title,
  );

  // Context providers
  const contextProviders: IContextProvider[] = DEFAULT_CONTEXT_PROVIDERS;

  for (const provider of config.contextProviders || []) {
    if (isContextProviderWithParams(provider)) {
      const cls = contextProviderClassFromName(provider.name) as any;
      if (!cls) {
        if (!DEFAULT_CONTEXT_PROVIDERS_TITLES.includes(provider.name)) {
          console.warn(`Unknown context provider ${provider.name}`);
        }

        continue;
      }
      const instance: IContextProvider = new cls(provider.params);

      // Handle continue-proxy
      if (instance.description.title === "continue-proxy") {
        (instance as ContinueProxyContextProvider).workOsAccessToken =
          workOsAccessToken;
      }

      contextProviders.push(instance);
    } else {
      contextProviders.push(new CustomContextProviderClass(provider));
    }
  }

  // Embeddings Provider
  const embeddingsProviderDescription = config.embeddingsProvider as
    | EmbeddingsProviderDescription
    | undefined;
  if (embeddingsProviderDescription?.provider) {
    const { provider, ...options } = embeddingsProviderDescription;
    const embeddingsProviderClass = allEmbeddingsProviders[provider];
    if (embeddingsProviderClass) {
      if (
        embeddingsProviderClass.name === "_TransformersJsEmbeddingsProvider"
      ) {
        config.embeddingsProvider = new embeddingsProviderClass();
      } else {
        config.embeddingsProvider = new embeddingsProviderClass(
          options,
          (url: string | URL, init: any) =>
            fetchwithRequestOptions(url, init, {
              ...config.requestOptions,
              ...options.requestOptions,
            }),
        );
      }
    }
  }

  if (!config.embeddingsProvider) {
    config.embeddingsProvider = new TransformersJsEmbeddingsProvider();
  }

  // Reranker
  if (config.reranker && !(config.reranker as Reranker | undefined)?.rerank) {
    const { name, params } = config.reranker as RerankerDescription;
    const rerankerClass = AllRerankers[name];

    if (name === "llm") {
      const llm = models.find((model) => model.title === params?.modelTitle);
      if (!llm) {
        console.warn(`Unknown model ${params?.modelTitle}`);
      } else {
        config.reranker = new LLMReranker(llm);
      }
    } else if (rerankerClass) {
      config.reranker = new rerankerClass(params);
    }
  }

  return {
    ...config,
    contextProviders,
    models,
    embeddingsProvider: config.embeddingsProvider as any,
    tabAutocompleteModels,
    reranker: config.reranker as any,
  };
}

function finalToBrowserConfig(
  final: ContinueConfig,
): BrowserSerializedContinueConfig {
  return {
    allowAnonymousTelemetry: final.allowAnonymousTelemetry,
    models: final.models.map((m) => ({
      title: m.title ?? m.model,
      provider: m.providerName,
      model: m.model,
      apiKey: m.apiKey,
      apiBase: m.apiBase,
      refreshToken: m.refreshToken,
      contextLength: m.contextLength,
      template: m.template,
      completionOptions: m.completionOptions,
      systemMessage: m.systemMessage,
      requestOptions: m.requestOptions,
      promptTemplates: m.promptTemplates as any,
      capabilities: m.capabilities,
      isDefault: m.isDefault,
    })),
    systemMessage: final.systemMessage,
    completionOptions: final.completionOptions,
    slashCommands: final.slashCommands?.map((s) => ({
      name: s.name,
      description: s.description,
      params: s.params, //PZTODO: is this why params aren't referenced properly by slash commands?
    })),
    contextProviders: final.contextProviders?.map((c) => c.description),
    disableIndexing: final.disableIndexing,
    disableSessionTitles: final.disableSessionTitles,
    userToken: final.userToken,
    embeddingsProvider: final.embeddingsProvider?.id,
    ui: final.ui,
    experimental: final.experimental,
    isBetaAccess: final?.isBetaAccess,
    integrations: final.integrations || []
  };
}

function getTarget() {
  const os =
    {
      aix: "linux",
      darwin: "darwin",
      freebsd: "linux",
      linux: "linux",
      openbsd: "linux",
      sunos: "linux",
      win32: "win32",
    }[process.platform as string] ?? "linux";
  const arch = {
    arm: "arm64",
    arm64: "arm64",
    ia32: "x64",
    loong64: "arm64",
    mips: "arm64",
    mipsel: "arm64",
    ppc: "x64",
    ppc64: "x64",
    riscv64: "arm64",
    s390: "x64",
    s390x: "x64",
    x64: "x64",
  }[process.arch];

  return `${os}-${arch}`;
}

function escapeSpacesInPath(p: string): string {
  return p
    .split("")
    .map((char) => {
      if (char === " ") {
        return "\\ ";
      } else if (char === "\\") {
        return "\\\\";
      } else {
        return char;
      }
    })
    .join("");
}

async function buildConfigTs() {
  if (!fs.existsSync(getConfigTsPath())) {
    return undefined;
  }

  try {
    if (process.env.IS_BINARY === "true") {
      execSync(
        `${escapeSpacesInPath(path.dirname(process.execPath))}/esbuild${
          getTarget().startsWith("win32") ? ".exe" : ""
        } ${escapeSpacesInPath(
          getConfigTsPath(),
        )} --bundle --outfile=${escapeSpacesInPath(
          getConfigJsPath(),
        )} --platform=node --format=cjs --sourcemap --external:fetch --external:fs --external:path --external:os --external:child_process`,
      );
    } else {
      // Dynamic import esbuild so potentially disastrous errors can be caught
      const esbuild = await import("esbuild");

      await esbuild.build({
        entryPoints: [getConfigTsPath()],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: getConfigJsPath(),
        external: ["fetch", "fs", "path", "os", "child_process"],
        sourcemap: true,
      });
    }
  } catch (e) {
    console.log(
      `Build error. Please check your ~/.dropstone/config.ts file: ${e}`,
    );
    return undefined;
  }

  if (!fs.existsSync(getConfigJsPath())) {
    return undefined;
  }
  return fs.readFileSync(getConfigJsPath(), "utf8");
}

async function addDefaults(config: SerializedContinueConfig) {
  await addDefaultModels(config);
  addDefaultCustomCommands(config);
  addDefaultContextProviders(config);
  addDefaultSlashCommands(config);
  addDefaultIntegrations(config);
}

function addDefaultIntegrations(config: SerializedContinueConfig): void {
  // Ensure integrations array exists
  if (!config.integrations) {
    config.integrations = [];
  }

  defaultConfig!.integrations!.forEach((defaultIntegration) => {
    const integrationExists = config.integrations?.some(
      (configIntegration) =>
        configIntegration.name === defaultIntegration.name
    );
    if (!integrationExists) {
      config.integrations!.push(defaultIntegration);
      editConfigJson((configJson) => {
        if (!configJson.integrations) {
          configJson.integrations = [];
        }
        configJson.integrations.push(defaultIntegration);
        return configJson;
      });
    }
  });
}

const STATIC_MODELS: ModelDescription[] = [
  {
    model: "dropstone-search",
    contextLength: 300000,
    title: "Dropstone Search",
    systemMessage: "You are an expert documentation and information gatherer. You give succinct responses based on the latest software engineering practices and documentation. Always go to the web to get the latest information and data.",
    provider: "custom",
    isDefault: true,
  },
  {
    model: "dropstone-memory",
    contextLength: 300000,
    title: "Dropstone Memory",
    systemMessage: "You are an expert memory manager. You help users store, retrieve, and manage important information about their coding projects and preferences.",
    provider: "custom",
    isDefault: true,
  }
];

const getDefaultModels = async () => {
  try {
    // First try to get models from the /getDefaultConfig endpoint (for backward compatibility)
    const res = await fetch(`${SERVER_URL}/getDefaultConfig`);
    const config = await res.json();
    let models = config.models || [];

    // Then try to get additional models from the public /api/models/public endpoint
    try {
      const modelsRes = await fetch(`${SERVER_URL}/api/models/public`);

      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();

        // Convert server models to ModelDescription format
        if (modelsData.models) {
          const serverModels = Object.values(modelsData.models).map((model: any) => ({
            model: model.id,
            contextLength: model.maxTokens,
            title: model.name,
            systemMessage: "You are an expert software developer. You give helpful and concise responses based on latest documentation and software engineering best practices.",
            provider: "custom",
            isDefault: false,
          }));

          // Add server models to the list, avoiding duplicates
          serverModels.forEach((serverModel: any) => {
            const exists = models.some((existingModel: any) =>
              existingModel.title === serverModel.title ||
              existingModel.model === serverModel.model
            );
            if (!exists) {
              models.push(serverModel);
            }
          });
        }
      }
    } catch (apiError) {
      console.warn("Failed to fetch models from /api/models/public endpoint:", apiError);
    }

    return models;
  } catch {
    return [];
  }
};

async function addDefaultModels(config: SerializedContinueConfig): Promise<void> {
  // Ensure models array exists
  if (!config.models) {
    config.models = [];
  }

  // First, add static models
  STATIC_MODELS.forEach((staticModel) => {
    const modelExists = config.models.some(
      (configModel) =>
        configModel.title === staticModel.title &&
        configModel.provider === staticModel.provider
    );

    if (!modelExists) {
      config.models.push({ ...staticModel });
    }
  });

  // Then, add dynamic models from server
  const dynamicModels = await getDefaultModels();
  dynamicModels.forEach((defaultModel: ModelDescription) => {
    const modelExists = config.models.some(
      (configModel) =>
        configModel.title === defaultModel.title &&
        configModel.provider === defaultModel.provider
    );

    if (!modelExists) {
      config.models.push({ ...defaultModel });
    }
  });
}

function addDefaultCustomCommands(config: SerializedContinueConfig): void {
  const defaultCommands = defaultCustomCommands;
  defaultCommands.forEach(defaultCommand => {
    if (!config.customCommands) {
      config.customCommands = [];
    }
    config.customCommands.push({ ...defaultCommand });
  });
}

function addDefaultContextProviders(config: SerializedContinueConfig): void {
  // Ensure contextProviders is an array
  if (!config.contextProviders) {
    config.contextProviders = [];
  } else if (!Array.isArray(config.contextProviders)) {
    // If contextProviders exists but is not an array, convert it to an array
    config.contextProviders = [];
    console.warn("Config contextProviders was not an array, resetting to empty array");
  }

  const defaultContextProviders = defaultContextProvidersVsCode || []; // Use empty array as fallback if undefined
  defaultContextProviders.forEach((defaultProvider) => {
    if (!config.contextProviders) {
      config.contextProviders = [];
    }
    const providerExists = config.contextProviders.some(
      (configProvider) => configProvider.name === defaultProvider.name,
    );

    if (!providerExists) {
      config.contextProviders.push({ ...defaultProvider });
    }
  });
}

function addDefaultSlashCommands(config: SerializedContinueConfig): void {
  const defaultSlashCommands = defaultSlashCommandsVscode; // or defaultSlashCommandsJetBrains based on IDE type
  defaultSlashCommands.forEach((defaultCommand) => {
    const commandExists = config.slashCommands?.some(
      (configCommand) => configCommand.name === defaultCommand.name,
    );

    if (!commandExists) {
      config.slashCommands = config.slashCommands || [];
      config.slashCommands.push({ ...defaultCommand });
    }
  });
}


async function loadFullConfigNode(
  ide: IDE,
  workspaceConfigs: ContinueRcJson[],
  ideSettings: IdeSettings,
  ideType: IdeType,
  uniqueId: string,
  writeLog: (log: string) => Promise<void>,
  workOsAccessToken: string | undefined,
  overrideConfigJson: SerializedContinueConfig | undefined,
): Promise<ContinueConfig> {
  // Serialized config
  let serialized = loadSerializedConfig(
    workspaceConfigs,
    ideSettings,
    ideType,
    overrideConfigJson,
  );

  // check and enforce default models
  await addDefaults(serialized);

  // Convert serialized to intermediate config
  let intermediate = await serializedToIntermediateConfig(serialized, ide);

  // Apply config.ts to modify intermediate config
  const configJsContents = await buildConfigTs();
  if (configJsContents) {
    try {
      // Try config.ts first
      const configJsPath = getConfigJsPath();
      const module = await import(configJsPath);
      delete require.cache[require.resolve(configJsPath)];
      if (!module.modifyConfig) {
        throw new Error("config.ts does not export a modifyConfig function.");
      }
      intermediate = module.modifyConfig(intermediate);
    } catch (e) {
      console.log("Error loading config.ts: ", e);
    }
  }

  // Apply remote config.js to modify intermediate config
  if (ideSettings.remoteConfigServerUrl) {
    try {
      const configJsPathForRemote = getConfigJsPathForRemote(
        ideSettings.remoteConfigServerUrl,
      );
      const module = await import(configJsPathForRemote);
      delete require.cache[require.resolve(configJsPathForRemote)];
      if (!module.modifyConfig) {
        throw new Error("config.ts does not export a modifyConfig function.");
      }
      intermediate = module.modifyConfig(intermediate);
    } catch (e) {
      console.log("Error loading remotely set config.js: ", e);
    }
  }

  // Convert to final config format
  const finalConfig = await intermediateToFinalConfig(
    intermediate,
    ide,
    ideSettings,
    uniqueId,
    writeLog,
    workOsAccessToken,
  );
  return finalConfig;
}

export {
  finalToBrowserConfig,
  intermediateToFinalConfig,
  loadFullConfigNode,
  serializedToIntermediateConfig,
  type BrowserSerializedContinueConfig,
};
