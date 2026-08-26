import { accessSync, constants } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD_SPECS } from '../src/cards.js';
import { cardArtPath, cardArtSlug } from '../ui/cardArt.js';

describe('card artwork manifest', () => {
  it('gives every unique card a filesystem-safe, unique slug', () => {
    const slugs = CARD_SPECS.map((card) => cardArtSlug(card.name));
    expect(new Set(slugs).size).toBe(CARD_SPECS.length);
    expect(slugs.every((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))).toBe(true);
  });

  it('has a readable image for every unique card', () => {
    for (const card of CARD_SPECS) {
      const publicPath = cardArtPath(card.name).replace(/^\//, '');
      expect(() => accessSync(resolve(process.cwd(), 'public', publicPath), constants.R_OK)).not.toThrow();
    }
  });
});
