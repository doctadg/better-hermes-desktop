/**
 * SessionContext — provides the current sessionId to descendants.
 *
 * Wrap the chat tree for each pane in a <SessionProvider value={sessionId}>;
 * cards and other deep components can call useSessionId() to get it.
 */

import { createContext, useContext, type ReactNode } from 'react';

const SessionContext = createContext<string | null>(null);

export function SessionProvider({
  sessionId,
  children,
}: {
  sessionId: string | null;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={sessionId}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionId(): string | null {
  return useContext(SessionContext);
}

export function useRequiredSessionId(): string {
  const sid = useContext(SessionContext);
  if (!sid) {
    throw new Error('useRequiredSessionId() called outside <SessionProvider>');
  }
  return sid;
}
