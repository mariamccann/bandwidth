import React, { useEffect, useRef } from 'react';

export function GameLog({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines.length]);
  return (
    <div className="game-log" ref={ref}>
      {lines.slice(-40).map((l, i) => (
        <div key={i} className="log-line">{l}</div>
      ))}
    </div>
  );
}
