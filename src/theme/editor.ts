import { EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { aiTheme } from "./ui.js";

// Common styles for both themes
const commonStyles = {
  ".cm-comment": { color: "#787b8099" },
  ".cm-variableName": { color: "#7aa2f7" },
  ".cm-string": { color: "#9ece6a" },
  ".cm-number": { color: "#ff9e64" },
  ".cm-bool": { color: "#ff9e64" },
  ".cm-null": { color: "#ff9e64" },
  ".cm-keyword": { color: "#bb9af7" },
  ".cm-operator": { color: "#89ddff" },
  ".cm-className": { color: "#7aa2f7" },
  ".cm-typeName": { color: "#2ac3de" },
  ".cm-angleBracket": { color: "#89ddff" },
  ".cm-tagName": { color: "#f7768e" },
  ".cm-attributeName": { color: "#7aa2f7" },
  ".cm-propertyName": { color: "#73daca" },
  ".cm-function": { color: "#7aa2f7" },
};

// Dark theme (Tokyo Night inspired)
export const darkTheme = EditorView.theme({
  ...commonStyles,
  "&": {
    backgroundColor: "#1a1b26",
    color: "#a9b1d6",
    "--cm-background": "#1a1b26",
    "--cm-foreground": "#a9b1d6",
    "--cm-selection": "#515c7e40",
    "--cm-accent": "#3e57e1",
    "--accent-primary": "#3e57e1",
    "--cm-success": "#9ece6a",
    "--cm-error": "#f7768e",
    "--cm-foreground-muted": "#565f89",
    "--cm-background-higher": "#292e42",
    "--cm-border": "#292e42",
    "--cm-border-hover": "#393e52",
    "--background": "#1a1b26",
    "--foreground": "#a9b1d6",
    "--foreground-muted": "#565f89",
    "--background-higher": "#292e42",
    "--background-highest": "#393e52",
    "--border": "#292e42",
    "--border-hover": "#393e52",
    "--success": "#9ece6a",
    "--error": "#f7768e",
    "--foreground-on-accent": "#ffffff",
    "--foreground-on-success": "#ffffff",
    "--foreground-on-error": "#ffffff",
  },
  ".cm-content": {
    caretColor: "#c0caf5",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "#c0caf5",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "#515c7e40",
  },
  ".cm-activeLine": {
    backgroundColor: "#292e42",
  },
  ".cm-gutters": {
    backgroundColor: "#1a1b26",
    color: "#565f89",
    border: "none",
    borderRight: "1px solid #292e42",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#292e42",
  },
  ".cm-scroller": {
    fontFamily: "JetBrains Mono, monospace",
  },
}, { dark: true });

// Light theme (Tokyo Night Day inspired)
export const lightTheme = EditorView.theme({
  ...commonStyles,
  "&": {
    backgroundColor: "#e1e2e7",
    color: "#343b58",
    "--cm-background": "#e1e2e7",
    "--cm-foreground": "#343b58",
    "--cm-selection": "#b6bac940",
    "--cm-accent": "#3e57e1",
    "--accent-primary": "#3e57e1",
    "--cm-success": "#587539",
    "--cm-error": "#f52a65",
    "--cm-foreground-muted": "#787b8099",
    "--cm-background-higher": "#e9e9ec",
    "--cm-border": "#e9e9ec",
    "--cm-border-hover": "#d9d9dc",
    "--background": "#e1e2e7",
    "--foreground": "#343b58",
    "--foreground-muted": "#787b8099",
    "--background-higher": "#e9e9ec",
    "--background-highest": "#d9d9dc",
    "--border": "#e9e9ec",
    "--border-hover": "#d9d9dc",
    "--success": "#587539",
    "--error": "#f52a65",
    "--foreground-on-accent": "#ffffff",
    "--foreground-on-success": "#ffffff",
    "--foreground-on-error": "#ffffff",
  },
  ".cm-content": {
    caretColor: "#343b58",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "#343b58",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "#b6bac940",
  },
  ".cm-activeLine": {
    backgroundColor: "#e9e9ec",
  },
  ".cm-gutters": {
    backgroundColor: "#e1e2e7",
    color: "#787b8099",
    border: "none",
    borderRight: "1px solid #e9e9ec",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#e9e9ec",
  },
  ".cm-scroller": {
    fontFamily: "JetBrains Mono, monospace",
  },
}, { dark: false });

// Helper to apply theme and CSS variables
export function applyTheme(isDark: boolean, view: EditorView): void {
  const theme = isDark ? darkTheme : lightTheme;
  view.dispatch({
    effects: StateEffect.reconfigure.of([theme, aiTheme]),
  });
}

// Export a function to create the initial theme based on system preference
export function createInitialTheme(): Extension {
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = isDark ? darkTheme : lightTheme;
  return [theme, aiTheme];
} 