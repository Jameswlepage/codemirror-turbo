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

    // Inserting at position 5 => "Hello world" => becomes "Hello  world".
    // userEvent: "input.type" signals typed input to CodeMirror.
    view.dispatch({
      changes: { from: 5, to: 5, insert: " " },
      userEvent: "input.type",
    });
    // Advance timers to run the debounced fetch
    await vi.runAllTimersAsync();

    // Now promptFn should have been called
    expect(mockPromptFn).toHaveBeenCalledTimes(1);
  });

  it("does not fetch suggestions if the prefix is only whitespace", async () => {
    view = createEditor([
      aiAutocomplete({
        prompt: mockPromptFn,
        autocompleteDebounceTime: 0,
      }),
    ]);

    // Insert space at the start => prefix.trim() is ""
    view.dispatch({
      changes: { from: 0, to: 0, insert: " " },
      userEvent: "input.type",
    });
    await vi.runAllTimersAsync();
    // The plugin code checks `if (!prefix.trim()) return;`
    expect(mockPromptFn).not.toHaveBeenCalled();
  });

  it("accepts the suggestion when 'Tab' is pressed", async () => {
    // Make prompt return "ACCEPTED".
    mockPromptFn.mockResolvedValue("ACCEPTED");
    view = createEditor([
      aiAutocomplete({
        prompt: mockPromptFn,
        autocompleteDebounceTime: 0,
      }),
    ]);

    // Trigger typed input to ensure a non-empty prefix => doc "Hello world!"
    view.dispatch({
      changes: { from: 11, to: 11, insert: "!" },
      userEvent: "input.type",
    });
    await vi.runAllTimersAsync();
    expect(mockPromptFn).toHaveBeenCalledTimes(1);

    // Focus so keybindings work
    view.focus();
    // Press Tab
    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    view.dom.dispatchEvent(tabEvent);

    // The doc should now contain "ACCEPTED"
    expect(view.state.doc.toString()).toContain("ACCEPTED");
  });

  it("rejects the suggestion when 'Escape' is pressed", async () => {
    mockPromptFn.mockResolvedValue("REJECT_ME");
    view = createEditor([
      aiAutocomplete({
        prompt: mockPromptFn,
        autocompleteDebounceTime: 0,
      }),
    ]);

    // Something typed => doc "Hello world?"
    view.dispatch({
      changes: { from: 11, to: 11, insert: "?" },
      userEvent: "input.type",
    });
    await vi.runAllTimersAsync();
    expect(mockPromptFn).toHaveBeenCalledTimes(1);

    view.focus();
    const escEvent = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    view.dom.dispatchEvent(escEvent);

    // Suggestion is cleared; doc should remain "Hello world?"
    expect(view.state.doc.toString()).toBe("Hello world?");
  });

  it("calls onAcceptSuggestion and onRejectSuggestion callbacks", async () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();

    // The first suggestion
    mockPromptFn.mockResolvedValue("CALLBACK");
    view = createEditor([
      aiAutocomplete({
        prompt: mockPromptFn,
        autocompleteDebounceTime: 0,
        onAcceptSuggestion: onAccept,
        onRejectSuggestion: onReject,
      }),
    ]);

    // Insert typed input => triggers fetch
    view.dispatch({
      changes: { from: 11, to: 11, insert: "!" },
      userEvent: "input.type",
    });
    await vi.runAllTimersAsync();
    expect(mockPromptFn).toHaveBeenCalledTimes(1);

    // Accept it
    view.focus();
    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    view.dom.dispatchEvent(tabEvent);
    expect(onAccept).toHaveBeenCalledWith("CALLBACK");

    // Next suggestion
    mockPromptFn.mockResolvedValue("NEW_SUGGESTION");
    view.dispatch({
      changes: { from: 12, to: 12, insert: "X" },
      userEvent: "input.type",
    });
    await vi.runAllTimersAsync();
    expect(mockPromptFn).toHaveBeenCalledTimes(2);

    // Reject it
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

    // Insert typed input => doc "Hello worldX"
    view.dispatch({
      changes: { from: 11, to: 11, insert: "X" },
      userEvent: "input.type",
    });
    await vi.runAllTimersAsync();
    // Should skip the fetch
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

    // Trigger typed input => doc "Hello worldA"
    view.dispatch({
      changes: { from: 11, to: 11, insert: "A" },
      userEvent: "input.type",
    });
    await vi.runAllTimersAsync();
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
    // We should now have "CUSTOM" inserted
    expect(view.state.doc.toString()).toContain("CUSTOM");

    // Another typed input => doc "...B"
    mockPromptFn.mockResolvedValue("NEW_CUSTOM");
    view.dispatch({
      changes: { from: view.state.doc.length, to: view.state.doc.length, insert: "B" },
      userEvent: "input.type",
    });
    await vi.runAllTimersAsync();
    expect(mockPromptFn).toHaveBeenCalledTimes(2);

    // Press Ctrl-k => reject
    const ctrlKEvent = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    view.dom.dispatchEvent(ctrlKEvent);
    // "NEW_CUSTOM" is rejected
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

    // Trigger typed input => doc "Hello worldR"
    view.dispatch({
      changes: { from: 11, to: 11, insert: "R" },
      userEvent: "input.type",
    });
    await vi.runAllTimersAsync();
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

    // Make 3 quick changes => each userEvent: "input.type"
    view.dispatch({ changes: { from: 11, insert: "1" }, userEvent: "input.type" });
    view.dispatch({ changes: { from: 12, insert: "2" }, userEvent: "input.type" });
    view.dispatch({ changes: { from: 13, insert: "3" }, userEvent: "input.type" });

    // Immediately, no fetch calls yet.
    expect(mockPromptFn).toHaveBeenCalledTimes(0);

    // Advance 499 ms => still no calls
    vi.advanceTimersByTime(499);
    expect(mockPromptFn).toHaveBeenCalledTimes(0);

    // Advance 1 ms => total 500 => fetch triggered
    vi.advanceTimersByTime(1);
    expect(mockPromptFn).toHaveBeenCalledTimes(1);
  });
});
