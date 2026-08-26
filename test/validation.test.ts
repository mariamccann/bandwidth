import { describe, expect, it } from 'vitest';
import { isClientMessage } from '../server/validation.js';

describe('socket message validation', () => {
  it('accepts supported lobby and gameplay messages', () => {
    expect(isClientMessage({ type: 'create', name: 'Mina' })).toBe(true);
    expect(isClientMessage({ type: 'join', code: 'ABCD', name: 'Mina' })).toBe(true);
    expect(isClientMessage({ type: 'start', winThreshold: 15 })).toBe(true);
    expect(isClientMessage({
      type: 'decision',
      decision: { type: 'play_card', cardId: 'c1', targetId: 'p2' },
    })).toBe(true);
  });

  it('rejects unknown, malformed, oversized and non-finite payloads', () => {
    expect(isClientMessage(null)).toBe(false);
    expect(isClientMessage({ type: 'explode' })).toBe(false);
    expect(isClientMessage({ type: 'create', name: 'x'.repeat(65) })).toBe(false);
    expect(isClientMessage({ type: 'start', winThreshold: Infinity })).toBe(false);
    expect(isClientMessage({ type: 'decision', decision: { type: 'play_card' } })).toBe(false);
  });
});
