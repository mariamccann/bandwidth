// Game-server endpoint. Dev: local server on :8787. Prod: the Render service
// (override at build time with VITE_WS_URL if the service name ever changes).
export const WS_URL: string = import.meta.env.DEV
  ? 'ws://localhost:8787'
  : ((import.meta.env.VITE_WS_URL as string | undefined) ?? 'wss://bandwidth-game.onrender.com');
