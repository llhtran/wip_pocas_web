class LMClient {
  constructor(options = {}) {
    this.endpoint =
      options.endpoint ||
      process.env.LM_STUDIO_URL ||
      'http://127.0.0.1:1234/v1/chat/completions';
    this.model = options.model || process.env.LM_STUDIO_MODEL || 'lmstudio';
    this.temperature =
      typeof options.temperature === 'number'
        ? options.temperature
        : Number(process.env.LM_TEMPERATURE ?? 0.85);
    this.maxTokens =
      typeof options.maxTokens === 'number'
        ? options.maxTokens
        : Number(process.env.LM_MAX_TOKENS ?? 600);
  }

  async generate({ system, user }) {
    if (typeof fetch !== 'function') {
      throw new Error('Global fetch API is not available in this Node runtime.');
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `LM Studio request failed with status ${response.status}: ${errorText}`
      );
    }

    const payload = await response.json();
    const draft = payload?.choices?.[0]?.message?.content?.trim();

    if (!draft) {
      throw new Error('LM Studio response did not include any message content.');
    }

    return {
      draft,
      model: payload.model || this.model,
      usage: payload.usage || null
    };
  }
}

module.exports = LMClient;

