import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure CORS to allow requests from Vite dev server
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  credentials: true
}));

// Configure proper MIME types
app.use((req, res, next) => {
  if (req.url.endsWith('.js')) {
    res.type('application/javascript');
  }
  next();
});

app.use(express.json());
app.use(express.static(__dirname));

// Get available models from Ollama
async function getAvailableModels() {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
      throw new Error('Failed to fetch models from Ollama');
    }
    const data = await response.json();
    // Extract model names from the response
    return data.models?.map((model: any) => model.name) || [];
  } catch (error) {
    console.error('Error fetching models:', error);
    return [];
  }
}

// Check if Ollama is running
async function checkOllama() {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
      throw new Error('Ollama is not running');
    }
    return true;
  } catch (error) {
    console.error('Error checking Ollama:', error);
    return false;
  }
}

// Get available models from Ollama
app.get('/api/models', async (req, res) => {
  try {
    const models = await getAvailableModels();
    if (!models.length) {
      throw new Error('No models available from Ollama');
    }
    res.json(models);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// Proxy endpoint for Ollama API calls
app.post('/api/complete', async (req, res) => {
  try {
    const { prompt, selection, codeBefore, codeAfter, model } = req.body;
    
    // Check if Ollama is running
    const isOllamaRunning = await checkOllama();
    if (!isOllamaRunning) {
      throw new Error('Ollama is not running. Please start Ollama first.');
    }

    // Get available models and validate
    const availableModels = await getAvailableModels();
    if (!availableModels.length) {
      throw new Error('No models available from Ollama');
    }

    // Use first available model if none specified
    const selectedModel = model || availableModels[0];
    
    // Validate model
    if (!availableModels.includes(selectedModel)) {
      throw new Error(`Invalid model. Available models: ${availableModels.join(', ')}`);
    }
    
    // Detect language from the code context
    const language = detectLanguage(selection, codeBefore, codeAfter);
    
    const systemPrompt = `You are a helpful programming assistant specializing in ${language} development.
Your task is to modify code based on user requests.
You should ONLY return the modified code, with no explanations or markdown formatting.
Maintain the same style and indentation as the surrounding code.
Follow ${language} best practices and conventions.`;

    const userPrompt = `Given the following ${language} code context, ${prompt}

SELECTED CODE:
${selection}

CODE BEFORE SELECTION:
${codeBefore}

CODE AFTER SELECTION:
${codeAfter}

Instructions:
1. Modify ONLY the selected code
2. Maintain consistent style with surrounding code
3. Ensure the edit is complete and can be inserted directly
4. Return ONLY the replacement code, no explanations
5. Follow ${language} best practices`;

    const response = await fetch('http://localhost:11434/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API request failed: ${error}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error in /api/complete:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to generate completion',
      details: error instanceof Error ? error.stack : undefined
    });
  }
});

// Helper function to detect programming language
function detectLanguage(selection: string, codeBefore: string, codeAfter: string): string {
  const code = `${codeBefore}\n${selection}\n${codeAfter}`;
  
  // Simple language detection based on code patterns
  if (code.includes('def ') || code.includes('class ') || code.includes('import ')) {
    return 'Python';
  }
  if (code.includes('function ') || code.includes('const ') || code.includes('let ')) {
    return 'JavaScript';
  }
  return 'Python'; // Default to Python if detection fails
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Make sure Ollama is running at http://localhost:11434');
}); 