import { EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { darkTheme, lightTheme } from "./editor.js";
import { aiTheme } from "./ui.js";

// Re-export themes
export { darkTheme, lightTheme } from "./editor.js";
export { aiTheme } from "./ui.js";

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
  
  return [theme, aiTheme];
} 