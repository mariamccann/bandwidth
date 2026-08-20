import React from 'react';
import type { GameState } from '../../src/types.js';

export function Scoreboard({ state, activeId }: { state: GameState; activeId: string | null }) {
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
              {p.isProtected && ' 🛡'}
              {p.skipNextTurn && ' ⏭'}
              {p.forcedPlayHighestStress && ' 📋'}
            </span>
            <span className="score-inf">{p.influence}⭐</span>
            <span className="score-hand">{p.isAlive ? `${p.hand.length} 🂠` : 'OUT'}</span>
          </div>
        );
      })}
      <div className="score-goal">First to {state.winThreshold}⭐ wins</div>
    </div>
  );
}
