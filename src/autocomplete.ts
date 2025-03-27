import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, keymap, WidgetType } from "@codemirror/view";
import { debouncePromise } from "./utils.js";
import type { AiOptions } from "./state.js";

export interface AutocompleteOptions extends AiOptions {
  /** Debounce time in ms for autocomplete suggestions */
  autocompleteDebounceTime?: number;
  /** Whether to enable autocomplete */
  enableAutocomplete?: boolean;
  /** Custom keymaps for autocomplete */
  autocompleteKeymaps?: {
    acceptSuggestion?: string;
    rejectSuggestion?: string;
  };
  /** Called when user accepts a suggestion */
  onAcceptSuggestion?: (suggestion: string) => void;
  /** Called when user rejects a suggestion */
  onRejectSuggestion?: (suggestion: string) => void;
}

const DEFAULT_AUTOCOMPLETE_DEBOUNCE = 300;
const DEFAULT_AUTOCOMPLETE_KEYMAPS = {
  acceptSuggestion: "Tab",
  rejectSuggestion: "Escape",
};

interface AutocompleteSuggestion {
  suggestion: string | null;
}

export const AutocompleteSuggestionState = StateField.define<AutocompleteSuggestion>({
  create: () => ({ suggestion: null }),
  update(value, tr) {
    const effect = tr.effects.find((e) => e.is(AutocompleteSuggestionEffect));
    if (!tr.docChanged && !effect) return value;
    if (effect) return { suggestion: effect.value };
    return { suggestion: null };
  }
});

/**
 * Effect to update the autocomplete suggestion
 */
const AutocompleteSuggestionEffect = StateEffect.define<string | null>();

/**
 * Widget that renders the autocomplete suggestion
 */
class AutocompleteSuggestionWidget extends WidgetType {
  constructor(readonly suggestion: string) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-ai-suggestion";
    span.style.opacity = "0.5";
    span.textContent = this.suggestion;
    return span;
  }

  eq(other: AutocompleteSuggestionWidget) {
    return other.suggestion === this.suggestion;
  }
}

/**
 * Creates a decoration for the autocomplete suggestion
 */
function autocompleteSuggestionDecoration(view: EditorView, suggestion: string) {
  const pos = view.state.selection.main.head;
  return Decoration.set([
    Decoration.widget({
      widget: new AutocompleteSuggestionWidget(suggestion),
      side: 1,
    }).range(pos),
  ]);
}

/**
 * Command to accept the current suggestion
 */
const acceptSuggestion = (view: EditorView) => {
  const state = view.state.field(AutocompleteSuggestionState);
  if (!state.suggestion) return false;

  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, insert: state.suggestion },
    effects: AutocompleteSuggestionEffect.of(null),
  });

  return true;
};

/**
 * Command to reject the current suggestion
 */
const rejectSuggestion = (view: EditorView) => {
  const state = view.state.field(AutocompleteSuggestionState);
  if (!state.suggestion) return false;

  view.dispatch({
    effects: AutocompleteSuggestionEffect.of(null),
  });

  return true;
};

/**
 * Plugin that manages autocomplete suggestions
 */
