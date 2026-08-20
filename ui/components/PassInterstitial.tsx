import React from 'react';

/** Hotseat privacy screen (§8): hands stay hidden until the named player taps. */
export function PassInterstitial({ name, note, onReady }: { name: string; note?: string; onReady: () => void }) {
  return (
    <div className="overlay">
      <div className="pass-screen">
        <div className="pass-kicker">Pass the phone to</div>
        <div className="pass-name">{name}</div>
        {note && <div className="pass-note">{note}</div>}
        <button className="btn btn-primary" onClick={onReady}>
          I'm {name} — show my hand
        </button>
      </div>
    </div>
  );
}
