import type { ClientMessage } from './protocol.js';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = 128): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function validDecision(value: unknown): boolean {
  if (!record(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'play_card':
      return text(value.cardId) && (value.targetId === undefined || text(value.targetId));
    case 'discard_card':
    case 'force_discard':
    case 'aid_discard':
      return text(value.cardId);
    case 'peek_swap':
      return text(value.takeCardId) && text(value.giveCardId);
    default:
      return false;
  }
}

/** Runtime guard for the untrusted JSON arriving over the socket. */
export function isClientMessage(value: unknown): value is ClientMessage {
  if (!record(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'create':
      return text(value.name, 64);
    case 'join':
      return text(value.code, 12) && text(value.name, 64);
    case 'rejoin':
      return text(value.code, 12) && text(value.token, 128);
    case 'add_bot':
      return value.difficulty === 'easy' || value.difficulty === 'normal';
    case 'remove_bot':
      return text(value.seatId, 32);
    case 'start':
      return typeof value.winThreshold === 'number' && Number.isFinite(value.winThreshold);
    case 'decision':
      return validDecision(value.decision);
    case 'restart':
      return true;
    default:
      return false;
  }
}
