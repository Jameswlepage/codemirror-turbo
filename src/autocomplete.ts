import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, keymap, WidgetType } from "@codemirror/view";
import { debouncePromise } from "./utils.js";
import type { AiOptions } from "./state.js";
import { suggestionStyle } from "./theme.js";

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
  constructor(readonly suggestion: string, readonly currentLine: string) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-ai-suggestion";
    
    // Display only the part of the suggestion that's different from what's already typed
    const commonPrefixLength = this.findCommonPrefixLength(this.currentLine, this.suggestion);
    span.textContent = this.suggestion.slice(commonPrefixLength);
    
    return span;
  }

  private findCommonPrefixLength(a: string, b: string): number {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) {
      i++;
    }
    return i;
  }

  eq(other: AutocompleteSuggestionWidget) {
    return other.suggestion === this.suggestion && other.currentLine === this.currentLine;
  }
}

/**
 * Creates a decoration for the autocomplete suggestion
 */
function autocompleteSuggestionDecoration(view: EditorView, suggestion: string) {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const currentLineText = line.text;
  
  // We want to replace the entire line, so we'll use a decoration
  // that hides the current line and shows our suggestion instead
  return Decoration.set([
    // Hide everything after the cursor
    Decoration.replace({
      inclusive: true,
    }).range(pos, line.to),
    
    // Then add our suggestion widget
    Decoration.widget({
      widget: new AutocompleteSuggestionWidget(suggestion, currentLineText),
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
  const line = view.state.doc.lineAt(pos);
  
  // Check if the suggestion contains newlines
  const isMultilineSuggestion = state.suggestion.includes('\n');
  
  if (isMultilineSuggestion) {
    // For multiline suggestions, replace from the start of current line
    // to the end of current line with the first line of the suggestion,
    // then insert the rest of the suggestion
    const suggestionLines = state.suggestion.split('\n');
    const firstLine = suggestionLines[0] || '';
    
    view.dispatch({
      changes: { 
        from: line.from, 
        to: line.to,
        insert: state.suggestion
      },
      effects: AutocompleteSuggestionEffect.of(null),
      userEvent: "input.accept"
    });
  } else {
    // For single-line suggestions, just replace the entire line
    view.dispatch({
      changes: { 
        from: line.from, 
        to: line.to,
        insert: state.suggestion
      },
      effects: AutocompleteSuggestionEffect.of(null),
      userEvent: "input.accept"
    });
  }

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
    userEvent: "input.reject"
  });

  return true;
};

/**
 * Plugin that manages autocomplete suggestions
 */
export function createAutocompletePlugin(options: AutocompleteOptions) {
  let abortController: AbortController | null = null;
  let currentRequestId = 0;

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      debouncedFetch: (state: EditorState, view: EditorView) => Promise<void>;
      lastRequestTimestamp: number;

      constructor(view: EditorView) {
        this.decorations = Decoration.none;
        this.lastRequestTimestamp = 0;
        this.debouncedFetch = debouncePromise(async (state: EditorState, view: EditorView) => {
          // Cancel any in-flight request
          if (abortController) {
            abortController.abort();
            abortController = null;
          }
          
          // Create a new abort controller for this request
          abortController = new AbortController();
          const requestId = ++currentRequestId;
          const requestTimestamp = Date.now();
          this.lastRequestTimestamp = requestTimestamp;

          const pos = state.selection.main.head;
          const line = state.doc.lineAt(pos);
          
          // Get the entire file content as context
          const totalLines = state.doc.lines;
          const linesBeforeCurrent = [];
          const linesAfterCurrent = [];
          
          // Gather all lines before current line
          for (let i = 1; i < line.number; i++) {
            linesBeforeCurrent.push(state.doc.line(i).text);
          }
          
          // Gather all lines after current line
          for (let i = line.number + 1; i <= totalLines; i++) {
            linesAfterCurrent.push(state.doc.line(i).text);
          }

          // Get the current line's text before and after cursor
          const currentLinePrefix = state.doc.sliceString(line.from, pos);
          const currentLineSuffix = state.doc.sliceString(pos, line.to);
          const currentFullLine = state.doc.sliceString(line.from, line.to);
          
          const beforeContext = linesBeforeCurrent.join('\n');
          const afterContext = linesAfterCurrent.join('\n');

          // Don't suggest if we're at the start of a line with no content
          if (!currentFullLine.trim()) {
            view.dispatch({
              effects: AutocompleteSuggestionEffect.of(null),
            });
            return;
          }

          // Remove language detection logic
          try {
            const suggestion = await options.prompt({
              prompt: `You are an intelligent code auto-completion system. Complete the code by first rewriting the current line entirely, then continuing with appropriate additional lines if needed.

<instructions>
- REWRITE THE ENTIRE CURRENT LINE completely from start to finish
- After rewriting the current line, continue with additional lines if appropriate (1-10 lines total)
- The rewritten line and any new lines must fit seamlessly with surrounding code
- Study the patterns in surrounding code (indentation, naming, formatting, style)
- Match the exact coding style, patterns, and conventions used in the file
- Your completion must consider both the code before AND after the current line
- Ensure your completion maintains the structural integrity of the code
- DO NOT include the existing prefix in your response, as the ENTIRE line will be replaced
</instructions>

<code_before>
${beforeContext}
</code_before>

<current_line>
${currentFullLine}
</current_line>

<code_after>
${afterContext}
</code_after>

First, rewrite the entire current line completely, then continue with appropriate additional lines if needed (1-10 lines total):`,
              editorView: view,
              selection: "",
              codeBefore: beforeContext,
              codeAfter: afterContext,
              signal: abortController.signal,
            });

            // Clean up the suggestion 
            let cleanedSuggestion = suggestion
              .replace(/^```[\s\S]*?\n/, '') // Remove opening code fence
              .replace(/\n```$/, '')         // Remove closing code fence
              .trim();
              
            // If the suggestion has XML-like tags, extract just the code
            if (cleanedSuggestion.includes('<code>') && cleanedSuggestion.includes('</code>')) {
              cleanedSuggestion = cleanedSuggestion
                .replace(/[\s\S]*?<code>([\s\S]*?)<\/code>[\s\S]*/g, '$1')
                .trim();
            }

            // Handle indentation for additional lines
            if (cleanedSuggestion.includes('\n')) {
              // Get indentation of the current line
              const currentLineIndent = currentFullLine.match(/^(\s*)/)?.[1] || '';
              
              // Apply indentation to all lines after the first
              cleanedSuggestion = cleanedSuggestion
                .split('\n')
                .map((line, idx) => idx === 0 ? line : currentLineIndent + line)
                .join('\n');
            }

            // Only apply the suggestion if it's from the most recent request
            // and the signal hasn't been aborted
            if (!abortController.signal.aborted && requestId === currentRequestId) {
              // Double check with timestamp to ensure this is the most recent request
              if (requestTimestamp === this.lastRequestTimestamp) {
                // Only show suggestion if it's different from what's already there
                const currentSuggestion = state.field(AutocompleteSuggestionState).suggestion;
                if (cleanedSuggestion !== currentSuggestion) {
                  view.dispatch({
                    effects: AutocompleteSuggestionEffect.of(cleanedSuggestion),
                  });
                }
              }
            }
          } catch (error) {
            if (error instanceof Error && error.name !== "AbortError") {
              options.onError?.(error);
            }
            // For aborted requests, we don't need to do anything
            // as a new request will be started
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
            // Schedule the effect dispatch for after the current update
            setTimeout(() => {
              try {
                update.view.dispatch({
                  effects: AutocompleteSuggestionEffect.of(null),
                });
                
                // If this is a newline (Enter key press), and the previous line had content,
                // trigger a suggestion for the new line
                const prevLine = newLine.number > 1 ? update.state.doc.line(newLine.number - 1) : null;
                const isEmptyNewLine = newLine.text.trim().length === 0;
                const isPrevLineNotEmpty = prevLine && prevLine.text.trim().length > 0;
                
                // Only trigger autocomplete on empty new lines with content in previous line
                if (isEmptyNewLine && isPrevLineNotEmpty && options.enableAutocomplete !== false) {
                  this.debouncedFetch(update.state, update.view);
                }
              } catch (e) {
                // View is no longer valid
              }
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
        // Clean up any pending requests
        if (abortController) {
          abortController.abort();
          abortController = null;
        }
        // Reset request ID counter
        currentRequestId = 0;
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        keydown: (e, view) => {
          // Clear suggestion on certain keys
          if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            view.dispatch({
              effects: AutocompleteSuggestionEffect.of(null),
            });
          }
          
          // Handle Enter key to trigger autocomplete on new line
          if (e.key === "Enter") {
            // First clear any existing suggestion
            view.dispatch({
              effects: AutocompleteSuggestionEffect.of(null),
            });
            
            // Wait for the enter key's default behavior to complete
            setTimeout(() => {
              try {
                const pos = view.state.selection.main.head;
                const line = view.state.doc.lineAt(pos);
                
                // Check if the previous line has content
                if (line.number > 1) {
                  const prevLine = view.state.doc.line(line.number - 1);
                  const prevLineHasContent = prevLine.text.trim().length > 0;
                  const currentLineEmpty = line.text.trim().length === 0;
                  
                  // Only trigger autocomplete if previous line has content and current line is empty
                  if (prevLineHasContent && currentLineEmpty && options.enableAutocomplete !== false) {
                    // Simply request an update which will trigger the plugin's update method
                    view.dispatch({});
                  }
                }
              } catch (e) {
                // View might be invalid
              }
            }, 10); // Small delay to let the Enter key's effect take place
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
          
          // Store suggestion before accepting it
          const suggestion = state.suggestion;
          const result = acceptSuggestion(view);
          
          // Only call callback if the suggestion was actually accepted
          if (result && options.onAcceptSuggestion && suggestion) {
            options.onAcceptSuggestion(suggestion);
          }
          return result;
        },
        preventDefault: true,
        stopPropagation: true
      },
      {
        key: keymaps.rejectSuggestion,
        run: (view) => {
          const state = view.state.field(AutocompleteSuggestionState);
          if (!state.suggestion) return false;
          
          // Store suggestion before rejecting it
          const suggestion = state.suggestion;
          const result = rejectSuggestion(view);
          
          // Only call callback if the suggestion was actually rejected
          if (result && options.onRejectSuggestion && suggestion) {
            options.onRejectSuggestion(suggestion);
          }
          return result;
        },
        preventDefault: true,
        stopPropagation: true
      },
    ]),
    // Add custom styling for autocomplete suggestions
    suggestionStyle
  ];
} 