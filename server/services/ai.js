import axios from 'axios';

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function sanitizeResponse(text = '') {
  let output = text.trim();
  if (output.startsWith('```')) {
    output = output.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim();
  }
  return output;
}

export async function generateAiResponse({
  prompt,
  systemPrompt = 'You are a helpful assistant.',
  temperature = 0.7,
  maxTokens = 800,
  model = DEFAULT_MODEL
}) {
  const apiKey = process.env.OPEN_AI_API_KEY;
  if (!apiKey) {
    throw new Error('OPEN_AI_API_KEY is not configured');
  }

  if (!prompt) {
    throw new Error('Prompt is required for AI generation');
  }

  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ]
  };

  const response = await axios.post('https://api.openai.com/v1/chat/completions', body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 60000
  });

  const raw = response.data?.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('AI response was empty');
  }

  return sanitizeResponse(raw);
}
