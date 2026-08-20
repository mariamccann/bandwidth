import React from 'react';

export function StressTrack({ value }: { value: number }) {
  const pct = Math.min(100, value);
  const hot = value >= 80;
  return (
    <div className={`stress-track${hot ? ' stress-hot' : ''}`} aria-label={`Collective Stress ${value} of 100`}>
      <div className="stress-labels">
        <span>Collective Stress</span>
        <span className="stress-value">{value} / 100</span>
      </div>
      <div className="stress-bar">
        <div className="stress-fill" style={{ width: `${pct}%` }} />
        <div className="stress-limit" />
      </div>
    </div>
  );
}
