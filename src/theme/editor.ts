import { EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import type { Extension } from "@codemirror/state";

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

// CSS Variables for our AI plugin UI
export const cssVariables = (isDark: boolean) => ({
  "--cm-background": isDark ? "#1a1b26" : "#e1e2e7",
  "--cm-foreground": isDark ? "#a9b1d6" : "#343b58",
  "--cm-selection": isDark ? "#515c7e40" : "#b6bac940",
  "--cm-accent": isDark ? "#7aa2f7" : "#2e7de9",
  "--cm-success": isDark ? "#9ece6a" : "#587539",
  "--cm-error": isDark ? "#f7768e" : "#f52a65",
  "--cm-foreground-muted": isDark ? "#565f89" : "#787b8099",
  "--cm-background-higher": isDark ? "#292e42" : "#e9e9ec",
  "--cm-border": isDark ? "#292e42" : "#e9e9ec",
  "--cm-border-hover": isDark ? "#393e52" : "#d9d9dc",
});

// Helper to apply theme and CSS variables
export function applyTheme(isDark: boolean, view: EditorView): void {
  const theme = isDark ? darkTheme : lightTheme;
  view.dispatch({
    effects: StateEffect.reconfigure.of([theme]),
  });

  // Apply CSS variables
  const variables = cssVariables(isDark);
  Object.entries(variables).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
}

// Export a function to create the initial theme based on system preference
export function createInitialTheme(): Extension {
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = isDark ? darkTheme : lightTheme;
  
  // Apply initial CSS variables
  const variables = cssVariables(isDark);
  Object.entries(variables).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
  
  return theme;
} 