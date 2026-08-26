import React from 'react';
import type { GameState } from '../../src/types.js';

export function Scoreboard({
  state,
  activeId,
  botIds,
}: {
  state: GameState;
  activeId: string | null;
  botIds?: Set<string>;
}) {
  return (
    <div className="scoreboard">
      {state.turnOrder.map((id) => {
        const p = state.players.find((pl) => pl.id === id)!;
        return (
          <div
            key={p.id}
            className={`score-chip${p.id === activeId ? ' score-active' : ''}${!p.isAlive ? ' score-dead' : ''}`}
          >
            <span className="score-name">
              {p.name}
              {botIds?.has(p.id) && <span className="status-icon" role="img" aria-label="Computer player"> 🤖</span>}
              {p.isProtected && <span className="status-icon" role="img" aria-label="Protected"> 🛡</span>}
              {p.skipNextTurn && <span className="status-icon" role="img" aria-label="Will skip next turn"> ⏭</span>}
              {p.forcedPlayHighestStress && <span className="status-icon" role="img" aria-label="Forced play pending"> 📋</span>}
            </span>
            <span className="score-inf">{p.influence}⭐</span>
            <span className="score-hand">{p.isAlive ? `${p.hand.length} 🂠` : 'OUT'}</span>
          </div>
        );
      })}
      <div className="score-goal">First to {state.winThreshold} Influence wins</div>
    </div>
  );
}
