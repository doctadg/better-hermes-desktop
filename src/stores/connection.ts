/**
 * Hermes Desktop - Connection Store
 * Manages server connections (URL, token, profiles)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ServerConnection, HealthResponse, ServerConfig, BridgeProfile } from '@/api/types';
import { HermesClient } from '@/api/client';
import { destroyAllSockets } from '@/api/websocket';
import { useChatStore } from './chat';
import { useLayoutStore } from './layout';

let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

interface ConnectionState {
  connections: ServerConnection[];
  activeConnectionId: string | null;
  client: HermesClient | null;
  healthStatus: Record<string, HealthResponse | null>;
  serverConfig: ServerConfig | null;
  isConnecting: boolean;
  connectionError: string | null;

  // Bridge profile support
  activeProfile: string | null;
  bridgeProfiles: BridgeProfile[];
  profileStatus: Record<string, 'up' | 'down' | 'degraded'>;

  // Profile switching
  isSwitchingProfile: boolean;

  // Initial load
  isInitialized: boolean;

  // Actions
  addConnection: (conn: Omit<ServerConnection, 'id' | 'active'>) => string;
  updateConnection: (id: string, updates: Partial<ServerConnection>) => void;
  removeConnection: (id: string) => void;
  setActiveConnection: (id: string) => Promise<boolean>;
  checkHealth: (id: string) => Promise<HealthResponse | null>;
  initializeClient: () => void;
  getClient: () => HermesClient | null;
  fetchServerConfig: () => Promise<ServerConfig | null>;
  getServerConfig: () => ServerConfig | null;
  setActiveProfile: (name: string | null) => Promise<void>;
  fetchBridgeProfiles: () => Promise<BridgeProfile[]>;
  rehydrateAndConnect: () => Promise<void>;
  stopHealthCheck: () => void;
}

function generateId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      connections: [],
      activeConnectionId: null,
      client: null,
      healthStatus: {},
      serverConfig: null,
      isConnecting: false,
      connectionError: null,
      activeProfile: null,
      bridgeProfiles: [],
      profileStatus: {},
      isSwitchingProfile: false,
      isInitialized: false,

      addConnection: (conn) => {
        const id = generateId();
        const newConn: ServerConnection = { ...conn, id, active: false };
        set((state) => ({
          connections: [...state.connections, newConn],
        }));
        return id;
      },

      updateConnection: (id, updates) => {
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        }));
        // Reinitialize client if updating active connection
        if (id === get().activeConnectionId) {
          get().initializeClient();
        }
      },

      removeConnection: (id) => {
        set((state) => ({
          connections: state.connections.filter((c) => c.id !== id),
          activeConnectionId:
            state.activeConnectionId === id ? null : state.activeConnectionId,
        }));
        if (id === get().activeConnectionId) {
          set({ client: null, serverConfig: null });
        }
      },

      setActiveConnection: async (id) => {
        const conn = get().connections.find((c) => c.id === id);
        if (!conn) return false;

        set({ isConnecting: true, connectionError: null, bridgeProfiles: [], profileStatus: {} });

        try {
          const client = new HermesClient(conn.url, conn.token);
          const health = await client.healthCheck();

          // Also fetch server config
          let serverConfig: ServerConfig | null = null;
          try {
            const configRes = await client.getConfig();
            serverConfig = configRes.config;
          } catch {
            // Config fetch is non-fatal
          }

          set((state) => ({
            activeConnectionId: id,
            client,
            isConnecting: false,
            isInitialized: true,
            healthStatus: { ...state.healthStatus, [id]: health },
            serverConfig,
            connections: state.connections.map((c) =>
              c.id === id
                ? { ...c, active: true, lastConnected: new Date().toISOString() }
                : { ...c, active: false }
            ),
          }));

          // Try fetching bridge profiles (non-blocking)
          get().fetchBridgeProfiles().catch(() => {});

          return true;
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Connection failed';
          set({ isConnecting: false, connectionError: error });

          // Still set the client even if health check fails
          const client = new HermesClient(conn.url, conn.token);

          // Try to fetch config even if health check failed
          let serverConfig: ServerConfig | null = null;
          try {
            const configRes = await client.getConfig();
            serverConfig = configRes.config;
          } catch {
            // Config fetch is non-fatal
          }

          set((state) => ({
            activeConnectionId: id,
            client,
            isInitialized: true,
            serverConfig,
            connections: state.connections.map((c) =>
              c.id === id
                ? { ...c, active: true, lastConnected: new Date().toISOString() }
                : { ...c, active: false }
            ),
          }));
          return true;
        }
      },

      checkHealth: async (id) => {
        const conn = get().connections.find((c) => c.id === id);
        if (!conn) return null;

        try {
          const client = new HermesClient(conn.url, conn.token);
          const health = await client.healthCheck();
          set((state) => ({
            healthStatus: { ...state.healthStatus, [id]: health },
          }));
          return health;
        } catch {
          set((state) => ({
            healthStatus: { ...state.healthStatus, [id]: null },
          }));
          return null;
        }
      },

      initializeClient: () => {
        const { activeConnectionId, connections, activeProfile } = get();
        if (!activeConnectionId) return;

        const conn = connections.find((c) => c.id === activeConnectionId);
        if (!conn) return;

        const client = new HermesClient(conn.url, conn.token);
        if (activeProfile) {
          client.setProfile(activeProfile);
        }
        set({ client });
      },

      getClient: () => get().client,

      fetchServerConfig: async () => {
        const client = get().client;
        if (!client) return null;
        try {
          const res = await client.getConfig();
          set({ serverConfig: res.config });
          return res.config;
        } catch {
          return null;
        }
      },

      getServerConfig: () => get().serverConfig,

      setActiveProfile: async (name: string | null) => {
        const { client } = get();
        if (!client) return;

        set({ isSwitchingProfile: true });

        // Switching profiles means a different agent — invalidate every
        // session, unbind every pane, and tear down all per-session sockets.
        useChatStore.getState().clearAllSessions();
        useLayoutStore.getState().clearAllBindings();
        destroyAllSockets();

        client.setProfile(name);
        set({ activeProfile: name });

        try {
          await get().fetchBridgeProfiles();
        } catch {
          // Non-fatal
        }

        set({ isSwitchingProfile: false });
      },

      fetchBridgeProfiles: async () => {
        const client = get().client;
        if (!client) return [];

        try {
          const res = await client.getBridgeProfiles();
          const profiles = res.profiles;

          // Check individual profile health
          const profileStatus: Record<string, 'up' | 'down' | 'degraded'> = {};
          for (const p of profiles) {
            profileStatus[p.name] = p.status;
          }

          set({ bridgeProfiles: profiles, profileStatus });
          return profiles;
        } catch {
          // Not a bridge server — that's fine
          set({ bridgeProfiles: [], profileStatus: {} });
          return [];
        }
      },

      rehydrateAndConnect: async () => {
        const { activeConnectionId, connections, client } = get();
        if (!activeConnectionId || !client) {
          set({ isInitialized: true });
          return;
        }

        // Restore profile on client
        const { activeProfile } = get();
        if (activeProfile) {
          client.setProfile(activeProfile);
        }

        try {
          // Health check
          const health = await client.healthCheck();
          set((state) => ({
            healthStatus: { ...state.healthStatus, [activeConnectionId]: health },
          }));
        } catch {
          // Health check failed — try anyway
        }

        try {
          // Fetch server config
          const configRes = await client.getConfig();
          set({ serverConfig: configRes.config });
        } catch {
          // Non-fatal
        }

        try {
          // Fetch bridge profiles
          await get().fetchBridgeProfiles();
        } catch {
          // Non-fatal
        }

        set({ isInitialized: true });

        // Start periodic health check (every 30s)
        if (healthCheckInterval) clearInterval(healthCheckInterval);
        healthCheckInterval = setInterval(async () => {
          const { activeConnectionId: currentId, client: currentClient } = get();
          if (!currentId || !currentClient) return;

          try {
            const health = await currentClient.healthCheck();
            set((state) => ({
              healthStatus: { ...state.healthStatus, [currentId]: health },
            }));
          } catch {
            set((state) => ({
              healthStatus: { ...state.healthStatus, [currentId]: null },
            }));
          }

          // Also refresh bridge profiles
          get().fetchBridgeProfiles().catch(() => {});
        }, 30_000);
      },

      stopHealthCheck: () => {
        if (healthCheckInterval) {
          clearInterval(healthCheckInterval);
          healthCheckInterval = null;
        }
      },
    }),
    {
      name: 'hermes-connections',
      partialize: (state) => ({
        connections: state.connections,
        activeConnectionId: state.activeConnectionId,
        activeProfile: state.activeProfile,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.activeConnectionId) {
          state.initializeClient();
          // Fire async rehydration after store is ready
          setTimeout(() => {
            state.rehydrateAndConnect();
          }, 0);
        } else {
          // No saved connection — mark initialized
          setTimeout(() => {
            const s = useConnectionStore.getState();
            if (!s.isInitialized) {
              useConnectionStore.setState({ isInitialized: true });
            }
          }, 0);
        }
      },
    }
  )
);
