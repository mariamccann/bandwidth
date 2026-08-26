import React from 'react';

export function StressTrack({ value }: { value: number }) {
  const pct = Math.min(100, value);
  const hot = value >= 80;
  return (
    <section className={`stress-track${hot ? ' stress-hot' : ''}`} aria-label="Collective Stress">
      <div className="stress-labels">
        <span>Collective Stress</span>
        <span className="stress-value">{value} / 100</span>
      </div>
      <div
        className="stress-bar"
        role="progressbar"
        aria-label="Collective Stress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${value} out of 100${hot ? ', danger zone' : ''}`}
      >
        <div className="stress-fill" style={{ width: `${pct}%` }} />
        <div className="stress-limit" />
      </div>
      <div className="stress-scale" aria-hidden="true"><span>manageable</span><span>concerning</span><span>career-limiting</span></div>
    </section>
  );
}
