// core/llm/llms/PearAIServer.ts

import { BaseLLM } from "../index.js";
import { ChatMessage, CompletionOptions, ModelProvider } from "../../index.js";
import { SERVER_URL } from "../../util/parameters.js";
import { streamJSON, streamSse } from "../stream.js";

class PearAIServer extends BaseLLM {
  static providerName: ModelProvider = "dropstone";

  private getDropstoneCredentials?: () => Promise<string | undefined>;
  private getPearAICredentials?: () => Promise<{ accessToken?: string; refreshToken?: string }>;
  private pearAIAccessToken?: string;
  private pearAIRefreshToken?: string;

  constructor(options: any) {
    super(options);
    // The apiKey option contains the dropstone API key passed from ideSettings
    // This is already handled by the parent class constructor
    this.getDropstoneCredentials = options.getDropstoneCredentials;
    this.getPearAICredentials = options.getPearAICredentials;
  }

  setPearAIAccessToken(token: string | undefined): void {
    this.pearAIAccessToken = token;
  }

  setPearAIRefreshToken(token: string | undefined): void {
    this.pearAIRefreshToken = token;
  }

  async checkAndUpdateCredentials(): Promise<{ tokensEdited: boolean; accessToken?: string; refreshToken?: string }> {
    // This method should check if tokens need to be refreshed and update them if necessary
    // For now, return a simple implementation that indicates no tokens were edited
    return {
      tokensEdited: false,
      accessToken: this.pearAIAccessToken,
      refreshToken: this.pearAIRefreshToken
    };
  }

  private async getAuthToken(): Promise<string | undefined> {
    // First, check if user is currently logged in to PearAI
    if (this.getPearAICredentials) {
      try {
        const pearAIAuth = await this.getPearAICredentials();
        if (!pearAIAuth?.accessToken) {
          // User is not logged in to PearAI, don't allow Dropstone requests
          throw new Error("PearAI authentication required: Please log in to PearAI to use Dropstone models. You can log in at https://www.dropstone.io/login");
        }
      } catch (error) {
        // If we can't check PearAI auth status, assume user is not logged in
        throw new Error("PearAI authentication required: Please log in to PearAI to use Dropstone models. You can log in at https://www.dropstone.io/login");
      }
    }

    // Primary: Use API key passed from configuration
    if (this.apiKey) {
      return this.apiKey;
    }

    // Secondary: Use dropstone credentials getter if provided (from extension context)
    if (this.getDropstoneCredentials) {
      try {
        const token = await this.getDropstoneCredentials();
        if (token) {
          return token;
        }
      } catch (error) {
        console.error("Error getting dropstone credentials:", error);
      }
    }

    // At this point, no authentication token is available
    throw new Error("Dropstone authentication required: No API key found. Please authenticate with the Dropstone server at https://server.dropstone.io/login");
  }