function createAutocompletePlugin(options: AutocompleteOptions) {
  let abortController: AbortController | null = null;
  let currentRequestId = 0;

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      debouncedFetch: (state: EditorState, view: EditorView) => Promise<void>;

      constructor(view: EditorView) {
        this.decorations = Decoration.none;
        this.debouncedFetch = debouncePromise(async (state: EditorState, view: EditorView) => {
          abortController?.abort();
          abortController = new AbortController();
          const requestId = ++currentRequestId;

          const pos = state.selection.main.head;
          const line = state.doc.lineAt(pos);
          
          // Get up to 200 lines of context before the current line
          const contextLines = [];
          let currentLine = line.number;
          let remainingLines = 200;
          
          while (currentLine > 1 && remainingLines > 0) {
            currentLine--;
            const prevLine = state.doc.line(currentLine);
            contextLines.unshift(prevLine.text);
            remainingLines--;
          }

          const prefix = state.doc.sliceString(line.from, pos);
          const suffix = state.doc.sliceString(pos, line.to);
          const beforeContext = contextLines.join('\n');

          // Don't suggest if we're at the start of a line or after whitespace
          if (!prefix.trim()) {
            view.dispatch({
              effects: AutocompleteSuggestionEffect.of(null),
            });
            return;
          }

          try {
            const suggestion = await options.prompt({
              prompt: "Given the following code context and current line, suggest a completion that naturally continues the code:",
              editorView: view,
              selection: "",
              codeBefore: beforeContext + '\n' + prefix,
              codeAfter: suffix,
              signal: abortController.signal,
            });

            // Strip markdown code block delimiters if present
            const cleanedSuggestion = suggestion.replace(/^```[\s\S]*?\n/, '').replace(/\n```$/, '').trim();

            // Only apply the suggestion if it's from the most recent request
            // and the signal hasn't been aborted
            if (!abortController.signal.aborted && requestId === currentRequestId) {
              // Only show suggestion if it's different from what's already there
              const currentSuggestion = state.field(AutocompleteSuggestionState).suggestion;
              if (cleanedSuggestion !== currentSuggestion) {
                view.dispatch({
                  effects: AutocompleteSuggestionEffect.of(cleanedSuggestion),
                });
              }
            }
          } catch (error) {
            if (error instanceof Error && error.name !== "AbortError") {
              options.onError?.(error);
            }
          }
        }, options.autocompleteDebounceTime ?? DEFAULT_AUTOCOMPLETE_DEBOUNCE);
      }

      update(update: ViewUpdate) {
        const state = update.state.field(AutocompleteSuggestionState);
        
        // Only update if the document changed or selection changed
        if (update.docChanged || update.selectionSet) {
          // Clear suggestion if cursor moved to a different line
          const oldPos = update.startState.selection.main.head;
          const newPos = update.state.selection.main.head;
          const oldLine = update.startState.doc.lineAt(oldPos);
          const newLine = update.state.doc.lineAt(newPos);
          
          if (oldLine.number !== newLine.number) {
            this.decorations = Decoration.none;
            setTimeout(() => {
              update.view.dispatch({
                effects: AutocompleteSuggestionEffect.of(null),
              });
            }, 0);
            return;
          }

          this.decorations = state.suggestion
            ? autocompleteSuggestionDecoration(update.view, state.suggestion)
            : Decoration.none;

          // Only fetch new suggestions if autocomplete is enabled
          if (options.enableAutocomplete !== false) {
            this.debouncedFetch(update.state, update.view);
          }
        } else {
          this.decorations = state.suggestion
            ? autocompleteSuggestionDecoration(update.view, state.suggestion)
            : Decoration.none;
        }
      }

      destroy() {
        abortController?.abort();
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        keydown: (e, view) => {
          // Clear suggestion on certain keys
          if (["Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            view.dispatch({
              effects: AutocompleteSuggestionEffect.of(null),
            });
          }
        },
      },
    }
  );
}

/**
 * Creates the autocomplete extension
 */
export function aiAutocomplete(options: AutocompleteOptions) {
  const keymaps = {
    ...DEFAULT_AUTOCOMPLETE_KEYMAPS,
    ...options.autocompleteKeymaps,
  };

  return [
    AutocompleteSuggestionState,
    createAutocompletePlugin(options),
    keymap.of([
      {
        key: keymaps.acceptSuggestion,
        run: (view) => {
          const state = view.state.field(AutocompleteSuggestionState);
          if (!state.suggestion) return false;
          const result = acceptSuggestion(view);
          if (result) {
            options.onAcceptSuggestion?.(state.suggestion);
          }
          return result;
        },
      },
      {
        key: keymaps.rejectSuggestion,
        run: (view) => {
          const state = view.state.field(AutocompleteSuggestionState);
          if (!state.suggestion) return false;
          const result = rejectSuggestion(view);
          if (result) {
            options.onRejectSuggestion?.(state.suggestion);
          }
          return result;
        },
      },
    ]),
  ];
} 