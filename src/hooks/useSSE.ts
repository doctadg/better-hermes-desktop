import { useRef, useCallback } from 'react';
import type { SSEEvent } from '@/api/types';

/**
 * Custom hook for SSE stream parsing.
 * Takes a fetch Response and yields parsed events.
 */
export function useSSE() {
  const bufferRef = useRef('');

  const parseStream = useCallback(async function* (
    response: Response
  ): AsyncGenerator<SSEEvent> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    let currentData = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);

            if (currentData.trim() === '[DONE]') {
              yield { event: 'done', data: '' };
            } else {
              yield {
                event: currentEvent || 'message',
                data: currentData,
              };
            }

            currentEvent = '';
            currentData = '';
          } else if (line.trim() === '') {
            // Empty line resets event type
            currentEvent = '';
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        const remainingLines = buffer.split('\n');
        let remEvent = '';
        for (const line of remainingLines) {
          if (line.startsWith('event: ')) {
            remEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data.trim() === '[DONE]') {
              yield { event: 'done', data: '' };
            } else {
              yield { event: remEvent || 'message', data };
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }, []);

  const parseEvent = useCallback((sseEvent: SSEEvent): { type: string; data: unknown } | null => {
    try {
      if (sseEvent.event === 'done') {
        return { type: 'done', data: null };
      }

      if (sseEvent.event === 'hermes.tool.progress') {
        const data = JSON.parse(sseEvent.data);
        return { type: 'tool_progress', data };
      }

      // Default: parse as JSON
      const data = JSON.parse(sseEvent.data);
      return { type: sseEvent.event || 'message', data };
    } catch {
      return null;
    }
  }, []);

  return {
    parseStream,
    parseEvent,
  };
}
