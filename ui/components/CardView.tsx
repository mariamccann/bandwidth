import React from 'react';
import { cardRuleText, influenceYield, stressLoad } from '../../src/cards.js';
import type { Card } from '../../src/types.js';
import { cardArtPath } from '../cardArt.js';

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
  onInspect,
}: {
  card: Card;
  disabled?: boolean;
  disabledReason?: string;
  selected?: boolean;
  onClick?: () => void;
  onInspect?: () => void;
}) {
  const inf = influenceYield(card);
  const relief = card.effectType === 'stress_delta' && (card.effectParams.amount ?? 0) < 0
    ? -(card.effectParams.amount ?? 0) : 0;
  const load = stressLoad(card);
  return (
    <div className={`card-shell deck-${card.deckType.toLowerCase()}${selected ? ' card-selected' : ''}`}>
      <button
        type="button"
        className={`card${disabled ? ' card-disabled' : ''}`}
        onClick={onClick}
        title={disabled ? disabledReason : undefined}
        disabled={disabled || !onClick}
      >
        <img className="card-art" src={cardArtPath(card.name)} alt="" aria-hidden="true" loading="lazy" />
        <span className="card-shade" aria-hidden="true" />
        <span className="card-deck">{DECK_LABEL[card.deckType]}</span>
        <span className="card-content">
          <span className="card-name">{card.name}</span>
          <span className="card-stats">
            {inf > 0 && <span className="stat stat-inf" aria-label={`Gain ${inf} Influence`}><span aria-hidden="true">+{inf}⭐</span></span>}
            {load > 0 && <span className="stat stat-stress" aria-label={`Add ${load} Collective Stress`}><span aria-hidden="true">+{load}▲</span></span>}
            {relief > 0 && <span className="stat stat-relief" aria-label={`Remove ${relief} Collective Stress`}><span aria-hidden="true">−{relief}▼</span></span>}
            {card.requiresTarget && <span className="stat stat-target" aria-label="Requires a target"><span aria-hidden="true">◎</span></span>}
          </span>
          <span className="card-rule">{cardRuleText(card)}</span>
        </span>
        {disabled && disabledReason && <span className="card-tooltip">{disabledReason}</span>}
      </button>
      {onInspect && (
        <button type="button" className="card-info" onClick={onInspect} aria-label={`View ${card.name} details`}>
          <span aria-hidden="true">i</span>
        </button>
      )}
    </div>
  );
}