  async *_streamChat(
    messages: ChatMessage[],
    options: CompletionOptions
  ): AsyncGenerator<ChatMessage> {
    const authToken = await this.getAuthToken();

    try {
      const endpoint = `${SERVER_URL}/server_chat`;
      const resp = await this.fetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          model: options.model,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: options.temperature,
          top_p: options.topP,
          frequency_penalty: options.frequencyPenalty,
          presence_penalty: options.presencePenalty,
          stop: options.stop,
          stream: true,
        }),
        headers: {
          ...(await this._getHeaders()),
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${authToken}`,
        },
      });

      for await (const chunk of streamJSON(resp)) {
        yield {
          role: "assistant",
          content: chunk.choices[0].delta.content,
        };
      }
    } catch (error: any) {
      // Enhanced error handling for authentication issues
      if (error.message?.includes("403") || error.message?.includes("Forbidden") || error.message?.includes("Access denied")) {
        throw new Error("Dropstone authentication required: Access denied. Please authenticate with the Dropstone server at https://server.dropstone.io/login");
      } else if (error.message?.includes("401") || error.message?.includes("Unauthorized")) {
        throw new Error("Dropstone authentication failed: Invalid or expired token. Please re-authenticate at https://server.dropstone.io/login");
      } else if (error.message?.includes("404")) {
        throw new Error("Dropstone server endpoint not found. Please ensure the server is running on https://server.dropstone.io");
      } else if (error.message?.includes("ECONNREFUSED") || error.message?.includes("fetch")) {
        throw new Error("Cannot connect to Dropstone server. Please ensure the server is running on https://server.dropstone.io");
      }
      // Re-throw the original error if it's not a known authentication issue
      throw error;
    }
  }

  async *_streamFim(
    prefix: string,
    suffix: string,
    options: CompletionOptions
  ): AsyncGenerator<string> {
    const authToken = await this.getAuthToken();

    try {
      const endpoint = `${SERVER_URL}/server_fim`;
      const resp = await this.fetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          model: options.model,
          prefix,
          suffix,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
          top_p: options.topP,
          frequency_penalty: options.frequencyPenalty,
          presence_penalty: options.presencePenalty,
          stop: options.stop,
          stream: true,
        }),
        headers: {
          ...(await this._getHeaders()),
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${authToken}`,
        },
      });
      let completion = "";
      for await (const chunk of streamSse(resp)) {
        yield chunk.choices[0].delta.content;
      }
    } catch (error: any) {
      // Enhanced error handling for authentication issues
      if (error.message?.includes("403") || error.message?.includes("Forbidden") || error.message?.includes("Access denied")) {
        throw new Error("Dropstone authentication required: Access denied. Please authenticate with the Dropstone server at https://server.dropstone.io/login");
      } else if (error.message?.includes("401") || error.message?.includes("Unauthorized")) {
        throw new Error("Dropstone authentication failed: Invalid or expired token. Please re-authenticate at https://server.dropstone.io/login");
      } else if (error.message?.includes("404")) {
        throw new Error("Dropstone server endpoint not found. Please ensure the server is running on https://server.dropstone.io");
      } else if (error.message?.includes("ECONNREFUSED") || error.message?.includes("fetch")) {
        throw new Error("Cannot connect to Dropstone server. Please ensure the server is running on https://server.dropstone.io");
      }
      // Re-throw the original error if it's not a known authentication issue
      throw error;
    }
  }

  async listModels(): Promise<string[]> {
    const authToken = await this.getAuthToken();

    try {
      const endpoint = `${SERVER_URL}/api/models`;
      const resp = await this.fetch(endpoint, {
        method: "GET",
        headers: {
          ...(await this._getHeaders()),
          Accept: "application/json",
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data = await resp.json();
      // The API returns { models: { "model-id": { id, name, provider, ... } } }
      if (data.models) {
        return Object.keys(data.models);
      }
      return [];
    } catch (error: any) {
      // Enhanced error handling for authentication issues
      if (error.message?.includes("403") || error.message?.includes("Forbidden") || error.message?.includes("Access denied")) {
        throw new Error("Dropstone authentication required: Access denied. Please authenticate with the Dropstone server at https://server.dropstone.io/login");
      } else if (error.message?.includes("401") || error.message?.includes("Unauthorized")) {
        throw new Error("Dropstone authentication failed: Invalid or expired token. Please re-authenticate at https://server.dropstone.io/login");
      } else if (error.message?.includes("404")) {
        throw new Error("Dropstone server endpoint not found. Please ensure the server is running on https://server.dropstone.io");
      } else if (error.message?.includes("ECONNREFUSED") || error.message?.includes("fetch")) {
        throw new Error("Cannot connect to Dropstone server. Please ensure the server is running on https://server.dropstone.io");
      }
      // Re-throw the original error if it's not a known authentication issue
      throw error;
    }
  }

  private async _getHeaders(): Promise<Record<string, string>> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }
}

export default PearAIServer;
