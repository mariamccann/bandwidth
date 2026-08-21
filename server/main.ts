// WebSocket game server. One process, many rooms. Deployable to any Node host
// (Render/Fly): binds process.env.PORT, answers HTTP health checks, and speaks
// the protocol in protocol.ts over WebSockets.
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { Room, RoomError, RoomRegistry } from './room.js';
import type { ClientMessage, ServerMessage } from './protocol.js';

const PORT = Number(process.env.PORT ?? 8787);
const registry = new RoomRegistry();

interface Conn {
  ws: WebSocket;
  room: Room | null;
  token: string | null; // identifies the seat
}

const conns = new Set<Conn>();

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function seatOf(conn: Conn) {
  return conn.room && conn.token ? conn.room.seatByToken(conn.token) ?? null : null;
}

function broadcastLobby(room: Room): void {
  for (const c of conns) {
    if (c.room === room && c.token) {
      send(c.ws, {
        type: 'lobby',
        code: room.code,
        players: room.lobbyPlayers(),
        youAreHost: room.isHost(c.token),
      });
    }
  }
}

function broadcastState(room: Room): void {
  for (const c of conns) {
    const seat = seatOf(c);
    if (c.room === room && seat && room.state) {
      send(c.ws, { type: 'state', view: room.viewFor(seat.seatId) });
    }
  }
}

function handle(conn: Conn, msg: ClientMessage): void {
  switch (msg.type) {
    case 'create': {
      const room = registry.create();
      const seat = room.addPlayer(msg.name);
      conn.room = room;
      conn.token = seat.token;
      room.touch();
      send(conn.ws, { type: 'joined', code: room.code, token: seat.token, seatId: seat.seatId });
      broadcastLobby(room);
      return;
    }
    case 'join': {
      const room = registry.get(msg.code);
      if (!room) throw new RoomError('No room with that code');
      const seat = room.addPlayer(msg.name);
      conn.room = room;
      conn.token = seat.token;
      room.touch();
      send(conn.ws, { type: 'joined', code: room.code, token: seat.token, seatId: seat.seatId });
      broadcastLobby(room);
      return;
    }
    case 'rejoin': {
      const room = registry.get(msg.code);
      const seat = room?.seatByToken(msg.token);
      if (!room || !seat) throw new RoomError('Could not rejoin — room or seat gone');
      conn.room = room;
      conn.token = seat.token;
      seat.connected = true;
      room.touch();
      send(conn.ws, { type: 'joined', code: room.code, token: seat.token, seatId: seat.seatId });
      if (room.state) {
        broadcastState(room); // includes connected-flag change for everyone
      } else {
        broadcastLobby(room);
      }
      return;
    }
    case 'start': {
      const room = conn.room;
      if (!room || !conn.token) throw new RoomError('Not in a room');
      if (!room.isHost(conn.token)) throw new RoomError('Only the host can start');
      const t = Math.max(5, Math.min(30, Math.floor(msg.winThreshold) || 15));
      room.start(t);
      room.touch();
      broadcastState(room);
      return;
    }
    case 'decision': {
      const room = conn.room;
      const seat = seatOf(conn);
      if (!room || !seat) throw new RoomError('Not in a room');
      const event = room.applyDecision(seat.seatId, msg.decision);
      room.touch();
      if (event.reveal) {
        for (const c of conns) {
          const s = seatOf(c);
          if (c.room === room && s?.seatId === event.reveal.toSeatId) {
            send(c.ws, { type: 'reveal', targetName: event.reveal.targetName, cards: event.reveal.cards });
          }
        }
      }
      if (event.moment) {
        for (const c of conns) {
          if (c.room === room && seatOf(c)) {
            send(c.ws, { type: 'moment', eliminatedName: event.moment.eliminatedName });
          }
        }
      }
      broadcastState(room);
      return;
    }
    case 'restart': {
      const room = conn.room;
      if (!room || !conn.token) throw new RoomError('Not in a room');
      if (!room.isHost(conn.token)) throw new RoomError('Only the host can restart');
      if (room.state && room.state.gamePhase !== 'game_over') {
        throw new RoomError('Game still in progress');
      }
      room.restart();
      room.touch();
      broadcastLobby(room);
      return;
    }
  }
}

const http = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('bandwidth game server: ok\n');
});

const wss = new WebSocketServer({ server: http });

wss.on('connection', (ws) => {
  const conn: Conn = { ws, room: null, token: null };
  conns.add(conn);
  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data)) as ClientMessage;
    } catch {
      send(ws, { type: 'error', message: 'Malformed message' });
      return;
    }
    try {
      handle(conn, msg);
    } catch (e) {
      send(ws, { type: 'error', message: e instanceof RoomError ? e.message : 'Server error' });
      if (!(e instanceof RoomError)) console.error(e);
    }
  });
  ws.on('close', () => {
    conns.delete(conn);
    const seat = seatOf(conn);
    if (seat && conn.room) {
      seat.connected = false;
      if (conn.room.state) broadcastState(conn.room);
      else broadcastLobby(conn.room);
    }
  });
});

setInterval(() => registry.sweep(), 30 * 60 * 1000).unref();

http.listen(PORT, () => {
  console.log(`bandwidth server listening on :${PORT}`);
});
