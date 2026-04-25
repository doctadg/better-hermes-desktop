import { useEffect, useRef } from 'react';
import { useChatStore, useSessionIsStreaming, useSessionRemoteActivity } from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';

/**
 * Polls the session activity endpoint for cross-client visibility.
 *
 * Only polls when:
 * - A valid sessionId is provided
 * - There is an active connection (client exists)
 * - There is NO active local SSE stream (i.e. the user didn't initiate the
 *   current activity). When we're streaming locally we already have full
 *   visibility via the SSE callbacks.
 *
 * Polls every 2.5 seconds when active, stops polling when idle.
 */
export function useSessionActivityPoll(sessionId: string | null | undefined) {
  const isStreaming = useSessionIsStreaming(sessionId);
  const remoteActivity = useSessionRemoteActivity(sessionId);
  const client = useConnectionStore((s) => s.client);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Clean up any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only poll when we have a session, a client, and we're NOT streaming locally
    if (!sessionId || !client || isStreaming) {
      // If we stopped streaming locally, clear remote activity
      if (sessionId && !isStreaming) {
        // Will be updated by poll or cleared on next render
      }
      return;
    }

    const setRemoteActivity = useChatStore.getState().setRemoteActivity;

    const poll = async () => {
      if (!mountedRef.current) return;
      try {
        const activity = await client.getSessionActivity(sessionId);
        if (mountedRef.current) {
          setRemoteActivity(sessionId, activity);
        }
      } catch {
        // Silently ignore — endpoint might not exist on older servers
        if (mountedRef.current) {
          setRemoteActivity(sessionId, null);
        }
      }
    };

    // Initial poll
    poll();

    // Poll every 2.5 seconds
    intervalRef.current = setInterval(poll, 2500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, client, isStreaming]);

  return remoteActivity;
}
