// Online multiplayer screens: home (create/join), room lobby, and the game
// view driven by redacted server state. Reuses the hotseat presentational
// components wherever the shapes allow.
import React, { useState } from 'react';
import type { Card } from '../../src/types.js';
import { CardView } from '../components/CardView.js';
import { GameLog } from '../components/GameLog.js';
import { StressTrack } from '../components/StressTrack.js';
import { EliminationModal, HandPicker, RevealModal, TargetPrompt } from '../components/Modals.js';
import { useOnline } from './useOnline.js';

const TOOLTIP_NOT_SOLE_LEADER = "You're already winning. Nobody quiet-words the front-runner.";

export function OnlineApp({ onBack }: { onBack: () => void }) {
  const online = useOnline();
  const { state } = online;
  const [staged, setStaged] = useState<Card | null>(null);
  const [swapTake, setSwapTake] = useState<string | null>(null);

  if (state.status === 'idle' || state.status === 'connecting') {
    return <OnlineHome online={online} onBack={onBack} connecting={state.status === 'connecting'} />;
  }

  if (state.status === 'lobby') {
    return <RoomLobby online={online} onBack={onBack} />;
  }

  const view = state.view;
  if (!view) return <div className="lobby"><p>Loading…</p></div>;

  if (view.gamePhase === 'game_over' && view.standings) {
    const winner = view.standings[0]!;
    const reason =
      view.winReason === 'influence' ? `reached ${view.winThreshold} Influence`
      : view.winReason === 'sole_survivor' ? 'outlasted everyone (sole survivor)'
      : 'had the most Influence at the turn cap';
    return (
      <div className="gameover">
        <div className="go-trophy">🏆</div>
        <h1>{winner.name} wins</h1>
        <p className="go-reason">{winner.name} {reason}.</p>
        <table className="go-table">
          <thead><tr><th>#</th><th>Player</th><th>Influence</th><th></th></tr></thead>
          <tbody>
            {view.standings.map((s, i) => (
              <tr key={s.playerId} className={s.isAlive ? '' : 'go-dead'}>
                <td>{i + 1}</td>
                <td>{s.name}{s.isWinner ? ' 🏆' : ''}{s.playerId === view.you ? ' (you)' : ''}</td>
                <td>{s.influence}⭐</td>
                <td>{s.isAlive ? '' : 'eliminated'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {online.state.youAreHost
          ? <button className="btn btn-primary" onClick={online.restart}>Back to lobby</button>
          : <p className="go-reason">Waiting for the host to restart…</p>}
        <button className="btn btn-ghost" onClick={() => { online.leave(); onBack(); }}>Leave room</button>
      </div>
    );
  }

  const you = view.players.find((p) => p.id === view.you)!;
  const pending = view.pending;
  const yourTurn = pending !== null && pending.kind !== 'waiting';

  const overlay = (() => {
    if (state.moment) return <EliminationModal name={state.moment.eliminatedName} onClose={online.clearMoment} />;
    if (state.reveal) {
      return <RevealModal targetName={state.reveal.targetName} cards={state.reveal.cards} onClose={online.clearReveal} />;
    }
    if (pending?.kind === 'peek_swap') {
      if (swapTake === null) {
        return (
          <HandPicker
            title={`${pending.targetName}'s hand — take one card`}
            subtitle="Pick the card you want. Then you'll choose one of yours to hand over."
            cards={pending.revealedCards}
            onPick={(id) => setSwapTake(id)}
          />
        );
      }
      return (
        <HandPicker
          title="Give one of yours back"
          cards={view.hand}
          onPick={(giveId) => {
            online.decide({ type: 'peek_swap', takeCardId: swapTake, giveCardId: giveId });
            setSwapTake(null);
          }}
        />
      );
    }
    if (pending?.kind === 'force_discard') {
      return (
        <HandPicker
          title={`${pending.targetName}'s hand — choose their discard`}
          cards={pending.revealedCards}
          onPick={(id) => online.decide({ type: 'force_discard', cardId: id })}
        />
      );
    }
    if (pending?.kind === 'aid_discard') {
      return (
        <HandPicker
          title="Choose one card to let go of"
          subtitle={`${pending.sourceName} actually asked if you're OK. You'll draw a replacement (−6 stress).`}
          cards={view.hand}
          onPick={(id) => online.decide({ type: 'aid_discard', cardId: id })}
        />
      );
    }
    if (staged) {
      return (
        <TargetPrompt
          cardName={staged.name}
          targets={view.players
            .filter((p) => p.isAlive && p.id !== view.you)
            .map((t) => ({ id: t.id, name: t.name, influence: t.influence, isProtected: t.isProtected }))}
          onPick={(targetId) => {
            const card = staged;
            setStaged(null);
            online.decide({ type: 'play_card', cardId: card.id, targetId });
          }}
          onCancel={() => setStaged(null)}
        />
      );
    }
    return null;
  })();

  const mustDiscard = pending?.kind === 'play_card' && pending.mustDiscard;

  return (
    <div className="game">
      <StressTrack value={view.collectiveStress} />
      <div className="scoreboard">
        {view.players.map((p) => (
          <div
            key={p.id}
            className={`score-chip${p.id === view.activeId ? ' score-active' : ''}${!p.isAlive ? ' score-dead' : ''}`}
          >
            <span className="score-name">
              {p.name}{p.id === view.you ? ' (you)' : ''}
              {p.isProtected && ' 🛡'}
              {p.skipNextTurn && ' ⏭'}
              {p.forcedPlayHighestStress && ' 📋'}
              {!p.connected && ' 🔌'}
            </span>
            <span className="score-inf">{p.influence}⭐</span>
            <span className="score-hand">{p.isAlive ? `${p.handCount} 🂠` : 'OUT'}</span>
          </div>
        ))}
        <div className="score-goal">First to {view.winThreshold}⭐ wins · room {state.code}</div>
      </div>
      <div className="turn-banner">
        {yourTurn
          ? mustDiscard ? 'No playable cards — discard one' : 'Your turn — play a card'
          : pending?.kind === 'waiting' ? `Waiting for ${pending.playerName}…` : ''}
      </div>
      <div className="hand">
        {view.hand.map((c) => {
          const playable =
            pending?.kind === 'play_card' && (pending.mustDiscard || pending.playableCardIds.includes(c.id));
          const disabled = !yourTurn || !playable;
          return (
            <CardView
              key={c.id}
              card={c}
              disabled={disabled}
              disabledReason={
                yourTurn && c.condition === 'not_sole_leader' ? TOOLTIP_NOT_SOLE_LEADER : undefined
              }
              onClick={() => {
                if (!yourTurn || pending?.kind !== 'play_card') return;
                if (pending.mustDiscard) online.decide({ type: 'discard_card', cardId: c.id });
                else if (c.requiresTarget) setStaged(c);
                else online.decide({ type: 'play_card', cardId: c.id });
              }}
            />
          );
        })}
      </div>
      <GameLog lines={view.log} />
      {state.error && <div className="net-error" onClick={online.clearError}>{state.error}</div>}
      {overlay}
      {void you}
    </div>
  );
}

function OnlineHome({
  online,
  onBack,
  connecting,
}: {
  online: ReturnType<typeof useOnline>;
  onBack: () => void;
  connecting: boolean;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  return (
    <div className="lobby">
      <h1 className="lobby-title">Bandwidth</h1>
      <p className="lobby-tag">You have none. They want more.</p>
      <label className="field">
        <span>Your name</span>
        <input value={name} maxLength={16} placeholder="e.g. Maria" onChange={(e) => setName(e.target.value)} />
      </label>
      <button
        className="btn btn-primary btn-start"
        disabled={connecting || !name.trim()}
        onClick={() => online.create(name)}
      >
        {connecting ? 'Connecting…' : 'Create a room'}
      </button>
      <div className="join-divider">— or join a friend's room —</div>
      <label className="field">
        <span>Room code</span>
        <input
          value={code}
          maxLength={4}
          placeholder="e.g. QK7M"
          style={{ textTransform: 'uppercase', letterSpacing: '4px' }}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </label>
      <button
        className="btn btn-primary"
        disabled={connecting || !name.trim() || code.trim().length !== 4}
        onClick={() => online.join(code, name)}
      >
        Join room
      </button>
      {online.state.error && <div className="net-error" onClick={online.clearError}>{online.state.error}</div>}
      <button className="btn btn-ghost" onClick={onBack}>Back</button>
    </div>
  );
}

function RoomLobby({ online, onBack }: { online: ReturnType<typeof useOnline>; onBack: () => void }) {
  const { state } = online;
  const [threshold, setThreshold] = useState(15);
  const enough = state.lobby.length >= 3;
  return (
    <div className="lobby">
      <h1 className="lobby-title">Room {state.code}</h1>
      <p className="lobby-tag">Share this code. Friends join at this site from any device.</p>
      <div className="lobby-roster">
        {state.lobby.map((p) => (
          <div key={p.seatId} className="score-chip">
            <span className="score-name">
              {p.name}{p.isHost ? ' 👑' : ''}{!p.connected ? ' 🔌' : ''}
            </span>
          </div>
        ))}
        {state.lobby.length < 3 && (
          <div className="score-goal">Waiting for players… {state.lobby.length}/3 minimum (8 max)</div>
        )}
      </div>
      {state.youAreHost ? (
        <>
          <label className="field">
            <span>Win threshold (Influence)</span>
            <input
              type="number" min={5} max={30} value={threshold}
              onChange={(e) => setThreshold(Math.max(5, Math.min(30, Number(e.target.value) || 15)))}
            />
          </label>
          <button className="btn btn-primary btn-start" disabled={!enough} onClick={() => online.start(threshold)}>
            {enough ? `Start with ${state.lobby.length} players` : 'Need at least 3 players'}
          </button>
        </>
      ) : (
        <p className="lobby-tag">Waiting for the host to start…</p>
      )}
      {state.error && <div className="net-error" onClick={online.clearError}>{state.error}</div>}
      <button className="btn btn-ghost" onClick={() => { online.leave(); onBack(); }}>Leave room</button>
    </div>
  );
}
