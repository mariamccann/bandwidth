import React, { useState } from 'react';
import { DEFAULT_WIN_THRESHOLD } from '../../src/engine.js';

export function Lobby({ onStart }: { onStart: (names: string[], winThreshold: number) => void }) {
  const [count, setCount] = useState(4);
  const [names, setNames] = useState<string[]>(Array.from({ length: 8 }, (_, i) => `Player ${i + 1}`));
  const [threshold, setThreshold] = useState(DEFAULT_WIN_THRESHOLD);
  return (
    <div className="lobby">
      <h1 className="lobby-title">Bandwidth</h1>
      <p className="lobby-tag">You have none. They want more.</p>
      <label className="field">
        <span>Players (3–8)</span>
        <div className="count-row">
          {[3, 4, 5, 6, 7, 8].map((n) => (
            <button key={n} className={`count-btn${count === n ? ' count-on' : ''}`} onClick={() => setCount(n)}>
              {n}
            </button>
          ))}
        </div>
      </label>
      {Array.from({ length: count }, (_, i) => (
        <label className="field" key={i}>
          <span>Player {i + 1}</span>
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
          type="number"
          min={5}
          max={30}
          value={threshold}
          onChange={(e) => setThreshold(Math.max(5, Math.min(30, Number(e.target.value) || DEFAULT_WIN_THRESHOLD)))}
        />
      </label>
      <button
        className="btn btn-primary btn-start"
        onClick={() => onStart(names.slice(0, count).map((n, i) => n.trim() || `Player ${i + 1}`), threshold)}
      >
        Start Game
      </button>
    </div>
  );
}
