import Document from "@tiptap/extension-document";
import History from "@tiptap/extension-history";
import Image from "@tiptap/extension-image";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import { Plugin } from "@tiptap/pm/state";
import { Editor, EditorContent, JSONContent, useEditor } from "@tiptap/react";
import {
  ContextItemWithId,
  ContextProviderDescription,
  InputModifiers,
  RangeInFile,
} from "core";
import { modelSupportsImages } from "core/llm/autodetect";
import { getBasename, getRelativePath } from "core/util";
import { usePostHog } from "posthog-js/react";
import { useContext, useEffect, useMemo, useRef, useState, memo } from "react";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import {
  defaultBorderRadius,
  lightGray,
  vscBadgeBackground,
  vscForeground,
  vscInputBackground,
  vscInputBorder,
  vscSidebarBorder,
  vscBackground,
  vscEditorBackground,
  vscInputBorderFocus,
} from "..";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { SubmenuContextProvidersContext } from "../../context/SubmenuContextProviders";
import useHistory from "../../hooks/useHistory";
import { useInputHistory } from "../../hooks/useInputHistory";
import useUpdatingRef from "../../hooks/useUpdatingRef";
import { useWebviewListener } from "../../hooks/useWebviewListener";
import { selectUseActiveFile } from "../../redux/selectors";
import { defaultModelSelector } from "../../redux/selectors/modelSelectors";
import {
  consumeMainEditorContent,
  setEditingContextItemAtIndex,
} from "../../redux/slices/stateSlice";
import { RootState } from "../../redux/store";
import {
  getFontSize,
  isJetBrains,
  isMetaEquivalentKeyPressed,
  isWebEnvironment,
} from "../../util";
import CodeBlockExtension from "./CodeBlockExtension";
import { SlashCommand } from "./CommandsExtension";
import InputToolbar from "./InputToolbar";
import ContextToolbar from "./ContextToolbar";
import { Mention } from "./MentionExtension";
import "./TipTapEditor.css";
import {
  getContextProviderDropdownOptions,
  getSlashCommandDropdownOptions,
} from "./getSuggestion";
import { ComboBoxItem } from "./types";
import { useLocation } from "react-router-dom";
import { TipTapContextMenu } from './TipTapContextMenu';

const InputBoxDiv = styled.div<{ isNewSession?: boolean }>`
	position: relative;
  resize: none;
  gap: 12px;
  padding: 12px;
  font-family: inherit;
  border-radius: 12px;
  margin: 0;
  width: 100%;
  background-color: ${vscEditorBackground};
  color: ${vscForeground};
  font-size: ${getFontSize()}px;
  line-height: 18px;
  word-break: break-word;
  overflow-x: hidden;

  &::placeholder {
    color: ${lightGray}cc;
  }

  // styles for ProseMirror placeholder
  .ProseMirror p.is-editor-empty:first-child::before {
    color: ${lightGray}cc;
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
    white-space: pre-wrap; // Allow wrapping
    width: 100%; // Ensure it takes full width
  }

  display: flex;
  flex-direction: column;

  .ProseMirror {
    max-height: 300px;
    min-height: ${props => props.isNewSession ? `${getFontSize() * 6}px` : 'auto'}; // Approximately 2.5 lines of text
    // Alternative fixed height approach:
    // min-height: 60px;
    flex: 1;
    overflow-y: auto;
    // border: 1px solid;
  }
`;

const HoverDiv = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  opacity: 0.5;
  background-color: ${vscBadgeBackground};
	border-radius: ${defaultBorderRadius};
  color: ${vscForeground};
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
	pointer-events: none;
`;

const HoverTextDiv = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  color: ${vscForeground};
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
	pointer-events: none;
`;

const getPlaceholder = (historyLength: number, location: any, source: 'perplexity' | 'continue') => {

  if (source === 'perplexity') {
    return historyLength === 0 ? "Ask Search about up-to-date information, like documentation changes." : "Ask a follow-up";
  }

  return historyLength === 0
    ? "Ask questions about code or make changes. Use / for commands, and @ to add context."
    : "Ask a follow-up";
};

export function getDataUrlForFile(file: File, img: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return dataUrl;
}

