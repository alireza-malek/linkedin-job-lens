/**
 * AI Service for LinkedIn Job Lens
 * Handles OpenAI-compatible API communication, model discovery,
 * template-driven job evaluations, and custom queries.
 */

const DEFAULT_SYSTEM_INSTRUCTION =
  'You are an expert career advisor and technical recruiter analyzing job postings for a job candidate. Provide accurate, insightful, and concise evaluations based strictly on the provided context and job description.';

class AIService {
  /**
   * Normalizes the base URL by trimming whitespace and removing trailing slashes.
   * @param {string} url
   * @returns {string}
   */
  static cleanBaseUrl(url) {
    let clean = (url || 'https://api.openai.com/v1').trim();
    return clean.replace(/\/+$/, '');
  }

  /**
   * Fetch headers helper
   * @param {string} apiKey
   * @returns {Object}
   */
  static getHeaders(apiKey) {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (apiKey && apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    return headers;
  }

  /**
   * Discover available models from the provider
   * @param {string} baseUrl
   * @param {string} apiKey
   * @returns {Promise<string[]>} List of model IDs
   */
  static async discoverModels(baseUrl, apiKey) {
    const url = `${this.cleanBaseUrl(baseUrl)}/models`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(apiKey)
    });

    if (!response.ok) {
      const errText = await response.text();
      let msg = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const json = JSON.parse(errText);
        if (json.error?.message) msg = json.error.message;
      } catch (e) {
        // use status text
      }
      throw new Error(msg);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.data)) {
      throw new Error('Unexpected models response format: "data" array not found');
    }

    const models = data.data
      .map(m => (typeof m === 'string' ? m : m.id))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return models;
  }

  /**
   * Tests connection to the endpoint
   * @param {string} baseUrl
   * @param {string} apiKey
   * @returns {Promise<{ ok: boolean, message: string }>}
   */
  static async testConnection(baseUrl, apiKey) {
    try {
      const models = await this.discoverModels(baseUrl, apiKey);
      return {
        ok: true,
        message: `Connection successful! Found ${models.length} model(s).`
      };
    } catch (err) {
      return {
        ok: false,
        message: `Connection failed: ${err.message}`
      };
    }
  }

  /**
   * Constructs the user prompt string for insight evaluation
   * @param {Object} params
   * @param {Object} params.template
   * @param {Object} [params.jobDetails]
   * @returns {string}
   */
  static buildInsightUserPrompt({ template, jobDetails = {} }) {
    const enabledCriterias = (template?.criterias || []).filter(c => c.enabled !== false);
    const criteriaFormatted = enabledCriterias
      .map((c, i) => `${i + 1}. Criteria Name: "${c.name}"\n   Instruction: ${c.instruction}`)
      .join('\n\n');

    return `CANDIDATE CONTEXT:
${template?.context || 'No specific candidate profile provided.'}

---
JOB DETAILS:
Title: ${jobDetails?.jobTitle || 'Unknown Title'}
Company: ${jobDetails?.companyName || 'Unknown Company'}
Location: ${jobDetails?.location || 'Unknown Location'}

JOB DESCRIPTION:
${jobDetails?.description || 'No job description available.'}

---
CRITERIA TO EVALUATE:
${criteriaFormatted || 'None specified'}`;
  }

  /**
   * Evaluates a job against an insight template
   * @param {Object} params
   * @param {string} params.baseUrl
   * @param {string} params.apiKey
   * @param {string} params.model
   * @param {string} [params.systemInstruction]
   * @param {number|string} [params.temperature]
   * @param {number|string} [params.maxTokens]
   * @param {Object} params.template
   * @param {Object} params.jobDetails
   * @returns {Promise<{ results: Array<{ name: string, result: string }>, requestId: string|null, usage: { promptTokens: number|null, completionTokens: number|null, totalTokens: number|null, reasoningTokens: number|null } }>}
   */
  static async generateInsight({
    baseUrl,
    apiKey,
    model,
    systemInstruction,
    temperature,
    maxTokens,
    reasoningEffort,
    template,
    jobDetails
  }) {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('API Key is missing. Please configure it in AI Settings.');
    }
    if (!model || !model.trim()) {
      throw new Error('Model name is required. Please select or enter a model in AI Settings.');
    }

    const enabledCriterias = (template.criterias || []).filter(c => c.enabled !== false);
    if (enabledCriterias.length === 0) {
      throw new Error(`The template "${template.name}" has no enabled criteria.`);
    }

    const sysInstruction = (systemInstruction || '').trim() || DEFAULT_SYSTEM_INSTRUCTION;

    const systemPrompt = `${sysInstruction}

You MUST return your answer strictly as a valid JSON object matching this schema:
{
  "criterias": [
    {
      "name": "<exact criteria name>",
      "result": "<concise evaluation and response for this criteria>"
    }
  ]
}
Make sure every requested criteria is included with its exact name. Return valid JSON only, without any explanatory notes or wrapping text outside the JSON.`;

    const userPrompt = this.buildInsightUserPrompt({ template, jobDetails });

    const endpoint = `${this.cleanBaseUrl(baseUrl)}/chat/completions`;

    const tempParsed = (temperature !== undefined && temperature !== null && temperature !== '') ? parseFloat(temperature) : 0.3;
    const finalTemp = !isNaN(tempParsed) ? Math.max(0, Math.min(2, tempParsed)) : 0.3;

    let payload = {
      model: model.trim(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: finalTemp,
      response_format: { type: 'json_object' },
      stream: false
    };

    const maxTokParsed = parseInt(maxTokens, 10);
    if (!isNaN(maxTokParsed) && maxTokParsed > 0) {
      payload.max_tokens = maxTokParsed;
    }

    if (reasoningEffort && String(reasoningEffort).trim()) {
      payload.reasoning_effort = String(reasoningEffort).trim();
    }

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(apiKey),
        body: JSON.stringify(payload)
      });
    } catch (fetchErr) {
      // Network or CORS error
      throw new Error(`Network error connecting to API (${endpoint}): ${fetchErr.message}`);
    }

    // If response_format causes an error with some models, retry without it
    if (!response.ok && response.status === 400) {
      const errClone = await response.clone().text();
      if (errClone.toLowerCase().includes('response_format')) {
        delete payload.response_format;
        response = await fetch(endpoint, {
          method: 'POST',
          headers: this.getHeaders(apiKey),
          body: JSON.stringify(payload)
        });
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `API Error (${response.status} ${response.statusText})`;
      try {
        const json = JSON.parse(errText);
        if (json.error?.message) errorMsg = json.error.message;
      } catch (e) {
        if (errText) errorMsg += `: ${errText.slice(0, 150)}`;
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const results = this.parseInsightResponse(content, enabledCriterias);
    const usage = data.usage || {};
    const requestId = data.id || data.request_id || data.requestId || (response.headers && (response.headers.get('x-request-id') || response.headers.get('request-id'))) || null;

    return {
      results,
      requestId,
      usage: {
        promptTokens: usage.prompt_tokens ?? null,
        completionTokens: usage.completion_tokens ?? null,
        totalTokens: usage.total_tokens ?? null,
        reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? null
      }
    };
  }

  /**
   * Parses and validates the LLM JSON response for insight criteria
   * @param {string} content
   * @param {Array<{ name: string }>} expectedCriterias
   * @returns {Array<{ name: string, result: string }>}
   */
  static parseInsightResponse(content, expectedCriterias) {
    if (!content) {
      throw new Error('Received empty response from AI model.');
    }

    // Try direct parse or extract JSON from markdown block
    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (jsonMatch && jsonMatch[1]) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch (innerE) {
          // fallback continues
        }
      }
    }

    if (parsed && Array.isArray(parsed.criterias)) {
      return expectedCriterias.map(exp => {
        const found = parsed.criterias.find(
          c => c.name && c.name.toLowerCase().trim() === exp.name.toLowerCase().trim()
        );
        return {
          name: exp.name,
          result: found ? String(found.result).trim() : 'No evaluation returned.'
        };
      });
    }

    // Fallback: line-by-line or section parsing
    return expectedCriterias.map(exp => {
      const escaped = exp.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|\\n)[#*\\-\\s]*${escaped}[:*\\-\\s]+([\\s\\S]*?)(?=(?:\\n[#*\\-\\s]*[A-Z0-9_-]+:|$))`, 'i');
      const match = content.match(regex);
      return {
        name: exp.name,
        result: match && match[1] ? match[1].trim() : content.trim()
      };
    });
  }

  /**
   * Custom query ("Ask anything") about a job and template context
   * @param {Object} params
   * @param {string} params.baseUrl
   * @param {string} params.apiKey
   * @param {string} params.model
   * @param {string} [params.systemInstruction]
   * @param {number|string} [params.temperature]
   * @param {number|string} [params.maxTokens]
   * @param {string} [params.templateContext]
   * @param {string} params.query
   * @param {Object} params.jobDetails
   * @returns {Promise<{ answer: string, requestId: string|null, usage: { promptTokens: number|null, completionTokens: number|null, totalTokens: number|null, reasoningTokens: number|null } }>}
   */
  static async askAnything({
    baseUrl,
    apiKey,
    model,
    systemInstruction,
    temperature,
    maxTokens,
    reasoningEffort,
    templateContext,
    query,
    jobDetails = {}
  }) {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('API Key is missing. Please configure it in AI Settings.');
    }
    if (!model || !model.trim()) {
      throw new Error('Model name is required. Please select or enter a model in AI Settings.');
    }
    if (!query || !query.trim()) {
      throw new Error('Please enter a question.');
    }

    const sysInstruction = (systemInstruction || '').trim() || DEFAULT_SYSTEM_INSTRUCTION;

    const userPrompt = `CANDIDATE CONTEXT:
${templateContext || 'No candidate profile provided.'}

---
JOB DETAILS:
Title: ${jobDetails.jobTitle || 'Unknown Title'}
Company: ${jobDetails.companyName || 'Unknown Company'}
Location: ${jobDetails.location || 'Unknown Location'}

JOB DESCRIPTION:
${jobDetails.description || 'No job description available.'}

---
USER QUESTION:
${query.trim()}

Please provide a direct, concise, and helpful answer.`;

    const endpoint = `${this.cleanBaseUrl(baseUrl)}/chat/completions`;

    const tempParsed = (temperature !== undefined && temperature !== null && temperature !== '') ? parseFloat(temperature) : 0.3;
    const finalTemp = !isNaN(tempParsed) ? Math.max(0, Math.min(2, tempParsed)) : 0.3;

    const payload = {
      model: model.trim(),
      messages: [
        { role: 'system', content: sysInstruction },
        { role: 'user', content: userPrompt }
      ],
      temperature: finalTemp,
      stream: false
    };

    const maxTokParsed = parseInt(maxTokens, 10);
    if (!isNaN(maxTokParsed) && maxTokParsed > 0) {
      payload.max_tokens = maxTokParsed;
    }

    if (reasoningEffort && String(reasoningEffort).trim()) {
      payload.reasoning_effort = String(reasoningEffort).trim();
    }

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(apiKey),
        body: JSON.stringify(payload)
      });
    } catch (fetchErr) {
      throw new Error(`Network error connecting to API (${endpoint}): ${fetchErr.message}`);
    }

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `API Error (${response.status} ${response.statusText})`;
      try {
        const json = JSON.parse(errText);
        if (json.error?.message) errorMsg = json.error.message;
      } catch (e) {
        if (errText) errorMsg += `: ${errText.slice(0, 150)}`;
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();
    const answer = (data.choices?.[0]?.message?.content || '').trim();
    const usage = data.usage || {};
    const requestId = data.id || data.request_id || data.requestId || (response.headers && (response.headers.get('x-request-id') || response.headers.get('request-id'))) || null;

    return {
      answer,
      requestId,
      usage: {
        promptTokens: usage.prompt_tokens ?? null,
        completionTokens: usage.completion_tokens ?? null,
        totalTokens: usage.total_tokens ?? null,
        reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? null
      }
    };
  }
}

// Make accessible to panel script in browser environment
if (typeof window !== 'undefined') {
  window.AIService = AIService;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIService;
}
