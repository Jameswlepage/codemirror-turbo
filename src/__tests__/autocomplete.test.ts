import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiAutocomplete } from "../autocomplete";
import type { AutocompleteOptions } from "../autocomplete";

/**
 * Helper to simulate a keyboard event
 */
function dispatchKey(view: EditorView, key: string) {
  view.focus();
  const isCtrl = key.startsWith("Ctrl-");
  const keyName = isCtrl ? key.slice(5) : key;
  
  // Simulate DOM event on the editor's content area
  const event = new KeyboardEvent("keydown", {
    key: keyName,
    ctrlKey: isCtrl,
    bubbles: true,
    cancelable: true,
    composed: true,
    code: keyName === "Tab" ? "Tab" : keyName === "Escape" ? "Escape" : `Key${keyName.toUpperCase()}`
  });
  view.contentDOM.dispatchEvent(event);
}

describe("aiAutocomplete", () => {
  let view: EditorView;
  let mockPromptFn: ReturnType<typeof vi.fn>;
  let root: HTMLElement;

  function createEditor(extensions: any[]) {
    const state = EditorState.create({
      doc: "Hello world",
      extensions,
    });
    const parent = document.createElement("div");
    parent.id = "editor-parent";
    document.body.appendChild(parent);
    return new EditorView({
      state,
      parent,
    });
  }

  /**
   * Helper that:
   * 1. Moves the selection to `anchor`
   * 2. Types `text` at that position
   * 3. Flushes timers and microtasks
   * 4. Waits for suggestion to be set
   */
  async function typeAt(anchor: number, text: string) {
    view.dispatch({
      selection: { anchor },
    });
    view.dispatch({
      changes: { from: anchor, insert: text },
      userEvent: "input.type",
    });
    // Flush debounced calls and pending microtasks
    await vi.runAllTimersAsync();
    await Promise.resolve();
    
    // Wait for suggestion to be set
    await vi.runAllTimersAsync();
    await Promise.resolve();
  }

  /**
   * Helper to wait for suggestion to be set in state
   */
  async function waitForSuggestion() {
    await vi.runAllTimersAsync();
    await Promise.resolve();
  }

  beforeEach(() => {
    mockPromptFn = vi.fn().mockResolvedValue("autocomplete-result");
    root = document.createElement("div");
    document.body.appendChild(root);
    vi.useFakeTimers();
  });

  afterEach(() => {
    view?.destroy();
    document.body.innerHTML = "";
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("fetches suggestions on document change when user types", async () => {
    view = createEditor([
      aiAutocomplete({
        prompt: mockPromptFn,
        autocompleteDebounceTime: 0,
      }),
    ]);

    // "Hello world" has length=11. Move selection to position 5 and type a space.
    await typeAt(5, " ");
    expect(mockPromptFn).toHaveBeenCalledTimes(1);
  });

  it("does not fetch suggestions if the prefix is only whitespace", async () => {
    view = createEditor([
      aiAutocomplete({
        prompt: mockPromptFn,
        autocompleteDebounceTime: 0,
      }),
    ]);

    // Move selection to position 0, type a space so that prefix.trim() is empty.
    await typeAt(0, " ");
    expect(mockPromptFn).not.toHaveBeenCalled();
  });

  it("accepts the suggestion when 'Tab' is pressed", async () => {
    mockPromptFn.mockResolvedValueOnce("ACCEPTED");
    view = createEditor([
      aiAutocomplete({
        prompt: mockPromptFn,
        autocompleteDebounceTime: 0,
      }),
    ]);

    // Trigger a suggestion by typing "!" at the end of the document.
    await typeAt(11, "!");
    expect(mockPromptFn).toHaveBeenCalledTimes(1);
    await waitForSuggestion();

    view.focus();
    dispatchKey(view, "Tab");
    await waitForSuggestion();

    // "ACCEPTED" should now have been inserted.
    expect(view.state.doc.toString()).toContain("ACCEPTED");
  });

  it("rejects the suggestion when 'Escape' is pressed", async () => {
    mockPromptFn.mockResolvedValueOnce("REJECT_ME");
    view = createEditor([
      aiAutocomplete({
        prompt: mockPromptFn,
        autocompleteDebounceTime: 0,
      }),
    ]);

    await typeAt(11, "?");
    expect(mockPromptFn).toHaveBeenCalledTimes(1);
    await waitForSuggestion();

    view.focus();
    dispatchKey(view, "Escape");
    await waitForSuggestion();

    // The document should remain unchanged.
    expect(view.state.doc.toString()).toBe("Hello world?");
  });

  it("calls onAcceptSuggestion and onRejectSuggestion callbacks", async () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();

    mockPromptFn.mockResolvedValueOnce("CALLBACK");
    view = createEditor([
      aiAutocomplete({
        prompt: mockPromptFn,
        autocompleteDebounceTime: 0,
        onAcceptSuggestion: onAccept,
        onRejectSuggestion: onReject,
      }),
    ]);

    // Trigger a suggestion.
    await typeAt(11, "!");
    expect(mockPromptFn).toHaveBeenCalledTimes(1);
    await waitForSuggestion();

    // Accept suggestion via Tab key.
    dispatchKey(view, "Tab");
    await waitForSuggestion();
    expect(onAccept.mock.calls).toEqual([["CALLBACK"]]);
    expect(onReject).not.toHaveBeenCalled();

    // Reset mocks and wait for any pending state updates
    onAccept.mockClear();
    onReject.mockClear();
    await vi.runAllTimersAsync();
    await Promise.resolve();

    // Prepare a new suggestion.
    mockPromptFn.mockResolvedValueOnce("NEW_SUGGESTION");
    await typeAt(view.state.doc.length, "X");
    expect(mockPromptFn).toHaveBeenCalledTimes(2);
    await waitForSuggestion();

    // Reject suggestion via Escape key.
    dispatchKey(view, "Escape");
    await waitForSuggestion();
    expect(onReject.mock.calls).toEqual([["NEW_SUGGESTION"]]);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("does not fetch suggestions when enableAutocomplete is false", async () => {
    view = createEditor([
      aiAutocomplete({
        prompt: mockPromptFn,
        autocompleteDebounceTime: 0,
        enableAutocomplete: false,
      }),
    ]);

    await typeAt(11, "X");
    expect(mockPromptFn).not.toHaveBeenCalled();
  });

  it("handles custom keymaps for accepting and rejecting suggestions", async () => {
    mockPromptFn.mockResolvedValue("CUSTOM");
    view = createEditor([
      aiAutocomplete({
        prompt: mockPromptFn,
        autocompleteDebounceTime: 0,
        autocompleteKeymaps: {
          acceptSuggestion: "Ctrl-j",
          rejectSuggestion: "Ctrl-k",
        },
      }),
    ]);

    // Trigger a suggestion by typing "A" at the end.
    await typeAt(11, "A");
    expect(mockPromptFn).toHaveBeenCalledTimes(1);
    await waitForSuggestion();

    view.focus();
    // Simulate Ctrl-j to accept suggestion.
    dispatchKey(view, "Ctrl-j");
    await waitForSuggestion();
    expect(view.state.doc.toString()).toContain("CUSTOM");

    // Prepare another suggestion.
    mockPromptFn.mockResolvedValue("NEW_CUSTOM");
    await typeAt(view.state.doc.length, "B");
    expect(mockPromptFn).toHaveBeenCalledTimes(2);
    await waitForSuggestion();

    // Simulate Ctrl-k to reject the suggestion.
    dispatchKey(view, "Ctrl-k");
    await waitForSuggestion();
    expect(view.state.doc.toString()).not.toContain("NEW_CUSTOM");
  });

  it("calls onError when the prompt function throws", async () => {
    const onError = vi.fn();
    mockPromptFn.mockRejectedValue(new Error("Test error"));
    view = createEditor([
      aiAutocomplete({
        prompt: mockPromptFn,
        autocompleteDebounceTime: 0,
        onError,
      }),
    ]);

    await typeAt(11, "R");
    expect(onError).toHaveBeenCalled();
    expect((onError.mock.calls[0][0] as Error).message).toBe("Test error");
  });

  it("debounces multiple fetch calls", async () => {
    view = createEditor([
      aiAutocomplete({
        prompt: mockPromptFn,
        autocompleteDebounceTime: 500,
      }),
    ]);

    // Simulate multiple rapid inputs.
    view.dispatch({ selection: { anchor: 11 } });
    view.dispatch({
      changes: { from: 11, insert: "1" },
      userEvent: "input.type",
    });
    view.dispatch({
      changes: { from: 12, insert: "2" },
      userEvent: "input.type",
    });
    view.dispatch({
      changes: { from: 13, insert: "3" },
      userEvent: "input.type",
    });

    // No immediate fetch should occur.
    expect(mockPromptFn).toHaveBeenCalledTimes(0);

    // Advance timers to just before the debounce threshold.
    vi.advanceTimersByTime(499);
    expect(mockPromptFn).toHaveBeenCalledTimes(0);

    // Advance timers to trigger the debounce.
    vi.advanceTimersByTime(1);
    await Promise.resolve();
    expect(mockPromptFn).toHaveBeenCalledTimes(1);
  });
});
