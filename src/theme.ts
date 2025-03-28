import { EditorView } from "@codemirror/view";
export { darkTheme, lightTheme, aiTheme, applyTheme, createInitialTheme } from "./theme/index.js";

export const suggestionStyle = EditorView.baseTheme({
  ".cm-ai-suggestion": {
    opacity: "0.5",
    color: "var(--cm-ai-suggestion-color, #7aa2f7)"
  }
});
