# Codemirror Turbo

A CodeMirror extension that adds AI-powered features to enhance your coding experience, including inline editing capabilities and intelligent autocompletion.

> This project is a fork of [codemirror-ai](https://github.com/marimo-team/codemirror-ai/) with additional features including intelligent autocompletion 💚

## API Compatibility

This package is designed to work with any AI provider that implements the OpenAI API format. While the demo showcases usage with OLLAMA for local model inference, you can integrate with:

- OpenAI's API directly
- Local models via OLLAMA
- Self-hosted models with OpenAI-compatible endpoints
- Any other service that implements the OpenAI API specification

This universal compatibility ensures you can use your preferred AI provider while maintaining a consistent interface for code assistance.

## Features

- **AI-Assisted Editing**: Select code and use keyboard shortcuts to get AI suggestions for edits
- **Intelligent Autocompletion**: Get context-aware code completions as you type
- **Full Line Autocompletion**: Suggests entire line completions and multi-line additions
- **Accept/reject AI suggestions** with a clean, modern interface
- **Customizable Keyboard Shortcuts** for both editing and autocompletion

## Installation

```bash
npm install codemirror-turbo
# or
pnpm add codemirror-turbo
```

## Usage

### AI-Assisted Inline Editing

```ts
import { aiExtension } from 'codemirror-turbo';
import { EditorView } from '@codemirror/view';

const view = new EditorView({
  extensions: [
    // ... other extensions
    aiExtension({
      // Required: Function to generate completions
      prompt: async ({ prompt, selection, codeBefore, codeAfter }) => {
        // Call your AI service here to generate the new code,
        // given the prompt, selection, and surrounding code
        return newCode;
      },

      // Optional callbacks
      onAcceptEdit: (opts) => {
        console.log('Edit accepted', opts);
      },
      onRejectEdit: (opts) => {
        console.log('Edit rejected', opts);
      },
      onError: (error) => console.error(error),

      // Optional configuration
      inputDebounceTime: 300, // ms
      keymaps: {
        showInput: 'Mod-k',    // Trigger AI edit
        acceptEdit: 'Mod-y',   // Accept suggestion
        rejectEdit: 'Mod-u'    // Reject suggestion
      }
    })
  ],
  parent: document.querySelector('#editor')
});
```

### AI-Powered Autocompletion

```ts
import { aiAutocomplete } from 'codemirror-turbo';
import { EditorView } from '@codemirror/view';

const view = new EditorView({
  extensions: [
    // ... other extensions
    aiAutocomplete({
      // Required: Function to generate autocompletions
      prompt: async ({ prompt, selection, codeBefore, codeAfter }) => {
        // Call your AI service here to generate code completions
        // The system will rewrite the current line and continue with appropriate additional lines
        return completion;
      },

      // Optional callbacks
      onAcceptSuggestion: (suggestion) => {
        console.log('Suggestion accepted', suggestion);
      },
      onRejectSuggestion: (suggestion) => {
        console.log('Suggestion rejected', suggestion);
      },
      onError: (error) => console.error(error),

      // Optional configuration
      enableAutocomplete: true,         // Enable/disable autocomplete
      autocompleteDebounceTime: 300,    // ms
      autocompleteKeymaps: {
        acceptSuggestion: 'Tab',        // Accept the suggestion
        rejectSuggestion: 'Escape'      // Reject the suggestion
      }
    })
  ],
  parent: document.querySelector('#editor')
});
```

## Demo

Check out the demo in the `/demo` directory for a full example of both inline editing and autocompletion features.

```bash
# Run the demo
pnpm dev
```

## Example Prompts

### Inline Editing Prompt

```ts
const template = (opts) => `
Given the following code context, ${opts.prompt}

SELECTED CODE:
${opts.selection}

CODE BEFORE SELECTION:
${opts.codeBefore}

CODE AFTER SELECTION:
${opts.codeAfter}

Instructions:
1. Modify ONLY the selected code
2. Maintain consistent style with surrounding code
3. Ensure the edit is complete and can be inserted directly
4. Return ONLY the replacement code, no explanations

Your task: ${opts.prompt}`;

// ...

aiExtension({
  prompt: async (opts) => {
    const fullPrompt = template(opts);
    return await llm.complete(fullPrompt);
  }
})
```

### Autocompletion Prompt

```ts
const template = (opts) => `
You are an intelligent code auto-completion system. Complete the code by first rewriting the current line entirely, then continuing with appropriate additional lines if needed.

<code_before>
${opts.codeBefore}
</code_before>

<current_line>
${currentLine}
</current_line>

<code_after>
${opts.codeAfter}
</code_after>

Instructions:
1. REWRITE THE ENTIRE CURRENT LINE completely from start to finish
2. After rewriting the current line, continue with additional lines if appropriate (1-10 lines total)
3. Match the exact coding style, patterns, and conventions used in the file
4. Your completion must consider both the code before AND after the current line`;

// ...

aiAutocomplete({
  prompt: async (opts) => {
    const fullPrompt = template(opts);
    return await llm.complete(fullPrompt);
  }
})
```

## Features

### Automatic Autocompletion on New Lines

The autocomplete system intelligently triggers suggestions when you press Enter after typing text. It will only generate suggestions if:

1. The previous line contains text
2. The newly created line is empty

This provides a seamless experience for continuing your code flow.

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run demo
pnpm dev
```

## License

Apache 2.0

### NOTICE

This project is a fork of [codemirror-ai](https://github.com/marimo-team/codemirror-ai/) by the Marimo team. While we've added new features and improvements, I want to acknowledge and thank the original authors for their foundational work.

---

Original project: [codemirror-ai](https://github.com/marimo-team/codemirror-ai/) by the Marimo team.