interface TipTapEditorProps {
  availableContextProviders: ContextProviderDescription[];
  availableSlashCommands: ComboBoxItem[];
  isMainInput: boolean;
  onEnter: (editorState: JSONContent, modifiers: InputModifiers) => void;
  editorState?: JSONContent;
  source?: 'perplexity' | 'continue';
  onChange?: (newState: JSONContent) => void;
  onHeightChange?: (height: number) => void;
}

export const handleImageFile = async (
  file: File,
  onError?: (message: string) => void
): Promise<[HTMLImageElement, string] | undefined> => {
  const filesize = file.size / 1024 / 1024; // filesize in MB

  if (
    [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/svg",
      "image/webp",
    ].includes(file.type) &&
    filesize < 10
  ) {
    const img = new (globalThis as any).Image() as HTMLImageElement;
    const objectUrl = URL.createObjectURL(file);

    img.src = objectUrl;

    return await new Promise((resolve) => {
      const safeRevokeURL = () => {
        try {
          URL.revokeObjectURL(img.src);
        } catch (error) {
          console.error('Error revoking URL:', error);
        }
      };

      img.onload = function () {
        const dataUrl = getDataUrlForFile(file, img);
        const image = new (window as any).Image() as HTMLImageElement;

        image.src = dataUrl;
        image.onload = function () {
          resolve([image, dataUrl]);
          safeRevokeURL();
        };
        image.onerror = function () {
          safeRevokeURL();
          resolve(undefined);
        };
      };
      img.onerror = function () {
        safeRevokeURL();
        resolve(undefined);
      };
    });
  } else if (onError) {
    onError("Images need to be in an accepted format and less than 10MB in size.");
  }
};

export const handleCopy = (editor: Editor) => {
  const selection = editor.state.selection;
  const text = editor.state.doc.textBetween(selection.from, selection.to, '\n');
  navigator.clipboard.writeText(text);
};

export const handleCut = (editor: Editor) => {
  const selection = editor.state.selection;
  const text = editor.state.doc.textBetween(selection.from, selection.to, '\n');
  navigator.clipboard.writeText(text);
  editor.commands.deleteSelection();
};

export const handlePaste = async (editor: Editor) => {
  try {
    const items = await navigator.clipboard.read();

    for (const item of items) {
      // Handle images
      if (item.types.includes('image/png') || item.types.includes('image/jpeg')) {
        try {
          const imageBlob = await item.getType(item.types.find(type => type.startsWith('image/')) || 'image/png');
          const file = new File([imageBlob], 'pasted-image.png', { type: 'image/png' });
          const result = await handleImageFile(file);

          if (result) {
            const [, dataUrl] = result;

            editor.commands.setImage({ src: dataUrl });
            return true;
          }
        } catch (err) {
          console.error('Failed to paste image:', err);
        }
      }
    }

    // Fall back to text handling if no image
    const clipboardText = await navigator.clipboard.readText();

    if (clipboardText) {
      editor.commands.deleteSelection();
      editor.commands.insertContent(clipboardText.trim());
      return true;
    }
  } catch (error) {
    console.error('Error handling paste:', error);
  }

  return false;
};

