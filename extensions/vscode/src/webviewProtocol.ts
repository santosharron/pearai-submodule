import { FromWebviewProtocol, ToWebviewProtocol } from "../../../core/protocol/index.js";
import { Message } from "../../../core/util/messenger.js";
import fs from "node:fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";
import { IMessenger } from "../../../core/util/messenger.js";
import { getExtensionUri } from "./util/vscode";
import { editConfigJson } from "../../../core/util/paths.js";

export async function showTutorial() {
  const tutorialPath = path.join(
    getExtensionUri().fsPath,
    "pearai_tutorial.py",
  );
  // Ensure keyboard shortcuts match OS
  if (process.platform !== "darwin") {
    let tutorialContent = fs.readFileSync(tutorialPath, "utf8");
    tutorialContent = tutorialContent
      .replaceAll("⌘", "^")
      .replaceAll("Cmd", "Ctrl");
    fs.writeFileSync(tutorialPath, tutorialContent);
  }

  const doc = await vscode.workspace.openTextDocument(
    vscode.Uri.file(tutorialPath),
  );
  await vscode.window.showTextDocument(doc, { preview: false });
}

export class VsCodeWebviewProtocol
  implements IMessenger<FromWebviewProtocol, ToWebviewProtocol>
{
  listeners = new Map<
    keyof FromWebviewProtocol,
    ((message: Message) => any)[]
  >();

  send<T extends keyof ToWebviewProtocol>(messageType: T, data: ToWebviewProtocol[T][0], messageId?: string, specificWebviews?: string[],
  ): string {
    const id = messageId ?? uuidv4();
    if (specificWebviews) {
      specificWebviews.forEach(name => {
        try {
          const webview = this.webviews.get(name);
          if (webview) {
            webview.postMessage({
              messageType,
              data,
              messageId: id,
            });
          }
        } catch (error) {
          console.error(`Failed to post message to webview ${name}:`, error);
        }
      });
    } else {
      this.webviews.forEach(webview => {
        webview.postMessage({
          messageType,
          data,
          messageId: id,
        });
      });
    }
    return id;
  }

  on<T extends keyof FromWebviewProtocol>(
    messageType: T,
    handler: (
      message: Message<FromWebviewProtocol[T][0]>,
    ) => Promise<FromWebviewProtocol[T][1]> | FromWebviewProtocol[T][1],
  ): void {
    if (!this.listeners.has(messageType)) {
      this.listeners.set(messageType, []);
    }
    this.listeners.get(messageType)?.push(handler);
  }

  _webviews: Map<string, vscode.Webview> = new Map();
  _webviewListeners: Map<string, vscode.Disposable> = new Map();

  // Keep the last authenticated Dropstone token so newly created webviews can immediately hydrate.
  private _dropstoneToken: string | null | undefined;
  private _dropstoneUserInfo: any;

  get webviews(): Map<string, vscode.Webview> {
    return this._webviews;
  }
  resetWebviews() {
    this._webviews.clear();
    this._webviewListeners.forEach(listener => listener.dispose());
    this._webviewListeners.clear();
  }

  resetWebviewToDefault() {
    const defaultViewKey = "dropstone.chatView";

    // Remove all entries except for the chat view
    this._webviews.forEach((_, key) => {
      if (key !== defaultViewKey) {
        this._webviews.delete(key);
      }
    });

    // Dispose and remove all listeners except for the chat view
    this._webviewListeners.forEach((listener, key) => {
      if (key !== defaultViewKey) {
        listener.dispose();
        this._webviewListeners.delete(key);
      }
    });
  }

  addWebview(viewType: string, webView: vscode.Webview) {
    this._webviews.set(viewType, webView);
    // If we already have a cached Dropstone auth token (e.g. from a previous
    // login in this window), proactively inform the just-registered webview
    // so its DropstoneAuthContext can hydrate without waiting for an explicit
    // request.
    if (this._dropstoneToken) {
      webView.postMessage({
        messageType: "dropstoneAuthUpdated",
        messageId: uuidv4(),
        data: { token: this._dropstoneToken, userInfo: this._dropstoneUserInfo },
      });
    }
    const listener = webView.onDidReceiveMessage(async (msg) => {
      if (!msg.messageType || !msg.messageId) {
        throw new Error(`Invalid webview protocol msg: ${JSON.stringify(msg)}`);
      }

      // ------------------------------------------------------------------
      // Handle unified authentication sync BEFORE touching the try/catch
      // that wraps normal message processing.  This guarantees the update
      // path executes even when no error is thrown (previously it was
      // inside the catch-block).
      // ------------------------------------------------------------------
      if (msg.messageType === "auth_sync_login") {
        const { token, userInfo } = msg.data || {};
        this._dropstoneToken = token;
        this._dropstoneUserInfo = userInfo;

        /*
         * ------------------------------------------------------------------
         * Persist the updated Dropstone JWT into the user's config.json.
         * We update any model entry that is clearly a Dropstone model –
         * currently identified by either:
         *   1. apiBase pointing at the local Dropstone proxy (localhost:3000)
         *   2. the model title containing the word "dropstone" (case-insensitive)
         * This keeps the Authorization header & apiKey fields in sync so that
         * subsequent LLM requests are authenticated correctly.
         * ------------------------------------------------------------------*/
        try {
          if (token) {
            console.log('[VsCodeWebviewProtocol] Persisting Dropstone token to config.json');
            editConfigJson((config) => {
              if (!config.models) {
                return config;
              }

              config.models = config.models.map((m: any) => {
                const isDropstoneModel =
                  (typeof m.apiBase === "string" && m.apiBase.includes("localhost:3000")) ||
                  (typeof m.title === "string" && m.title.toLowerCase().includes("dropstone"));

                if (isDropstoneModel) {
                  m.apiKey = token;
                  // Ensure requestOptions + headers objects exist
                  m.requestOptions = m.requestOptions ?? {};
                  m.requestOptions.headers = {
                    ...m.requestOptions.headers,
                    Authorization: `Bearer ${token}`,
                  };
                }
                return m;
              });

              return config;
            });

            // Inform core / other components that configuration has changed
            this.reloadConfig();
            console.log('[VsCodeWebviewProtocol] Config reloaded after persisting token');
          }
        } catch (err) {
          console.warn("Failed to persist Dropstone auth token to config.json:", err);
        }

        console.log('[VsCodeWebviewProtocol] received auth_sync_login – broadcasting dropstoneAuthUpdated');
        this.send("dropstoneAuthUpdated", { token, updatedCount: 0 });
        // No need to continue processing this message further.
        return;
      }

      if (msg.messageType === "auth_sync_logout") {
        console.log('[VsCodeWebviewProtocol] received auth_sync_logout – clearing token and broadcasting clearDropstoneAuth');
        this._dropstoneToken = null;
        this._dropstoneUserInfo = null;

        // Clear Dropstone tokens from config.json
        try {
          editConfigJson((config) => {
            if (!config.models) {
              return config;
            }

            config.models = config.models.map((m: any) => {
              const isDropstoneModel =
                (typeof m.apiBase === "string" && m.apiBase.includes("localhost:3000")) ||
                (typeof m.title === "string" && m.title.toLowerCase().includes("dropstone"));

              if (isDropstoneModel) {
                m.apiKey = "";
                // Clear authorization header
                if (m.requestOptions?.headers) {
                  delete m.requestOptions.headers.Authorization;
                }
              }
              return m;
            });

            return config;
          });

          this.reloadConfig();
          console.log('[VsCodeWebviewProtocol] Config reloaded after clearing token');
        } catch (err) {
          console.warn("Failed to clear Dropstone auth token from config.json:", err);
        }

        this.send("clearDropstoneAuth", undefined);
        return;
      }

      // Handle simple token fetch request from newly mounted webviews
      if (msg.messageType === "get_dropstone_token") {
        console.log('[VsCodeWebviewProtocol] get_dropstone_token request received');
        // If we haven't cached it yet, attempt to load from the current
        // config.  reloadConfig might return a promise – we cast to any to
        // support both sync/async callbacks.
        try {
          if (!this._dropstoneToken) {
            console.log('[VsCodeWebviewProtocol] No cached token, loading from config');
            const cfg: any = await (this.reloadConfig as any)();
            const dropModel = cfg?.models?.find((m: any) =>
              (typeof m.apiBase === "string" && m.apiBase.includes("localhost:3000")) ||
              (typeof m.title === "string" && m.title.toLowerCase().includes("dropstone"))
            );
            console.log('[VsCodeWebviewProtocol] Model matched from config:', dropModel?.title);
            if (dropModel?.apiKey) {
              this._dropstoneToken = dropModel.apiKey;
              console.log('[VsCodeWebviewProtocol] Token loaded from config');
            }
          }
        } catch (err) {
          console.warn("Failed to load Dropstone token from config:", err);
        }
        // Respond directly with token (or null) using same messageId so caller's IdeMessenger.request resolves
        webView.postMessage({
          messageType: msg.messageType,
          messageId: msg.messageId,
          data: { token: this._dropstoneToken, userInfo: this._dropstoneUserInfo },
        });
        return;
      }

      const respond = (message: any) =>
        this.send(msg.messageType, message, msg.messageId);

      const handlers = this.listeners.get(msg.messageType) || [];
      for (const handler of handlers) {
        try {
          const response = await handler(msg);
          if (
            response &&
            typeof response[Symbol.asyncIterator] === "function"
          ) {
            let next = await response.next();
            while (!next.done) {
              respond(next.value);
              next = await response.next();
            }
            respond({ done: true, content: next.value?.content });
          } else {
            respond(response || {});
          }
        } catch (e: any) {
          respond({ done: true, error: e });

          console.error(
            `Error handling webview message: ${JSON.stringify(
              { msg },
              null,
              2,
            )}\n\n${e}`,
          );

          let message = e.message;

          // Handle special Dropstone authentication errors first
          if (e.isDropstoneAuthError) {
            console.log('Detected Dropstone authentication error, triggering auth flow');

            // Send message to GUI to trigger auth dialog and clear token
            this.send("dropstoneAuthExpired", { error: e.dropstoneError || e.message });

            vscode.window
              .showErrorMessage(
                "Dropstone Authentication Expired: Your session has expired. Please log in again.",
                'Login To Dropstone',
                'Show Logs',
              )
              .then((selection) => {
                if (selection === 'Login To Dropstone') {
                  vscode.env.openExternal(
                    vscode.Uri.parse(
                      'https://server.dropstone.io/login',
                    ),
                  );
                } else if (selection === 'Show Logs') {
                  vscode.commands.executeCommand(
                    'workbench.action.toggleDevTools',
                  );
                }
              });
            return;
          }

          // Handle agent action limit exceeded errors
          if (message.includes("Agent Action Limit Exceeded") || (message.includes("429") && message.includes("agent"))) {
            vscode.window
              .showWarningMessage(
                message + " Upgrade to Premium for unlimited agent actions.",
                'Upgrade to Premium',
                'Show Logs',
              )
              .then((selection) => {
                if (selection === 'Upgrade to Premium') {
                  vscode.env.openExternal(
                    vscode.Uri.parse(
                      'https://dropstone.io/pricing',
                    ),
                  );
                } else if (selection === 'Show Logs') {
                  vscode.commands.executeCommand(
                    'workbench.action.toggleDevTools',
                  );
                }
              });
            return;
          }

          if (e.cause) {
            if (e.cause.name === "ConnectTimeoutError") {
              message = `Connection timed out. If you expect it to take a long time to connect, you can increase the timeout in config.json by setting "requestOptions": { "timeout": 10000 }. You can find the full config reference here: https://dropstone.io/reference/config`;
            } else if (e.cause.code === "ECONNREFUSED") {
              message = `Connection was refused. This likely means that there is no server running at the specified URL. If you are running your own server you may need to set the "apiBase" parameter in config.json. For example, you can set up an OpenAI-compatible server like here: https://dropstone.io/reference/Model%20Providers/openai#openai-compatible-servers--apis`;
            } else {
              message = `The request failed with "${e.cause.name}": ${e.cause.message}. If you're having trouble setting up PearAI, please see the troubleshooting guide for help.`;
            }
          }
          // PearAI login issues
          else if (message.includes("401") && message.includes("PearAI")) {
            vscode.window
              .showErrorMessage(
                message,
                'Login To Dropstone',
                'Show Logs',
              )
              .then((selection) => {
                if (selection === 'Login To Dropstone') {
                  // Redirect to auth login URL
                  vscode.env.openExternal(
                    vscode.Uri.parse(
                      'https://server.dropstone.io/login',
                    ),
                  );
                } else if (selection === 'Show Logs') {
                  vscode.commands.executeCommand(
                    'workbench.action.toggleDevTools',
                  );
                }
              });
          }
          // Dropstone authentication issues
          else if (message.includes("403") && (message.includes("Dropstone") || message.includes("Access denied") || message.includes("Authentication token required"))) {
            vscode.window
              .showErrorMessage(
                "Dropstone Authentication Required: " + message,
                'Login To Dropstone',
                'Show Logs',
              )
              .then((selection) => {
                if (selection === 'Login To Dropstone') {
                  // Redirect to Dropstone server login
                  vscode.env.openExternal(
                    vscode.Uri.parse(
                      'https://server.dropstone.io/login',
                    ),
                  );
                } else if (selection === 'Show Logs') {
                  vscode.commands.executeCommand(
                    'workbench.action.toggleDevTools',
                  );
                }
              });
          }
          // Handle token expiration specifically
          else if (message.includes("Token expired") || (message.includes("403") && message.includes("expired"))) {
            // Send message to GUI to trigger auth dialog
            this.send("dropstoneAuthExpired", { error: message });

            vscode.window
              .showErrorMessage(
                "Dropstone Authentication Required: " + message,
                'Login To Dropstone',
                'Show Logs',
              )
              .then((selection) => {
                if (selection === 'Login To Dropstone') {
                  // Redirect to Dropstone server login
                  vscode.env.openExternal(
                    vscode.Uri.parse(
                      'https://server.dropstone.io/login',
                    ),
                  );
                } else if (selection === 'Show Logs') {
                  vscode.commands.executeCommand(
                    'workbench.action.toggleDevTools',
                  );
                }
              });
          }
          // PearAI Free trial ended case
          else if (message.includes("403") && message.includes("PearAI")) {
            vscode.window
              .showErrorMessage(
                message,
                'View PearAI Pricing',
                'Show Logs',
              )
              .then((selection) => {
                if (selection === 'View PearAI Pricing') {
                  // Redirect to auth login URL
                  vscode.env.openExternal(
                    vscode.Uri.parse(
                      'https://dropstone.io/pricing',
                    ),
                  );
                } else if (selection === 'Show Logs') {
                  vscode.commands.executeCommand(
                    'workbench.action.toggleDevTools',
                  );
                }
              });
          }
          else if (message.includes("https://proxy-server")) {
            message = message.split("\n").filter((l: string) => l !== "")[1];
            try {
              message = JSON.parse(message).message;
            } catch {}
            if (message.includes("exceeded")) {
              message +=
                " To keep using PearAI, you can set up a local model or use your own API key.";
            }

            vscode.window
              .showInformationMessage(message, "Add API Key", "Use Local Model")
              .then((selection) => {
                if (selection === "Add API Key") {
                  this.request("addApiKey", undefined);
                } else if (selection === "Use Local Model") {
                  this.request("setupLocalModel", undefined);
                }
              });
          } else if (message.includes("Please sign in with GitHub")) {
            vscode.window
              .showInformationMessage(
                message,
                "Sign In",
                "Use API key / local model",
              )
              .then((selection) => {
                if (selection === "Sign In") {
                  vscode.authentication
                    .getSession("github", [], {
                      createIfNone: true,
                    })
                    .then(() => {
                      this.reloadConfig();
                    });
                } else if (selection === "Use API key / local model") {
                  this.request("openOnboarding", undefined);
                }
              });
          } else {
            vscode.window
              .showErrorMessage(
                message,
                "Show Logs",
                "Troubleshooting",
              )
              .then((selection) => {
                if (selection === "Show Logs") {
                  vscode.commands.executeCommand(
                    "workbench.action.toggleDevTools",
                  );
                } else if (selection === "Troubleshooting") {
                  vscode.env.openExternal(
                    vscode.Uri.parse(
                      "https://dropstone.io/troubleshooting",
                    ),
                  );
                }
              });
          }
        }
      }
    });
    this._webviewListeners.set(viewType, listener);
  }

  removeWebview(name: string) {
    const webView = this._webviews.get(name);
    if (webView) {
      this._webviews.delete(name);
      this._webviewListeners.get(name)?.dispose();
      this._webviewListeners.delete(name);
    }
  }

  constructor(private readonly reloadConfig: () => void) {}

  invoke<T extends keyof FromWebviewProtocol>(
    messageType: T,
    data: FromWebviewProtocol[T][0],
    messageId?: string,
  ): FromWebviewProtocol[T][1] {
    throw new Error("Method not implemented.");
  }

  onError(handler: (error: Error) => void): void {
    throw new Error("Method not implemented.");
  }

  public request<T extends keyof ToWebviewProtocol>(
    messageType: T,
    data: ToWebviewProtocol[T][0],
    specificWebviews?: string[]
  ): Promise<ToWebviewProtocol[T][1]> {
    const messageId = uuidv4();
    return new Promise(async (resolve) => {
      let i = 0;
      while (this.webviews.size === 0) {
        if (i >= 10) {
          resolve(undefined);
          return;
        } else {
          await new Promise((res) => setTimeout(res, i >= 5 ? 1000 : 500));
          i++;
        }
      }

      this.send(messageType, data, messageId, specificWebviews);
      const disposables: vscode.Disposable[] = [];
      this.webviews.forEach((webview) => {
        const disposable = webview.onDidReceiveMessage(
          (msg: Message<ToWebviewProtocol[T][1]>) => {
            if (msg.messageId === messageId) {
              resolve(msg.data);
              disposables.forEach(d => d.dispose());
            }
          }
        );
        disposables.push(disposable);
      });
    });
  }
}
