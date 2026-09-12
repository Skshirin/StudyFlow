// ============================================================================
// ASK AI CONTROLLER — Q&A Chat (Read-Only)
// ----------------------------------------------------------------------------
// Answers student questions about concepts using Gemini/Groq.
// NEVER writes to DB. NEVER touches the schedule. Pure explanatory text.
// ============================================================================

const axios = require('axios');

const QA_SYSTEM_PROMPT = `You are a helpful, friendly study tutor for a university student.
Answer the student's question clearly and concisely, using simple language.
You are given context about which concept, module, and subject the question relates to.
Keep answers focused and educational — no more than 3-4 paragraphs unless the student asks for detail.
Use examples, analogies, and bullet points when helpful.
Do NOT make up exam questions or predict what will be asked. Just explain the concept.`;

async function askWithGemini(messages, conceptContext) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const models = [process.env.GEMINI_MODEL || 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];
  const contextPrefix = conceptContext
    ? `[Context: Subject "${conceptContext.subjectName}", Module "${conceptContext.moduleName}", Concept "${conceptContext.conceptName}"]\n\n`
    : '';

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.role === 'user' && m === messages[messages.length - 1]
      ? contextPrefix + m.content
      : m.content
    }]
  }));

  for (const model of models) {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          system_instruction: { parts: [{ text: QA_SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024
          }
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
      );

      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (err) {
      console.warn(`Gemini Q&A with ${model} failed:`, err.message);
      const status = err.response?.status;
      if (status === 404 || status === 429 || status === 503) {
        continue;
      }
      break;
    }
  }
  return null;
}

async function askWithGroq(messages, conceptContext) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const contextPrefix = conceptContext
    ? `[Context: Subject "${conceptContext.subjectName}", Module "${conceptContext.moduleName}", Concept "${conceptContext.conceptName}"]\n\n`
    : '';

  const groqMessages = [
    { role: 'system', content: QA_SYSTEM_PROMPT },
    ...messages.map((m, i) => ({
      role: m.role,
      content: m.role === 'user' && i === messages.length - 1
        ? contextPrefix + m.content
        : m.content
    }))
  ];

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: groqMessages,
        temperature: 0.7,
        max_tokens: 1024
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    return response.data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn('Groq Q&A failed:', err.message);
    return null;
  }
}

// POST /api/ask-ai
exports.askAi = async (req, res, next) => {
  try {
    const { question, messages = [], conceptName, moduleName, subjectName } = req.body;

    if (!question && (!messages || messages.length === 0)) {
      return res.status(400).json({ error: 'question is required' });
    }

    // Check if any AI provider is available
    if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
      return res.json({
        error: 'noAiProvider',
        message: 'Ask AI is unavailable — no AI provider configured. Set GEMINI_API_KEY or GROQ_API_KEY to enable this feature.'
      });
    }

    const conceptContext = (conceptName || moduleName || subjectName)
      ? { conceptName: conceptName || 'General', moduleName: moduleName || '', subjectName: subjectName || '' }
      : null;

    // Build message history
    const chatMessages = messages.length > 0
      ? messages
      : [{ role: 'user', content: question }];

    // Try Gemini first, fall back to Groq
    let answer = await askWithGemini(chatMessages, conceptContext);
    if (!answer) {
      answer = await askWithGroq(chatMessages, conceptContext);
    }

    if (!answer) {
      return res.json({
        error: 'aiFailed',
        message: 'AI providers are configured but failed to respond. Please try again.'
      });
    }

    res.json({ answer });
  } catch (err) {
    next(err);
  }
};