const TipTapEditor = memo(function TipTapEditor({
  availableContextProviders,
  availableSlashCommands,
  isMainInput,
  onEnter,
  editorState,
  source = 'continue',
  onChange,
  onHeightChange,
}: TipTapEditorProps) {
  const dispatch = useDispatch();

  const ideMessenger = useContext(IdeMessengerContext);
  const { getSubmenuContextItems } = useContext(SubmenuContextProvidersContext);

  const historyLength = useSelector(
    (store: RootState) => {
      switch (source) {
        case 'perplexity':
          return store.state.perplexityHistory.length;
        default:
          return store.state.history.length;
      }
    }
  );

  // Create a unique key for each editor instance
  const editorKey = useMemo(() => `${(source || 'continue')}-editor`, [source]);

  const useActiveFile = useSelector(selectUseActiveFile);

  const { saveSession } = useHistory(dispatch, source);

  const posthog = usePostHog();
  const [isEditorFocused, setIsEditorFocused] = useState(false);

  const inSubmenuRef = useRef<string | undefined>(undefined);
  const inDropdownRef = useRef(false);

  const enterSubmenu = async (editor: Editor, providerId: string) => {
    const contents = editor.getText();
    const indexOfAt = contents.lastIndexOf("@");
    if (indexOfAt === -1) {
      return;
    }

    editor.commands.deleteRange({
      from: indexOfAt + 2,
      to: contents.length + 1,
    });
    inSubmenuRef.current = providerId;

    // to trigger refresh of suggestions
    editor.commands.insertContent(" ");
    editor.commands.deleteRange({
      from: editor.state.selection.anchor - 1,
      to: editor.state.selection.anchor,
    });
  };

  const onClose = () => {
    inSubmenuRef.current = undefined;
    inDropdownRef.current = false;
  };

  const onOpen = () => {
    inDropdownRef.current = true;
  };

  const contextItems = useSelector(
    (store: RootState) => store.state.contextItems,
  );
  const defaultModel = useSelector(defaultModelSelector);
  const defaultModelRef = useUpdatingRef(defaultModel);
  const getSubmenuContextItemsRef = useUpdatingRef(getSubmenuContextItems);
  const availableContextProvidersRef = useUpdatingRef(availableContextProviders)

  const historyLengthRef = useUpdatingRef(historyLength);
  const availableSlashCommandsRef = useUpdatingRef(
    availableSlashCommands,
  );

  const active = useSelector((store: RootState) => {
    switch (source) {
      case 'perplexity':
        return store.state.perplexityActive;
      default:
        return store.state.active;
    }
  });

  const activeRef = useUpdatingRef(active);

  const mainEditorContent = useSelector(
    (store: RootState) => store.state.mainEditorContent,
  );

  const { prevRef, nextRef, addRef } = useInputHistory();
  const location = useLocation();

  // Keep track of the last valid content
  const lastContentRef = useRef(editorState);

  useEffect(() => {
    if (editorState) {
      lastContentRef.current = editorState;
    }
  }, [editorState]);

  const editor: Editor = useEditor({
    extensions: [
      Document,
      History,
      Image.extend({
        renderHTML({ HTMLAttributes }) {
          const wrapper = document.createElement('div');
          wrapper.className = 'image-wrapper';

          const img = document.createElement('img');
          Object.entries(HTMLAttributes).forEach(([key, value]) => {
            img.setAttribute(key, value as string);
          });

          const imageIcon = document.createElement('div');
          imageIcon.className = 'image-icon';
          const deleteButton = document.createElement('button');

          deleteButton.className = 'image-delete-button';
          deleteButton.textContent = 'Image';
          deleteButton.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Dispatch a custom event that we'll handle in the editor
            const event = new CustomEvent('deleteImage', {
              detail: { imgElement: (e.target as HTMLElement).parentElement?.querySelector('img') }
            });
            window.dispatchEvent(event);
          };

          wrapper.appendChild(img);
          wrapper.appendChild(imageIcon);
          wrapper.appendChild(deleteButton);

          return wrapper;
        },
        addProseMirrorPlugins() {
          const plugin = new Plugin({
            props: {
              handleDOMEvents: {
                paste(view, event) {
                  const items = event.clipboardData.items;
                  for (const item of items) {
                    const file = item.getAsFile();
                    const model = defaultModelRef.current;

                    file &&
                      modelSupportsImages(
                        model.provider,
                        model.model,
                        model?.title || "unknown",
                        model.capabilities,
                      ) &&
                      handleImageFile(file).then((resp) => {
                        if (!resp) {
                          return;
                        }
                        const [img, dataUrl] = resp;
                        const { schema } = view.state;
                        const node = schema.nodes.image.create({
                          src: dataUrl,
                        });
                        const tr = view.state.tr.insert(0, node);
                        view.dispatch(tr);
                      });
                  }
                },
              },
            },
          });
          return [plugin];
        },
      }),
      Placeholder.configure({
        placeholder: () => getPlaceholder(historyLengthRef.current, location, source),
      }),
      Paragraph.extend({
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              if (inDropdownRef.current) {
                return false;
              }

              onEnterRef.current({
                useCodebase: false,
                noContext: !useActiveFile,
              });
              return true;
            },

            "Mod-Enter": () => {
              onEnterRef.current({
                useCodebase: true,
                noContext: !useActiveFile,
              });
              return true;
            },
            "Alt-Enter": () => {
              posthog.capture("gui_use_active_file_enter");

              onEnterRef.current({
                useCodebase: false,
                noContext: useActiveFile,
              });

              return true;
            },
            "Mod-Backspace": () => {
              // If you press cmd+backspace wanting to cancel,
              // but are inside of a text box, it shouldn't
              // delete the text
              if (activeRef.current) {
                return true;
              }
            },
            "Shift-Enter": () =>
              this.editor.commands.first(({ commands }) => [
                () => commands.newlineInCode(),
                () => commands.createParagraphNear(),
                () => commands.liftEmptyBlock(),
                () => commands.splitBlock(),
              ]),

            ArrowUp: () => {
              if (this.editor.state.selection.anchor > 1) {
                return false;
              }

              const previousInput = prevRef.current(
                this.editor.state.toJSON().doc,
              );
              if (previousInput) {
                this.editor.commands.setContent(previousInput);
                setTimeout(() => {
                  this.editor.commands.blur();
                  this.editor.commands.focus("start");
                }, 0);
                return true;
              }
            },
            ArrowDown: () => {
              if (
                this.editor.state.selection.anchor <
                this.editor.state.doc.content.size - 1
              ) {
                return false;
              }
              const nextInput = nextRef.current();
              if (nextInput) {
                this.editor.commands.setContent(nextInput);
                setTimeout(() => {
                  this.editor.commands.blur();
                  this.editor.commands.focus("end");
                }, 0);
                return true;
              }
            },
          };
        },
      }).configure({
        HTMLAttributes: {
          class: "m-0",
        },
      }),
      Text,
      Mention.configure({
        HTMLAttributes: {
          class: "mention",
        },
        suggestion: getContextProviderDropdownOptions(
          availableContextProvidersRef,
          getSubmenuContextItemsRef,
          enterSubmenu,
          onClose,
          onOpen,
          inSubmenuRef,
          ideMessenger,
        ),
        renderHTML: (props) => {
          return `@${props.node.attrs.label || props.node.attrs.id}`;
        },
      }),
      SlashCommand.configure({
        HTMLAttributes: {
          class: "mention",
        },
        suggestion: getSlashCommandDropdownOptions(
          availableSlashCommandsRef,
          onClose,
          onOpen,
          ideMessenger,
        ),
        renderText: (props) => {
          return props.node.attrs.label;
        },
      }),
      CodeBlockExtension,
      HardBreak.extend({
        renderText() {
          return '\n'
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: "outline-none",
        style: `font-size: ${getFontSize()}px;`,
      },
    },
    content: lastContentRef.current,
    editable: true,
    onFocus: () => setIsEditorFocused(true),
    onBlur: () => setIsEditorFocused(false),
    onCreate({ editor }) {
      if (lastContentRef.current) {
        editor.commands.setContent(lastContentRef.current);
      }
    }
  }, []);  // Remove dependencies to prevent recreation

  const editorFocusedRef = useUpdatingRef(editor?.isFocused, [editor]);


  const isPerplexity = source === 'perplexity';

  useEffect(() => {
    const handleShowFile = (event: CustomEvent) => {
      const filepath = event.detail.filepath;
      ideMessenger.post("showFile", { filepath });
    };

    window.addEventListener('showFile', handleShowFile as EventListener);
    return () => {
      window.removeEventListener('showFile', handleShowFile as EventListener);
    };
  }, [ideMessenger]);

  useEffect(() => {
    if (isJetBrains()) {
      // This is only for VS Code .ipynb files
      return;
    }

    if (isWebEnvironment()) {
      const handleKeyDown = async (event: KeyboardEvent) => {
        if (!editor || !editorFocusedRef.current) {
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "x") {
          // Cut
          const selectedText = editor.state.doc.textBetween(
            editor.state.selection.from,
            editor.state.selection.to,
          );
          navigator.clipboard.writeText(selectedText);
          editor.commands.deleteSelection();
          event.preventDefault();
        } else if ((event.metaKey || event.ctrlKey) && event.key === "c") {
          // Copy
          const selectedText = editor.state.doc.textBetween(
            editor.state.selection.from,
            editor.state.selection.to,
          );
          navigator.clipboard.writeText(selectedText);
          event.preventDefault();
        } else if ((event.metaKey || event.ctrlKey) && event.key === "v") {
          // Paste
          event.preventDefault(); // Prevent default paste behavior
          const clipboardText = await navigator.clipboard.readText();
          editor.commands.insertContent(clipboardText.trim());
        }
      };

      document.addEventListener("keydown", handleKeyDown);

      return () => {
        document.removeEventListener("keydown", handleKeyDown);
      };
    }

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (!editor || !editorFocusedRef.current) {
        return;
      }

      if (event.metaKey && event.key === "x") {
        document.execCommand("cut");
        event.stopPropagation();
        event.preventDefault();
      } else if (event.metaKey && event.key === "v") {
        document.execCommand("paste");
        event.stopPropagation();
        event.preventDefault();
      } else if (event.metaKey && event.key === "c") {
        document.execCommand("copy");
        event.stopPropagation();
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor, editorFocusedRef]);

  useEffect(() => {
    if (mainEditorContent && editor) {
      editor.commands.setContent(mainEditorContent);
      dispatch(consumeMainEditorContent());
    }
  }, [mainEditorContent, editor]);

  const onEnterRef = useUpdatingRef(
    (modifiers: InputModifiers) => {
      const json = editor.getJSON();

      // Don't do anything if input box is empty
      if (!json.content?.some((c) => c.content)) {
        return;
      }

      onEnter(json, modifiers);

      if (isMainInput) {
        const content = editor.state.toJSON().doc;
        addRef.current(content);
        editor.commands.clearContent(true);
      }
    },
    [onEnter, editor, isMainInput],
  );

  // This is a mechanism for overriding the IDE keyboard shortcut when inside of the webview
  const [ignoreHighlightedCode, setIgnoreHighlightedCode] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: any) => {
      if (
        isMetaEquivalentKeyPressed(event) &&
        (isJetBrains() ? event.code === "KeyJ" : event.code === "KeyL")
      ) {
        setIgnoreHighlightedCode(true);
        setTimeout(() => {
          setIgnoreHighlightedCode(false);
        }, 100);
      } else if (event.key === "Escape") {
        ideMessenger.post("focusEditor", undefined);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Re-focus main input after done generating
  useEffect(() => {
    if (editor && !active && isMainInput && document.hasFocus()) {
      editor.commands.focus(undefined, { scrollIntoView: false });
    }
  }, [isMainInput, active, editor]);

  // IDE event listeners
  useWebviewListener(
    "userInput",
    async (data) => {
      if (!isMainInput) {
        return;
      }
      editor?.commands.insertContent(data.input);
      onEnterRef.current({ useCodebase: false, noContext: true });
    },
    [editor, onEnterRef.current, isMainInput],
  );

  useWebviewListener(
    "addPerplexityContextinChat",
    async (data) => {
      if (!isMainInput || !editor) {
        return;
      }

      const item: ContextItemWithId = {
        content: data.text,
        name: "Context from Dropstone Search",
        description: "Context from result of Perplexity AI",
        id: {
          providerTitle: "code",
          itemId: data.text,
        },
        language: data.language,
      };

      let index = 0;
      for (const el of editor.getJSON().content) {
        if (el.type === "codeBlock") {
          index += 2;
        } else {
          break;
        }
      }
      editor
        .chain()
        .insertContentAt(index, {
          type: "codeBlock",
          attrs: {
            item,
          },
        })
        .run();

      setTimeout(() => {
        editor.commands.blur();
        editor.commands.focus("end");
      }, 20);
    },
    [editor, onEnterRef.current, isMainInput],
  );

  useWebviewListener("jetbrains/editorInsetRefresh", async () => {
    editor?.chain().clearContent().focus().run();
  });

  useWebviewListener(
    "focusContinueInput",
    async (data) => {
      if (!isMainInput) {
        return;
      }
      if (historyLength > 0) {
        saveSession();
      }
      setTimeout(() => {
        editor?.commands.blur();
        editor?.commands.focus("end");
      }, 20);
    },
    [historyLength, saveSession, editor, isMainInput],
  );

  useWebviewListener(
    "focusContinueInputWithoutClear",
    async () => {
      if (!isMainInput) {
        return;
      }
      setTimeout(() => {
        editor?.commands.focus("end");
      }, 20);
    },
    [editor, isMainInput],
  );

  useWebviewListener(
    "focusContinueInputWithNewSession",
    async () => {
      if (!isMainInput) {
        return;
      }
      saveSession();
      setTimeout(() => {
        editor?.commands.focus("end");
      }, 20);
    },
    [editor, isMainInput],
  );

  useWebviewListener(
    "highlightedCode",
    async (data) => {
      if (!data.rangeInFileWithContents.contents || !isMainInput || !editor) {
        return;
      }
      if (!ignoreHighlightedCode) {
        const rif: RangeInFile & { contents: string } =
          data.rangeInFileWithContents;
        const basename = getBasename(rif.filepath);
        const relativePath = getRelativePath(
          rif.filepath,
          await ideMessenger.ide.getWorkspaceDirs(),
        );
        const rangeStr = `(${rif.range.start.line + 1}-${rif.range.end.line + 1
          })`;
        const item: ContextItemWithId = {
          content: rif.contents,
          name: `${basename} ${rangeStr}`,
          // Description is passed on to the LLM to give more context on file path
          description: `${relativePath} ${rangeStr}`,
          id: {
            providerTitle: "code",
            itemId: rif.filepath,
          },
        };

        let index = 0;
        for (const el of editor.getJSON().content) {
          if (el.type === "codeBlock") {
            index += 2;
          } else {
            break;
          }
        }
        editor
          .chain()
          .insertContentAt(index, {
            type: "codeBlock",
            attrs: {
              item,
            },
          })
          .run();

        if (data.prompt) {
          editor.commands.focus("end");
          editor.commands.insertContent(data.prompt);
        }

        if (data.shouldRun) {
          onEnterRef.current({ useCodebase: false, noContext: true });
        }

        setTimeout(() => {
          editor.commands.blur();
          editor.commands.focus("end");
        }, 20);
      }
      setIgnoreHighlightedCode(false);
    },
    [
      editor,
      isMainInput,
      historyLength,
      ignoreHighlightedCode,
      isMainInput,
      onEnterRef.current,
    ],
  );

  useWebviewListener(
    "isContinueInputFocused",
    async () => {
      return isMainInput && editorFocusedRef.current;
    },
    [editorFocusedRef, isMainInput],
    !isMainInput,
  );

  const [showDragOverMsg, setShowDragOverMsg] = useState(false);

  useEffect(() => {
    const overListener = (event: DragEvent) => {
      if (event.shiftKey) {
        return;
      }
      setShowDragOverMsg(true);
    };
    window.addEventListener("dragover", overListener);

    const leaveListener = (event: DragEvent) => {
      if (event.shiftKey) {
        setShowDragOverMsg(false);
      } else {
        setTimeout(() => setShowDragOverMsg(false), 2000);
      }
    };
    window.addEventListener("dragleave", leaveListener);

    return () => {
      window.removeEventListener("dragover", overListener);
      window.removeEventListener("dragleave", leaveListener);
    };
  }, []);

  const [optionKeyHeld, setOptionKeyHeld] = useState(false);

  // Use onTransaction to track content changes
  useEffect(() => {
    if (editor) {
      editor.on('transaction', () => {
        const newContent = editor.getJSON();
        lastContentRef.current = newContent;
        onChange?.(newContent);

        // If /edit is typed and no context items are selected, select the first

        if (contextItems.length > 0) {
          return;
        }

        const codeBlock = newContent.content?.find((el) => el.type === "codeBlock");
        if (!codeBlock) {
          return;
        }

        // Search for slashcommand type
        for (const p of newContent.content) {
          if (
            p.type !== "paragraph" ||
            !p.content ||
            typeof p.content === "string"
          ) {
            continue;
          }
          for (const node of p.content) {
            if (
              node.type === "slashcommand" &&
              ["/edit", "/comment"].includes(node.attrs.label)
            ) {
              // Update context items
              dispatch(
                setEditingContextItemAtIndex({ item: codeBlock.attrs.item }),
              );
              return;
            }
          }
        }
      });
    }
  }, [editor, onChange, contextItems, dispatch]);

  // Prevent content flash during streaming
  useEffect(() => {
    if (editor && lastContentRef.current) {
      const currentContent = editor.getJSON();
      if (JSON.stringify(currentContent) !== JSON.stringify(lastContentRef.current)) {
        editor.commands.setContent(lastContentRef.current);
      }
    }
  }, [editor, source]);


  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
  } | null>(null);

  // Add context menu handler
  useEffect(() => {
    if (!editor) return;

    const handleContextMenu = (event: MouseEvent) => {
      if (!editor.view.dom.contains(event.target as Node)) return;

      event.preventDefault();
      event.stopPropagation();

      setContextMenu({
        position: { x: event.clientX, y: event.clientY },
      });
    };

    const editorDom = editor.view.dom;
    editorDom.addEventListener('contextmenu', handleContextMenu);

    return () => {
      editorDom.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [editor]);

  // Add this effect in your component
  useEffect(() => {
    if (!editor) return;

    const handleDeleteImage = (event: CustomEvent) => {
      const imgElement = event.detail.imgElement;
      if (imgElement && editor) {
        // Find all image nodes in the editor
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'image' && node.attrs.src === imgElement.src) {
            // Delete the specific image node at this position
            editor.commands.deleteRange({ from: pos, to: pos + 1 });
            return false; // Stop searching
          }
        });
      }
    };

    window.addEventListener('deleteImage', handleDeleteImage as EventListener);
    return () => {
      window.removeEventListener('deleteImage', handleDeleteImage as EventListener);
    };
  }, [editor]);

  const inputBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inputBoxRef.current && onHeightChange) {
      const observer = new ResizeObserver(() => {
        onHeightChange(inputBoxRef.current!.offsetHeight);
      });
      observer.observe(inputBoxRef.current);

      return () => observer.disconnect();
    }
  }, [onHeightChange]);

  return (
    <InputBoxDiv
      ref={inputBoxRef}
      isNewSession={historyLength === 0}
      onKeyDown={(e) => {
        if (e.key === "Alt") {
          setOptionKeyHeld(true);
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Alt") {
          setOptionKeyHeld(false);
        }
      }}
      className="cursor-text"
      onClick={() => {
        editor && editor.commands.focus();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setShowDragOverMsg(true);
      }}
      onDragLeave={(e) => {
        if (e.relatedTarget === null) {
          if (e.shiftKey) {
            setShowDragOverMsg(false);
          } else {
            setTimeout(() => setShowDragOverMsg(false), 2000);
          }
        }
      }}
      onDragEnter={() => {
        setShowDragOverMsg(true);
      }}
      onDrop={(event) => {
        if (
          !modelSupportsImages(
            defaultModel.provider,
            defaultModel.model,
            defaultModel?.title || "unknown",
            defaultModel.capabilities,
          )
        ) {
          return;
        }
        setShowDragOverMsg(false);
        const file = event.dataTransfer.files[0];
        handleImageFile(file).then(([img, dataUrl]) => {
          const { schema } = editor.state;
          const node = schema.nodes.image.create({ src: dataUrl });
          const tr = editor.state.tr.insert(0, node);
          editor.view.dispatch(tr);
        });
        event.preventDefault();
      }}
    >
      <ContextToolbar
        hidden={!(editorFocusedRef.current || isMainInput)}
        source={source}
        onImageFileSelected={(file) => {
          handleImageFile(file).then(([img, dataUrl]) => {
            const { schema } = editor.state;
            const node = schema.nodes.image.create({ src: dataUrl });
            editor.commands.command(({ tr }) => {
              tr.insert(0, node);
              return true;
            });
          });
        }}
        onAddContextItem={() => {
          if (editor.getText().endsWith("@")) {
          } else {
            // Add space so that if there's text right before, it still activates the dropdown
            editor.commands.insertContent(" @");
          }
        }}
        editor={editor}
      />

      <EditorContent
        spellCheck={false}
        editor={editor}
        onClick={(event) => {
          event.stopPropagation();
        }}
      />

      <InputToolbar
        showNoContext={optionKeyHeld}
        hidden={!(editorFocusedRef.current || isMainInput)}
        onAddContextItem={() => {
          if (editor.getText().endsWith("@")) {
          } else {
            // Add space so that if there's text right before, it still activates the dropdown
            editor.commands.insertContent(" @");
          }
        }}
        onEnter={onEnterRef.current}
        onImageFileSelected={(file) => {
          handleImageFile(file).then(([img, dataUrl]) => {
            const { schema } = editor.state;
            const node = schema.nodes.image.create({ src: dataUrl });
            editor.commands.command(({ tr }) => {
              tr.insert(0, node);
              return true;
            });
          });
        }}
        source={source}
      />

      {showDragOverMsg &&
        modelSupportsImages(
          defaultModel.provider,
          defaultModel.model,
          defaultModel?.title || "unknown",
          defaultModel.capabilities,
        ) && (
          <>
            <HoverDiv></HoverDiv>
            <HoverTextDiv>Drop Here</HoverTextDiv>
          </>
        )
      }
      {contextMenu && editor && (
        <TipTapContextMenu
          editor={editor}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          defaultModel={defaultModel}
          ideMessenger={ideMessenger}
          handleImageFile={handleImageFile}
        />
      )}
    </InputBoxDiv>
  );
});

export default TipTapEditor;
