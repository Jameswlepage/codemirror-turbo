import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiAutocomplete } from "../autocomplete";
import type { AutocompleteOptions } from "../autocomplete";

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
   * 3. Flushes timers
   * 4. And microtasks
   */
  async function typeAt(anchor: number, text: string) {
    // Move cursor/selection
    view.dispatch({
      selection: { anchor },
    });
    // Type the text
    view.dispatch({
      changes: { from: anchor, insert: text },
      userEvent: "input.type",
    });
    // Allow debounced calls to queue
    await vi.runAllTimersAsync();
    // Flush microtasks in case 0ms debounce resolves on next tick
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

    // Start doc is "Hello world" => length=11
    // Move selection to position 5, type one space => "Hello  world"
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

    // Move selection to pos=0, type a space => prefix.trim() is empty
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

    // Type something at the end to trigger a suggestion
    await typeAt(11, "!");
    expect(mockPromptFn).toHaveBeenCalledTimes(1);

    view.focus();
    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    view.dom.dispatchEvent(tabEvent);

    // "ACCEPTED" should now appear in doc
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

    view.focus();
    const escEvent = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    view.dom.dispatchEvent(escEvent);

    // doc stays "Hello world?"
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

    // Type "!" => triggers callback suggestion
    await typeAt(11, "!");
    expect(mockPromptFn).toHaveBeenCalledTimes(1);

    // Accept
    view.focus();
    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    view.dom.dispatchEvent(tabEvent);
    expect(onAccept).toHaveBeenCalledWith("CALLBACK");

    // Another suggestion
    mockPromptFn.mockResolvedValueOnce("NEW_SUGGESTION");
    await typeAt(view.state.doc.length, "X");
    expect(mockPromptFn).toHaveBeenCalledTimes(2);

    // Reject
    const escEvent = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    view.dom.dispatchEvent(escEvent);
    expect(onReject).toHaveBeenCalledWith("NEW_SUGGESTION");
  });

  it("does not fetch suggestions when enableAutocomplete is false", async () => {
    view = createEditor([
      aiAutocomplete({
        prompt: mockPromptFn,
        autocompleteDebounceTime: 0,
        enableAutocomplete: false,
      }),
    ]);

    // Should skip the fetch
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

    // Type at end => doc "Hello worldA"
    await typeAt(11, "A");
    expect(mockPromptFn).toHaveBeenCalledTimes(1);

    view.focus();
    // Press Ctrl-j => accept
    const ctrlJEvent = new KeyboardEvent("keydown", {
      key: "j",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    view.dom.dispatchEvent(ctrlJEvent);
    expect(view.state.doc.toString()).toContain("CUSTOM");

    // Next suggestion
    mockPromptFn.mockResolvedValue("NEW_CUSTOM");
    await typeAt(view.state.doc.length, "B");
    expect(mockPromptFn).toHaveBeenCalledTimes(2);

    // Press Ctrl-k => reject
    const ctrlKEvent = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    view.dom.dispatchEvent(ctrlKEvent);
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

    // Type something => triggers prompt
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

    // Move selection => type "1"
    view.dispatch({ selection: { anchor: 11 } });
    view.dispatch({
      changes: { from: 11, insert: "1" },
      userEvent: "input.type",
    });
    // next typed changes
    view.dispatch({
      changes: { from: 12, insert: "2" },
      userEvent: "input.type",
    });
    view.dispatch({
      changes: { from: 13, insert: "3" },
      userEvent: "input.type",
    });

    // No immediate fetch
    expect(mockPromptFn).toHaveBeenCalledTimes(0);

    // Wait 499 ms => still no fetch
    vi.advanceTimersByTime(499);
    expect(mockPromptFn).toHaveBeenCalledTimes(0);

    // 1 more ms => total 500 => fetch triggered
    vi.advanceTimersByTime(1);
    await Promise.resolve(); // flush microtask if needed
    expect(mockPromptFn).toHaveBeenCalledTimes(1);
  });
});
