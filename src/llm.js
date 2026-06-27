/**
 * LLM integration — single model, fixed version, fixed system prompt.
 * Model/version/prompt are frozen at study launch and recorded in the study log.
 * Do NOT add model-switching logic; style consistency is required for the study.
 */

const LLM_CONFIG = {
  model: "deepseek-chat",
  api_url: "https://api.deepseek.com/chat/completions",
  temperature: 0.7,
  max_tokens: 60,
  system_prompt:
    "你是一个写作助手。请根据用户提供的文字，给出自然流畅的续写建议。" +
    "保持用户的语气和风格。只返回建议的文字，不要解释。" +
    "建议必须简短，不超过30个汉字。",
};

/**
 * Request a suggestion from the LLM for the given context.
 * @param {string} context - The text preceding the cursor (last ~300 chars).
 * @param {string} [apiKey] - Optional override; falls back to VITE_OPENAI_API_KEY.
 * @returns {Promise<string>} - The suggested continuation text.
 */
export async function fetchSuggestion(context, apiKey) {
  apiKey = apiKey || import.meta.env.VITE_DEEPSEEK_API_KEY;
  const resp = await fetch(LLM_CONFIG.api_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: LLM_CONFIG.model,
      temperature: LLM_CONFIG.temperature,
      max_tokens: LLM_CONFIG.max_tokens,
      messages: [
        { role: "system", content: LLM_CONFIG.system_prompt },
        { role: "user", content: context },
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`LLM API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.choices[0].message.content.trim();
}

export function getLLMConfig() {
  return { ...LLM_CONFIG };
}
