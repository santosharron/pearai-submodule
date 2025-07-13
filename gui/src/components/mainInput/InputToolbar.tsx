import {
  PhotoIcon as OutlinePhotoIcon,
  PlusIcon,
  ArrowUpIcon,
} from "@heroicons/react/24/outline";
import {
  ArrowTurnDownLeftIcon
} from "@heroicons/react/16/solid";
import { Button } from "@/components/ui/button";
import { InputModifiers, ModelDescription } from "core";
import { modelSupportsImages } from "core/llm/autodetect";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import {
  defaultBorderRadius,
  lightGray,
  vscBadgeBackground,
  vscBadgeForeground,
  vscForeground,
  vscButtonForeground,
  vscButtonBackground,

  vscInputBackground,
} from "..";
import { selectUseActiveFile } from "../../redux/selectors";
import { defaultModelSelector } from "../../redux/selectors/modelSelectors";
import {
  getAltKeyLabel,
  getFontSize,
  getMetaKeyLabel,
  isMetaEquivalentKeyPressed,
} from "../../util";
import { setDefaultModel, setConfig } from "../../redux/slices/stateSlice";
import { RootState } from "@/redux/store";
import { useLocation } from "react-router-dom";
import { ShortcutButton } from "../ui/shortcutButton";
import { cn } from "@/lib/utils";


const StyledDiv = styled.div<{ isHidden: boolean }>`
  display: ${(props) => (props.isHidden ? "none" : "flex")};
  justify-content: space-between;
  gap: 4px;
  align-items: flex-end;
  z-index: 10;
  cursor: ${(props) => (props.isHidden ? "default" : "text")};
  pointer-events: ${(props) => (props.isHidden ? "none" : "auto")};
`;

interface InputToolbarProps {
  onEnter?: (modifiers: InputModifiers) => void;
  usingCodebase?: boolean;
  onAddContextItem?: () => void;

  onClick?: () => void;

  onImageFileSelected?: (file: File) => void;

  hidden?: boolean;
  showNoContext: boolean;
  source?: 'perplexity' | 'continue';
}

