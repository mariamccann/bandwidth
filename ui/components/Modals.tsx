import React from 'react';
import { CardView } from './CardView.js';
import type { Card, GameState, StandingsEntry } from '../../src/types.js';

export function TargetPrompt({
  cardName,
  targets,
  onPick,
  onCancel,
}: {
  cardName: string;
  targets: { id: string; name: string; influence: number; isProtected: boolean }[];
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="overlay">
      <div className="modal">
        <h2>Choose a target for {cardName}</h2>
        <div className="target-list">
          {targets.map((t) => (
            <button key={t.id} className="btn target-btn" onClick={() => onPick(t.id)}>
              {t.name} — {t.influence}⭐{t.isProtected ? ' 🛡' : ''}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function HandPicker({
  title,
  subtitle,
  cards,
  onPick,
}: {
  title: string;
  subtitle?: string;
  cards: Card[];
  onPick: (cardId: string) => void;
}) {
  return (
    <div className="overlay">
      <div className="modal modal-wide">
        <h2>{title}</h2>
        {subtitle && <p className="modal-sub">{subtitle}</p>}
        <div className="hand hand-picker">
          {cards.map((c) => (
            <CardView key={c.id} card={c} onClick={() => onPick(c.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function RevealModal({
  targetName,
  cards,
  onClose,
}: {
  targetName: string;
  cards: Card[];
  onClose: () => void;
}) {
  return (
    <div className="overlay">
      <div className="modal modal-wide">
        <h2>{targetName}'s hand</h2>
        <p className="modal-sub">For your eyes only. Nothing's confirmed. Everything's confirmed.</p>
        <div className="hand hand-picker">
          {cards.map((c) => (
            <CardView key={c.id} card={c} />
          ))}
        </div>
        <button className="btn btn-primary" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

export function EliminationModal({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <div className="overlay">
      <div className="modal modal-elim">
        <div className="elim-burst">📤</div>
        <h2>{name} is out</h2>
        <p className="elim-quote">"Meet you all down the pub for a goodbye drink."</p>
        <p>
          {name} tipped the Collective Stress Track past 100. The track resets to 0 —
          and the <strong>Halo Effect</strong> costs every survivor 2 Influence. Nobody
          profits cleanly from a colleague's collapse.
        </p>
        <button className="btn btn-primary" onClick={onClose}>Back to work</button>
      </div>
    </div>
  );
}

export function GameOverScreen({
  state,
  standings,
  onAgain,
}: {
  state: GameState;
  standings: StandingsEntry[];
  onAgain: () => void;
}) {
  const winner = standings[0]!;
  const reason =
    state.winReason === 'influence' ? `reached ${state.winThreshold} Influence`
    : state.winReason === 'sole_survivor' ? 'outlasted everyone (sole survivor)'
    : 'had the most Influence at the turn cap';
  const elimLines = state.gameLog.filter((l) => l.includes('tipped the Stress Track'));
  return (
    <div className="gameover">
      <div className="go-trophy">🏆</div>
      <h1>{winner.name} wins</h1>
      <p className="go-reason">{winner.name} {reason}.</p>
      <table className="go-table">
        <thead>
          <tr><th>#</th><th>Player</th><th>Influence</th><th></th></tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr key={s.playerId} className={s.isAlive ? '' : 'go-dead'}>
              <td>{i + 1}</td>
              <td>{s.name}{s.isWinner ? ' 🏆' : ''}</td>
              <td>{s.influence}⭐</td>
              <td>{s.isAlive ? '' : 'eliminated'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {elimLines.length > 0 && (
        <div className="go-elims">
          <h3>Casualties</h3>
          {elimLines.map((l, i) => <div key={i} className="log-line">{l}</div>)}
        </div>
      )}
      <button className="btn btn-primary" onClick={onAgain}>Play again</button>
    </div>
  );
}
