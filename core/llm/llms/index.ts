import Handlebars from "handlebars";
import { v4 as uuidv4 } from "uuid";
import {
  BaseCompletionOptions,
  IdeSettings,
  ILLM,
  LLMOptions,
  ModelDescription,
  PearAuth,
} from "../../index.js";
import { DEFAULT_MAX_TOKENS } from "../constants.js";
import { BaseLLM } from "../index.js";
import Anthropic from "./Anthropic.js";
import Azure from "./Azure.js";
import Bedrock from "./Bedrock.js";
import Cloudflare from "./Cloudflare.js";
import Cohere from "./Cohere.js";
import DeepInfra from "./DeepInfra.js";
import Deepseek from "./Deepseek.js";
import Fireworks from "./Fireworks.js";
import Flowise from "./Flowise.js";
import FreeTrial from "./FreeTrial.js";
import Gemini from "./Gemini.js";
import Groq from "./Groq.js";
import HuggingFaceInferenceAPI from "./HuggingFaceInferenceAPI.js";
import HuggingFaceTGI from "./HuggingFaceTGI.js";
import LMStudio from "./LMStudio.js";
import LlamaCpp from "./LlamaCpp.js";
import Llamafile from "./Llamafile.js";
import Mistral from "./Mistral.js";
import Msty from "./Msty.js";
import Ollama from "./Ollama.js";
import OpenAI from "./OpenAI.js";
import OpenRouter from "./OpenRouter.js";
import Replicate from "./Replicate.js";
import TextGenWebUI from "./TextGenWebUI.js";
import Together from "./Together.js";
import WatsonX from "./WatsonX.js";
import ContinueProxy from "./stubs/ContinueProxy.js";
import PearAIServer from "./PearAIServer.js";


function convertToLetter(num: number): string {
  let result = "";
  while (num > 0) {
    const remainder = (num - 1) % 26;
    result = String.fromCharCode(97 + remainder) + result;
    num = Math.floor((num - 1) / 26);
  }
  return result;
}

const getHandlebarsVars = (
  value: string,
): [string, { [key: string]: string }] => {
  const ast = Handlebars.parse(value);

  const keysToFilepath: { [key: string]: string } = {};
  let keyIndex = 1;
  for (const i in ast.body) {
    if (ast.body[i].type === "MustacheStatement") {
      const letter = convertToLetter(keyIndex);
      keysToFilepath[letter] = (ast.body[i] as any).path.original;
      value = value.replace(
        new RegExp(`{{\\s*${(ast.body[i] as any).path.original}\\s*}}`),
        `{{${letter}}}`,
      );
      keyIndex++;
    }
  }
  return [value, keysToFilepath];
};

export async function renderTemplatedString(
  template: string,
  readFile: (filepath: string) => Promise<string>,
  inputData: any,
  helpers?: [string, Handlebars.HelperDelegate][],
): Promise<string> {
  const promises: { [key: string]: Promise<string> } = {};
  if (helpers) {
    for (const [name, helper] of helpers) {
      Handlebars.registerHelper(name, (...args) => {
        const id = uuidv4();
        promises[id] = helper(...args);
        return `__${id}__`;
      });
    }
  }

  const [newTemplate, vars] = getHandlebarsVars(template);
  const data: any = { ...inputData };
  for (const key in vars) {
    const fileContents = await readFile(vars[key]);
    data[key] = fileContents || (inputData[vars[key]] ?? vars[key]);
  }
  const templateFn = Handlebars.compile(newTemplate);
  let final = templateFn(data);

  await Promise.all(Object.values(promises));
  for (const id in promises) {
    final = final.replace(`__${id}__`, await promises[id]);
  }

  return final;
}

const LLMs = [
  Anthropic,
  Cohere,
  FreeTrial,
  Gemini,
  Llamafile,
  Ollama,
  Replicate,
  TextGenWebUI,
  Together,
  HuggingFaceTGI,
  HuggingFaceInferenceAPI,
  LlamaCpp,
  OpenAI,
  LMStudio,
  Mistral,
  Bedrock,
  DeepInfra,
  Flowise,
  Groq,
  Fireworks,
  ContinueProxy,
  Cloudflare,
  Deepseek,
  Msty,
  Azure,
  WatsonX,
  PearAIServer,
  OpenRouter,
];

export async function llmFromDescription(
  desc: ModelDescription,
  readFile: (filepath: string) => Promise<string>,
  uniqueId: string,
  ideSettings: IdeSettings,
  writeLog: (log: string) => Promise<void>,
  completionOptions?: BaseCompletionOptions,
  systemMessage?: string,
  getCurrentDirectory?: () => Promise<string>,
  getCredentials?: () => Promise<PearAuth | undefined>,
  setCredentials?: (auth: PearAuth) => Promise<void>,
): Promise<BaseLLM | undefined> {
  const cls = LLMs.find((llm) => llm.providerName === desc.provider);

  if (!cls) {
    return undefined;
  }

  const finalCompletionOptions = {
    ...completionOptions,
    ...desc.completionOptions,
  };

  systemMessage = desc.systemMessage ?? systemMessage;
  if (systemMessage !== undefined) {
    systemMessage = await renderTemplatedString(systemMessage, readFile, {});
  }

  let options: LLMOptions = {
    ...desc,
    completionOptions: {
      ...finalCompletionOptions,
      model: (desc.model || cls.defaultOptions?.model) ?? "codellama-7b",
      maxTokens:
        finalCompletionOptions.maxTokens ??
        cls.defaultOptions?.completionOptions?.maxTokens ??
        DEFAULT_MAX_TOKENS,
    },
    systemMessage,
    writeLog,
    uniqueId,
    getCurrentDirectory,
    getCredentials,
    setCredentials,
  };

  if (desc.provider === "continue-proxy") {
    options.apiKey = ideSettings.userToken;
    if (ideSettings.remoteConfigServerUrl) {
      options.apiBase = new URL(
        "/proxy/v1",
        ideSettings.remoteConfigServerUrl,
      ).toString();
    }
  }

  if (desc.provider === "dropstone" && ideSettings.dropstoneApiKey) {
    options.apiKey = ideSettings.dropstoneApiKey;
  }

  // Pass PearAI credentials getter to PearAIServer
  if (desc.provider === "dropstone") {
    (options as any).getPearAICredentials = getCredentials;
  }

  return new cls(options);
}

export function llmFromProviderAndOptions(
  providerName: string,
  llmOptions: LLMOptions,
): ILLM {
  const cls = LLMs.find((llm) => llm.providerName === providerName);

  if (!cls) {
    throw new Error(`Unknown LLM provider type "${providerName}"`);
  }

  return new cls(llmOptions);
}
