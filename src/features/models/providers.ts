/**
 * Models feature — provider preset registry.
 *
 * Used by the editor modal to pre-fill base URLs and provide a "set up
 * keys" link. The list is intentionally hand-curated: order matters
 * because it controls the dropdown order and the section order in the
 * Models screen.
 */

export interface ProviderPreset {
  /** Stable identifier persisted in `ModelRow.provider`. */
  id: string;
  /** Human-readable label shown in dropdowns and group headers. */
  label: string;
  /**
   * Default OpenAI-compatible base URL. Only set for presets where the
   * URL is well-known (local runners, vLLM, Ollama). Cloud providers
   * leave this `undefined` so the field stays empty.
   */
  defaultBaseUrl?: string;
  /** External URL where users provision API keys / install runners. */
  setupUrl?: string;
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    setupUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    setupUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    setupUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'google',
    label: 'Google (Gemini)',
    setupUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    setupUrl: 'https://console.x.ai',
  },
  {
    id: 'nous',
    label: 'Nous Research',
    setupUrl: 'https://portal.nousresearch.com',
  },
  {
    id: 'qwen',
    label: 'Qwen',
    setupUrl: 'https://dashscope.console.aliyun.com',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    setupUrl: 'https://www.minimax.io/platform',
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    setupUrl: 'https://huggingface.co/settings/tokens',
  },
  {
    id: 'groq',
    label: 'Groq',
    setupUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    defaultBaseUrl: 'http://localhost:1234/v1',
    setupUrl: 'https://lmstudio.ai',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    defaultBaseUrl: 'http://localhost:11434/v1',
    setupUrl: 'https://ollama.com',
  },
  {
    id: 'vllm',
    label: 'vLLM',
    setupUrl: 'https://docs.vllm.ai',
  },
  {
    id: 'llamacpp',
    label: 'llama.cpp',
    setupUrl: 'https://github.com/ggml-org/llama.cpp',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
  },
];

/**
 * Provider IDs whose models always need an explicit base URL. The editor
 * modal uses this to show the URL field and require non-empty input.
 */
export const PROVIDERS_REQUIRING_BASE_URL: ReadonlySet<string> = new Set([
  'custom',
  'lmstudio',
  'ollama',
  'vllm',
  'llamacpp',
]);

/** Lookup helper — falls back to the raw id when no preset matches. */
export function providerLabel(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

/** Lookup helper — returns `undefined` when the id is unknown. */
export function getProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** True when the given provider id requires a base URL to be entered. */
export function providerRequiresBaseUrl(id: string): boolean {
  return PROVIDERS_REQUIRING_BASE_URL.has(id);
}
