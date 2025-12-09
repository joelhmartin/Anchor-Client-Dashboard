import { VertexAI } from '@google-cloud/vertexai';

const DEFAULT_MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';
const DEFAULT_LOCATION = process.env.GOOGLE_CLOUD_REGION || process.env.VERTEX_LOCATION || 'us-east4';

let vertexInstance = null;
let cachedProject = null;
let cachedLocation = null;
const modelCache = new Map();

function getProjectId() {
  return process.env.GOOGLE_CLOUD_PROJECT || process.env.VERTEX_PROJECT_ID;
}

function ensureVertexInstance(project, location) {
  if (!vertexInstance || cachedProject !== project || cachedLocation !== location) {
    vertexInstance = new VertexAI({ project, location });
    cachedProject = project;
    cachedLocation = location;
    modelCache.clear();
  }
  return vertexInstance;
}

function getGenerativeModel(modelName = DEFAULT_MODEL) {
  const project = getProjectId();
  if (!project) {
    throw new Error('Vertex AI is not configured. Set GOOGLE_CLOUD_PROJECT (or VERTEX_PROJECT_ID).');
  }
  const location = DEFAULT_LOCATION;
  const instance = ensureVertexInstance(project, location);
  if (!modelCache.has(modelName)) {
    const createModel =
      typeof instance.preview?.getGenerativeModel === 'function'
        ? instance.preview.getGenerativeModel.bind(instance.preview)
        : instance.getGenerativeModel.bind(instance);
    modelCache.set(modelName, createModel({ model: modelName }));
  }
  return modelCache.get(modelName);
}

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
  if (!prompt) {
    throw new Error('Prompt is required for AI generation');
  }

  const generativeModel = getGenerativeModel(model);
  const contents = [
    {
      role: 'user',
      parts: [{ text: prompt }]
    }
  ];

  const result = await generativeModel.generateContent({
    contents,
    ...(systemPrompt
      ? {
          systemInstruction: {
            role: 'system',
            parts: [{ text: systemPrompt }]
          }
        }
      : {}),
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_UNSPECIFIED', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }
    ]
  });

  const candidate = result?.response?.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((part) => part.text || part.inlineData || '')
    .join('')
    .trim();
  if (!text) {
    console.warn('[vertex:empty-response]', {
      modelUsed: model,
      project: getProjectId(),
      location: DEFAULT_LOCATION,
      candidateCount: result?.response?.candidates?.length || 0,
      promptPreview: prompt.slice(0, 200),
      systemPreview: (systemPrompt || '').slice(0, 120)
    });
    throw new Error('AI response was empty');
  }
  return sanitizeResponse(text);
}
