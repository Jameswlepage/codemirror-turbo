import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import {
  keymap,
  highlightSpecialChars,
  drawSelection,
  highlightActiveLine,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  lineNumbers,
  highlightActiveLineGutter
} from "@codemirror/view";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap
} from "@codemirror/language";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";
import { aiExtension } from "../src/inline-edit.js";
import { aiAutocomplete } from "../src/autocomplete.js";
import { darkTheme, lightTheme, aiTheme, applyTheme } from "../src/theme/index.js";

const logger = console;

// Create our own basic setup to avoid duplicate state instances
const basicSetup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap
  ])
];

// Model selection UI
function createModelSelector() {
  const container = document.createElement('div');
  container.className = 'fixed top-4 right-4 bg-[#1a1b26] p-4 rounded-lg shadow-lg border border-[#292e42] text-[#a9b1d6]';
  
  // Inline completion model selector
  const inlineCompletionContainer = document.createElement('div');
  inlineCompletionContainer.className = 'flex flex-col mb-4';
  const inlineCompletionLabel = document.createElement('label');
  inlineCompletionLabel.textContent = 'Inline Edit Model:';
  inlineCompletionLabel.className = 'text-sm opacity-80 mb-1';
  const inlineCompletionSelect = document.createElement('select');
  inlineCompletionSelect.className = 'bg-[#1f2335] border border-[#292e42] rounded px-3 py-1.5 text-[#a9b1d6] focus:border-[#7aa2f7] focus:ring-1 focus:ring-[#7aa2f7] outline-none';
  inlineCompletionSelect.innerHTML = '<option value="">Loading models...</option>';
  inlineCompletionContainer.appendChild(inlineCompletionLabel);
  inlineCompletionContainer.appendChild(inlineCompletionSelect);
  
  // Autocomplete model selector
  const autocompleteContainer = document.createElement('div');
  autocompleteContainer.className = 'flex flex-col';
  const autocompleteLabel = document.createElement('label');
  autocompleteLabel.textContent = 'Autocomplete Model:';
  autocompleteLabel.className = 'text-sm opacity-80 mb-1';
  const autocompleteSelect = document.createElement('select');
  autocompleteSelect.className = 'bg-[#1f2335] border border-[#292e42] rounded px-3 py-1.5 text-[#a9b1d6] focus:border-[#7aa2f7] focus:ring-1 focus:ring-[#7aa2f7] outline-none';
  autocompleteSelect.innerHTML = '<option value="">Loading models...</option>';
  autocompleteContainer.appendChild(autocompleteLabel);
  autocompleteContainer.appendChild(autocompleteSelect);
  
  // Error message styling
  const showError = (message: string) => {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed bottom-4 right-4 bg-[#1a1b26] border border-[#f7768e] text-[#f7768e] px-4 py-3 rounded-lg';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
  };
  
  // Fetch available models
  fetch('/api/models')
    .then(async res => {
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Server responded with status ${res.status}`);
      }
      return res.json();
    })
    .then(models => {
      if (!Array.isArray(models) || !models.length) {
        throw new Error('No models available');
      }
      // Create options from model names
      const options = models.map(modelName => 
        `<option value="${modelName}"${modelName === "gemma3:12b" ? " selected" : ""}>${modelName}</option>`
      ).join('');
      
      inlineCompletionSelect.innerHTML = options;
      autocompleteSelect.innerHTML = options;
      
      // Set default models
      inlineCompletionSelect.value = "gemma3:12b";
      autocompleteSelect.value = "qwen2.5-coder:7b";
    })
    .catch(err => {
      console.error('Failed to fetch models:', err);
      inlineCompletionSelect.innerHTML = '<option value="">No models available</option>';
      autocompleteSelect.innerHTML = '<option value="">No models available</option>';
      showError(`Failed to load models: ${err.message}. Make sure Ollama is running.`);
    });
  
  container.appendChild(inlineCompletionContainer);
  container.appendChild(autocompleteContainer);
  document.body.appendChild(container);
  return { inlineCompletionSelect, autocompleteSelect };
}

async function generateCompletion({ prompt, selection, codeBefore, codeAfter, isAutocomplete = false }: {
  prompt: string;
  selection: string;
  codeBefore: string;
  codeAfter: string;
  isAutocomplete?: boolean;
}) {
  const selectors = document.querySelectorAll('select') as NodeListOf<HTMLSelectElement>;
  const model = isAutocomplete ? selectors[1]?.value : selectors[0]?.value;
  
  if (!model) {
    throw new Error('No model selected. Make sure Ollama is running and models are available.');
  }
  
  const response = await fetch('/api/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      selection,
      codeBefore,
      codeAfter,
      model,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate completion');
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const editorElement = document.querySelector("#editor");
  if (!editorElement) {
    console.error("Editor element not found");
    return;
  }

  // Create model selector
  createModelSelector();

  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = isDark ? darkTheme : lightTheme;

  const extensions = [
    basicSetup,
    python(),
    javascript(),
    theme,
    aiTheme,
    EditorView.theme({
      "&": {
        fontSize: "14px",
        height: "100%"
      },
      ".cm-content": {
        padding: "1rem 0.5rem"
      },
      ".cm-gutters": {
        borderRight: "1px solid #292e42"
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent"
      }
    }),
    aiExtension({
      prompt: async ({ prompt, selection, codeBefore, codeAfter }) => {
        logger.log("Generating completion for:", { prompt, selection, codeBefore, codeAfter });
        try {
          const completion = await generateCompletion({ prompt, selection, codeBefore, codeAfter, isAutocomplete: false });
          logger.log("Generated completion:", completion);
          return completion;
        } catch (error) {
          logger.error("Error generating completion:", error);
          throw error;
        }
      },
      onAcceptEdit: (opts) => {
        logger.log("Accepted edit", opts);
      },
      onRejectEdit: (opts) => {
        logger.log("Rejected edit", opts);
      },
      onError: (error) => {
        logger.error("Error during completion:", error);
        // Show error in UI
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded';
        errorDiv.textContent = error.message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
      },
      keymaps: {
        showInput: "Mod-k",
        acceptEdit: "Mod-y",
        rejectEdit: "Mod-u",
      },
      inputDebounceTime: 300,
    }),
    aiAutocomplete({
      prompt: async ({ prompt, selection, codeBefore, codeAfter }) => {
        logger.log("Generating autocomplete suggestion for:", { prompt, selection, codeBefore, codeAfter });
        try {
          const completion = await generateCompletion({ prompt, selection, codeBefore, codeAfter, isAutocomplete: true });
          logger.log("Generated autocomplete suggestion:", completion);
          return completion;
        } catch (error) {
          logger.error("Error generating autocomplete suggestion:", error);
          throw error;
        }
      },
      onAcceptSuggestion: (suggestion) => {
        logger.log("Accepted autocomplete suggestion:", suggestion);
      },
      onRejectSuggestion: (suggestion) => {
        logger.log("Rejected autocomplete suggestion:", suggestion);
      },
      onError: (error) => {
        logger.error("Error during autocomplete:", error);
        // Show error in UI
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded';
        errorDiv.textContent = error.message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
      },
      autocompleteKeymaps: {
        acceptSuggestion: "Tab",
        rejectSuggestion: "Escape",
      },
      autocompleteDebounceTime: 300,
      enableAutocomplete: true,
    }),
  ];

  const startState = EditorState.create({
    doc: `# CodeMirror Turbo
# By James LePage (http://j.cv)
# A powerful AI-powered code editor extension

# Python Example
class DataProcessor:
    def __init__(self, data: list[int]):
        self.data = data
        self.processed = False

    def process(self) -> None:
        self.data = [x * 2 for x in self.data]
        self.processed = True

    def get_stats(self) -> dict:
        return {
            "mean": sum(self.data) / len(self.data),
            "max": max(self.data),
            "min": min(self.data)
        }

# JavaScript Example
function calculateStats(numbers) {
    const sum = numbers.reduce((a, b) => a + b, 0);
    return {
        mean: sum / numbers.length,
        max: Math.max(...numbers),
        min: Math.min(...numbers)
    };
}

# Try these examples:
# 1. Select the Python DataProcessor class and ask to "add a method to calculate standard deviation"
# 2. Select the JavaScript calculateStats function and ask to "add median calculation"
# 3. Select any code block and ask to "add error handling"
# 4. Select a function and ask to "add JSDoc comments"

# Keyboard shortcuts:
# Cmd+K (or Ctrl+K) - Trigger AI edit
# Cmd+Y (or Ctrl+Y) - Accept suggestion
# Cmd+U (or Ctrl+U) - Reject suggestion

# Note: Make sure Ollama is running at http://localhost:11434`,
    extensions
  });

  const view = new EditorView({
    state: startState,
    parent: editorElement
  });

  // Theme switching logic
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
  prefersDark.addEventListener("change", (e) => {
    applyTheme(e.matches, view);
  });
});
