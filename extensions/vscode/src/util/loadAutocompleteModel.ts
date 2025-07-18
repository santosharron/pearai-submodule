import type { ILLM } from "core";
import { ConfigHandler } from "core/config/ConfigHandler";
import Ollama from "core/llm/llms/Ollama";
import { GlobalContext } from "core/util/GlobalContext";
import * as vscode from "vscode";

export class TabAutocompleteModel {
  private _llm: ILLM | undefined;
  private defaultTag = "starcoder2:3b";
  private defaultTagName = "Starcoder2 3b";
  private globalContext: GlobalContext = new GlobalContext();

  private shownOllamaWarning = false;
  private shownDeepseekWarning = false;

  private configHandler: ConfigHandler;

  constructor(configHandler: ConfigHandler) {
    this.configHandler = configHandler;
  }

  clearLlm() {
    this._llm = undefined;
  }

  async getDefaultTabAutocompleteModel() {
    const llm = new Ollama({
      model: this.defaultTag,
    });

    try {
      const models = await llm.listModels();
      if (!models.includes(this.defaultTag)) {
        if (!this.shownDeepseekWarning) {
          vscode.window
            .showWarningMessage(
              `Your local Ollama instance doesn't yet have ${this.defaultTagName}. To download this model, run \`ollama run ${this.defaultTag}\` (recommended). If you'd like to use a custom model for tab autocomplete, learn more in the docs`,
              "Documentation",
              "Copy Command",
            )
            .then((value) => {
              if (value === "Documentation") {
                vscode.env.openExternal(
                  vscode.Uri.parse(
                    "https://dropstone.io/docs/tab-autocomplete",
                  ),
                );
              } else if (value === "Copy Command") {
                vscode.env.clipboard.writeText(`ollama run ${this.defaultTag}`);
              }
            });
          this.shownDeepseekWarning = true;
        }
        return undefined;
      }
    } catch (e) {
      return undefined;
    }

    return llm;
  }

  async get() {
    if (!this._llm) {
      const config = await this.configHandler.loadConfig();
      if (config.tabAutocompleteModels?.length) {
        const selected = this.globalContext.get("selectedTabAutocompleteModel");
        if (selected) {
          this._llm =
            config.tabAutocompleteModels?.find(
              (model) => model.title === selected,
            ) ?? config.tabAutocompleteModels?.[0];
        } else {
          if (config.tabAutocompleteModels[0].title) {
            this.globalContext.update(
              "selectedTabAutocompleteModel",
              config.tabAutocompleteModels[0].title,
            );
          }
          this._llm = config.tabAutocompleteModels[0];
        }
      } else {
        this._llm = await this.getDefaultTabAutocompleteModel();
      }
    }

    return this._llm;
  }
}
