import React, { useState } from 'react';
import type { BotDifficulty } from '../useGame.js';

// Computer players get corporate-drone names in keeping with the theme.
const BOT_NAMES = [
  'Chad (Regional VP)',
  'The Algorithm',
  'Deepa from Finance',
  'Greg (Consultant)',
  'Karen (People Ops)',
  'Synergy Bot',
  'Nigel (Interim Lead)',
];

export interface SoloConfig {
  playerNames: string[];
  botIndices: number[]; // indices into playerNames that are computer-controlled
  difficulty: BotDifficulty;
  winThreshold: number;
}

export function SoloSetup({ onStart, onBack }: { onStart: (config: SoloConfig) => void; onBack: () => void }) {
  const [humans, setHumans] = useState(1);
  const [bots, setBots] = useState(2);
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal');
  const [names, setNames] = useState<string[]>(['You', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6']);
  const [threshold, setThreshold] = useState(15);

  const total = humans + bots;
  const valid = total >= 3 && total <= 8;

  // Keep the total legal as the two dials move.
  const setHumanCount = (n: number) => {
    setHumans(n);
    if (n + bots < 3) setBots(3 - n);
    if (n + bots > 8) setBots(8 - n);
  };
  const minBots = Math.max(0, 3 - humans);
  const maxBots = 8 - humans;

  return (
    <div className="lobby">
      <h1 className="lobby-title">Bandwidth</h1>
      <p className="lobby-tag">Play solo or short-handed — computers fill the empty desks.</p>

      <label className="field">
        <span>Real players</span>
        <div className="count-row">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} className={`count-btn${humans === n ? ' count-on' : ''}`} onClick={() => setHumanCount(n)}>
              {n}
            </button>
          ))}
        </div>
      </label>

      <label className="field">
        <span>Computer players</span>
        <div className="count-row">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => {
            const disabled = n < minBots || n > maxBots;
            return (
              <button
                key={n}
                className={`count-btn${bots === n ? ' count-on' : ''}`}
                disabled={disabled}
                onClick={() => !disabled && setBots(n)}
              >
                {n}
              </button>
            );
          })}
        </div>
      </label>

      <div className="total-hint">{total} at the table {valid ? '' : '· need 3–8'}</div>

      {bots > 0 && (
        <label className="field">
          <span>Computer skill</span>
          <div className="count-row">
            <button className={`count-btn${difficulty === 'easy' ? ' count-on' : ''}`} onClick={() => setDifficulty('easy')}>
              Easy
            </button>
            <button className={`count-btn${difficulty === 'normal' ? ' count-on' : ''}`} onClick={() => setDifficulty('normal')}>
              Normal
            </button>
          </div>
        </label>
      )}

      {Array.from({ length: humans }, (_, i) => (
        <label className="field" key={i}>
          <span>{i === 0 ? 'Your name' : `Player ${i + 1}`}</span>
          <input
            value={names[i]}
            maxLength={16}
            onChange={(e) => {
              const next = [...names];
              next[i] = e.target.value;
              setNames(next);
            }}
          />
        </label>
      ))}

      <label className="field">
        <span>Win threshold (Influence)</span>
        <input
          type="number" min={5} max={30} value={threshold}
          onChange={(e) => setThreshold(Math.max(5, Math.min(30, Number(e.target.value) || 15)))}
        />
      </label>

      <button
        className="btn btn-primary btn-start"
        disabled={!valid}
        onClick={() => {
          const humanNames = names.slice(0, humans).map((n, i) => n.trim() || (i === 0 ? 'You' : `Player ${i + 1}`));
          const botNames = Array.from({ length: bots }, (_, i) => BOT_NAMES[i % BOT_NAMES.length]!);
          const playerNames = [...humanNames, ...botNames];
          const botIndices = botNames.map((_, i) => humans + i);
          onStart({ playerNames, botIndices, difficulty, winThreshold: threshold });
        }}
      >
        {valid ? `Start (${humans} vs ${bots} computer${bots === 1 ? '' : 's'})` : 'Pick 3–8 total'}
      </button>
      <button className="btn btn-ghost" onClick={onBack}>Back</button>
    </div>
  );
}