function InputToolbar(props: InputToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileSelectHovered, setFileSelectHovered] = useState(false);
  const defaultModel = useSelector(defaultModelSelector);
  const perplexityMode = props.source === 'perplexity';

  const useActiveFile = useSelector(selectUseActiveFile);
  const allModels = useSelector(
    (state: RootState) => state.state.config.models,
  );

  const dispatch = useDispatch();
  const location = useLocation();
  const currentConfig = useSelector((state: RootState) => state.state.config);

  // Function to fetch models from the public API
  const fetchModelsFromAPI = async () => {
    try {
      const response = await fetch('/api/models/public', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.models && Object.keys(data.models).length > 0) {
          // Convert API models to the format expected by the config
          const apiModels: ModelDescription[] = Object.values(data.models).map((model: any) => ({
            title: model.name,
            provider: "custom" as const,
            model: model.id,
            contextLength: model.maxTokens || 100000,
            systemMessage: "You are an expert software developer. You give helpful and concise responses based on latest documentation and software engineering best practices.",
            apiBase: "https://server.dropstone.io/v1",
            requestOptions: {
              headers: {
                "Content-Type": "application/json"
              }
            }
          }));
          
          // Check if we have new models that aren't in the current config
          const newModels = apiModels.filter(apiModel => 
            !currentConfig.models.some(existingModel => 
              existingModel.title === apiModel.title || 
              existingModel.model === apiModel.model
            )
          );

          // If we have new models, update the config
          if (newModels.length > 0) {
            console.log(`Found ${newModels.length} new models from API:`, newModels.map(m => m.title));
            
            const updatedConfig = {
              ...currentConfig,
              models: [...currentConfig.models, ...newModels]
            };
            
            dispatch(setConfig(updatedConfig));
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch models from API:', error);
    }
  };

  // Fetch models on component mount and set up periodic fetching
  useEffect(() => {
    // Initial fetch
    fetchModelsFromAPI();

    // Set up periodic fetching every 30 seconds
    const interval = setInterval(fetchModelsFromAPI, 30000);

    return () => clearInterval(interval);
  }, [currentConfig]);

  useEffect(() => {
    if (perplexityMode) {
      const perplexity = allModels.find((model) =>
        model?.title?.toLowerCase().includes("perplexity"),
      );
      dispatch(setDefaultModel({ title: perplexity?.title }));
    }
  }, [location, allModels]);

  return (
    <StyledDiv
      isHidden={props.hidden}
      onClick={props.onClick}
      id="input-toolbar"
    >
      <div className="flex-grow">
        {!perplexityMode && (
          <div className="flex gap-3 items-center">
            <ShortcutButton
              keys={["⎇", "⏎"]}
              label="Use current file"
              onClick={() => ({
                useCodebase: false,
                noContext: !useActiveFile,
              })}
            />
            {/* TODO:  add onClick to add file*/}
            <ShortcutButton
              keys={[getMetaKeyLabel(), "⏎"]}
              onClick={() => {
                props.onEnter({
                  useCodebase: true,
                  noContext: !useActiveFile,
                });
              }}
              label="Use codebase"
            />
          </div>
        )}
      </div>


      {/* <span className="flex gap-2 items-center whitespace-nowrap">
          <>
            {!perplexityMode && <ModelSelect />}
            <StyledSpan
              onClick={(e) => {
                props.onAddContextItem();
              }}
              className="hover:underline cursor-pointer"
            >
              Add Context{" "}
              <PlusIcon className="h-2.5 w-2.5" aria-hidden="true" />
            </StyledSpan>
          </>
          {defaultModel &&
            modelSupportsImages(
              defaultModel.provider,
              defaultModel.model,
              defaultModel?.title || "unknown",
              defaultModel.capabilities,
            ) && (
              <span
                className="ml-1 mt-0.5 cursor-pointer"
                onMouseLeave={() => setFileSelectHovered(false)}
                onMouseEnter={() => setFileSelectHovered(true)}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept=".jpg,.jpeg,.png,.gif,.svg,.webp"
                  onChange={(e) => {
                    for (const file of e.target.files) {
                      props.onImageFileSelected(file);
                    }
                  }}
                />
                {fileSelectHovered ? (
                  <SolidPhotoIcon
                    width="1.4em"
                    height="1.4em"
                    color={lightGray}
                    onClick={(e) => {
                      fileInputRef.current?.click();
                    }}
                  />
                ) : (
                  <OutlinePhotoIcon
                    width="1.4em"
                    height="1.4em"
                    color={lightGray}
                    onClick={(e) => {
                      fileInputRef.current?.click();
                    }}
                  />
                )}
              </span>
            )}
        </span> */}

      {/* {props.showNoContext ? (
            <span
              style={{
                color: props.usingCodebase ? vscBadgeBackground : lightGray,
                backgroundColor: props.usingCodebase
                  ? lightGray + "33"
                  : undefined,
                borderRadius: defaultBorderRadius,
                padding: "2px 4px",
              }}
            >
              {getAltKeyLabel()} ⏎{" "}
              {useActiveFile ? "No context" : "Use active file"}
            </span>
          ) : !bareChatMode ? (
            <StyledSpan
              style={{
                color: props.usingCodebase ? vscBadgeBackground : lightGray,
                backgroundColor: props.usingCodebase
                  ? lightGray + "33"
                  : undefined,
                borderRadius: defaultBorderRadius,
                padding: "2px 4px",
              }}
              onClick={(e) => {
                props.onEnter({
                  useCodebase: true,
                  noContext: !useActiveFile,
                });
              }}
              className={"hover:underline cursor-pointer float-right"}
            >
              {getMetaKeyLabel()} ⏎ Use codebase
            </StyledSpan>
          ) : null} */}
      <Button
        className={cn("gap-1 h-6 text-xs px-2", perplexityMode ?
          "bg-[#08a6a1] text-white"
          : "bg-[#1e40af] text-white hover:bg-[#1e3a8a] transition-all duration-300")}

        onClick={(e) => {
          props.onEnter?.({
            useCodebase: false,
            noContext: !useActiveFile
          });
        }}
      >
        Send <ArrowUpIcon width="12px" height="12px" />
      </Button>
      {/* <EnterButton
            offFocus={props.usingCodebase}
            onClick={(e) => {
              props.onEnter({
                useCodebase: isMetaEquivalentKeyPressed(e),
                noContext: useActiveFile ? e.altKey : !e.altKey,
              });
            }}
          >
            ⏎ Send
          </EnterButton> */}
    </StyledDiv>
  );
}

export default InputToolbar;
