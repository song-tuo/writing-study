/**
 * LLM integration — single model, fixed version, fixed system prompt.
 * Model/version/prompt are frozen at study launch and recorded in the study log.
 * Do NOT add model-switching logic; style consistency is required for the study.
 */

const LLM_CONFIG = {
  model: "deepseek-chat",
  api_url: "https://api.deepseek.com/chat/completions",
  temperature: 0.7,
  max_tokens: 200,
  system_prompt:
    "你是一个写作助手。用户会给你他们正在写的文章的最后一段内容。" +
    "你的任务是：在这段内容之后，续写接下来的1-2句话。" +
    "只输出新续写的内容，不要重复或改写用户已写的任何文字，不要解释，不要加标题。",
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
