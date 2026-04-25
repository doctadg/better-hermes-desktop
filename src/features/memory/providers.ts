/**
 * Memory provider catalogue.
 *
 * Each entry is a pluggable long-term memory backend Hermes can talk to.
 * The "Configured" pill is derived at render time by checking whether
 * `window.hermesAPI.storeGet(envVarName)` returns a non-empty string.
 */

export interface MemoryProviderInfo {
  id: string;
  label: string;
  description: string;
  dashboardUrl: string;
  setupUrl: string;
  envVarName: string;
}

export const MEMORY_PROVIDERS: MemoryProviderInfo[] = [
  {
    id: 'honcho',
    label: 'Honcho',
    description:
      'Personalised memory primitives for AI agents — sessions, facts, and theory-of-mind.',
    dashboardUrl: 'https://app.honcho.dev',
    setupUrl: 'https://docs.honcho.dev',
    envVarName: 'HONCHO_API_KEY',
  },
  {
    id: 'hindsight',
    label: 'Hindsight',
    description:
      'Vectorize-powered long-term memory store with semantic recall and audit trails.',
    dashboardUrl: 'https://ui.hindsight.vectorize.io',
    setupUrl: 'https://docs.vectorize.io/hindsight',
    envVarName: 'HINDSIGHT_API_KEY',
  },
  {
    id: 'mem0',
    label: 'Mem0',
    description:
      'Self-improving memory layer for LLMs — multi-level user/session/agent memories.',
    dashboardUrl: 'https://app.mem0.ai',
    setupUrl: 'https://docs.mem0.ai',
    envVarName: 'MEM0_API_KEY',
  },
  {
    id: 'retaindb',
    label: 'RetainDB',
    description:
      'Lightweight memory database with rich filtering and time-aware decay.',
    dashboardUrl: 'https://retaindb.com',
    setupUrl: 'https://retaindb.com/docs',
    envVarName: 'RETAINDB_API_KEY',
  },
  {
    id: 'supermemory',
    label: 'Supermemory',
    description:
      'Universal context graph — search across notes, chats, and documents.',
    dashboardUrl: 'https://supermemory.ai',
    setupUrl: 'https://docs.supermemory.ai',
    envVarName: 'SUPERMEMORY_API_KEY',
  },
  {
    id: 'byterover',
    label: 'ByteRover',
    description:
      'Knowledge graph + vector hybrid store with fine-grained access controls.',
    dashboardUrl: 'https://app.byterover.dev',
    setupUrl: 'https://docs.byterover.dev',
    envVarName: 'BYTEROVER_API_KEY',
  },
];
