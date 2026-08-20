import React from 'react';
import { influenceYield, stressLoad } from '../../src/cards.js';
import type { Card } from '../../src/types.js';

const DECK_LABEL: Record<Card['deckType'], string> = {
  Stress: 'STRESS',
  Politics: 'POLITICS',
  Employee: 'EMPLOYEE POLICY',
  Influence: 'INFLUENCE',
  Support: 'SUPPORT',
};

export function CardView({
  card,
  disabled,
  disabledReason,
  selected,
  onClick,
}: {
  card: Card;
  disabled?: boolean;
  disabledReason?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const inf = influenceYield(card);
  const relief = card.effectType === 'stress_delta' && (card.effectParams.amount ?? 0) < 0
    ? -(card.effectParams.amount ?? 0) : 0;
  const load = stressLoad(card);
  return (
    <button
      className={`card deck-${card.deckType.toLowerCase()}${disabled ? ' card-disabled' : ''}${selected ? ' card-selected' : ''}`}
      onClick={disabled ? undefined : onClick}
      title={disabled ? disabledReason : undefined}
      aria-disabled={disabled}
    >
      <span className="card-deck">{DECK_LABEL[card.deckType]}</span>
      <span className="card-name">{card.name}</span>
      <span className="card-stats">
        {inf > 0 && <span className="stat stat-inf">+{inf}⭐</span>}
        {load > 0 && <span className="stat stat-stress">+{load}🔥</span>}
        {relief > 0 && <span className="stat stat-relief">−{relief}🔥</span>}
        {card.requiresTarget && <span className="stat stat-target">🎯</span>}
      </span>
      <span className="card-flavour">{card.flavour}</span>
      {disabled && disabledReason && <span className="card-tooltip">{disabledReason}</span>}
    </button>
  );
}
