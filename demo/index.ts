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
import { aiExtension } from "../src/inline-edit";

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
  container.className = 'fixed top-4 right-4 bg-white p-2 rounded shadow';
  
  const select = document.createElement('select');
  select.className = 'border rounded px-2 py-1';
  select.innerHTML = '<option value="">Loading models...</option>';
  
  // Fetch available models
  fetch('/api/models')
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch models');
      return res.json();
    })
    .then(models => {
      if (!Array.isArray(models) || !models.length) {
        throw new Error('No models available');
      }
      // Create options from model names
      select.innerHTML = models.map(modelName => 
        `<option value="${modelName}">${modelName}</option>`
      ).join('');
    })
    .catch(err => {
      console.error('Failed to fetch models:', err);
      select.innerHTML = '<option value="">No models available</option>';
      // Show error in UI
      const errorDiv = document.createElement('div');
      errorDiv.className = 'fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded';
      errorDiv.textContent = 'Failed to load models. Make sure Ollama is running.';
      document.body.appendChild(errorDiv);
      setTimeout(() => errorDiv.remove(), 5000);
    });
  
  container.appendChild(select);
  document.body.appendChild(container);
  return select;
}

async function generateCompletion({ prompt, selection, codeBefore, codeAfter }: {
  prompt: string;
  selection: string;
  codeBefore: string;
  codeAfter: string;
}) {
  const select = document.querySelector('select') as HTMLSelectElement;
  const model = select?.value;
  
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

  const extensions = [
    basicSetup,
    python(),
    javascript(),
    aiExtension({
      prompt: async ({ prompt, selection, codeBefore, codeAfter }) => {
        logger.log("Generating completion for:", { prompt, selection, codeBefore, codeAfter });
        try {
          const completion = await generateCompletion({ prompt, selection, codeBefore, codeAfter });
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
    })
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
});
