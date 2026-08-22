import React, { useMemo, useState } from 'react';
import {
  activePlayer,
  eligibleTargets,
  getPlayer,
  getStandings,
} from '../src/engine.js';
import type { BotDifficulty } from './useGame.js';
import type { Card } from '../src/types.js';
import { useGame } from './useGame.js';
import { OnlineApp } from './online/OnlineApp.js';
import { CardView } from './components/CardView.js';
import { GameLog } from './components/GameLog.js';
import { Lobby } from './components/Lobby.js';
import { PassInterstitial } from './components/PassInterstitial.js';
import { Scoreboard } from './components/Scoreboard.js';
import { SoloSetup, type SoloConfig } from './components/SoloSetup.js';
import { StressTrack } from './components/StressTrack.js';
import {
  EliminationModal,
  GameOverScreen,
  HandPicker,
  RevealModal,
  TargetPrompt,
} from './components/Modals.js';

const TOOLTIP_NOT_SOLE_LEADER = "You're already winning. Nobody quiet-words the front-runner.";

export function App() {
  const [mode, setMode] = useState<'menu' | 'hotseat' | 'solo' | 'online'>('menu');
  const game = useGame();
  const { state, isBot } = game;

  // Hotseat privacy: hide hands until the deciding player confirms the handover.
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  // Card play staging: card picked, waiting for target selection.
  const [staged, setStaged] = useState<Card | null>(null);
  // peek_swap staging: card taken from the revealed hand, waiting for the give-back pick.
  const [swapTake, setSwapTake] = useState<string | null>(null);

  const resetLocalUi = () => {
    setConfirmedId(null);
    setStaged(null);
    setSwapTake(null);
  };

  const pending = state?.pending ?? null;
  const deciderId = pending?.playerId ?? null;

  const standings = useMemo(
    () => (state && state.gamePhase === 'game_over' ? getStandings(state) : null),
    [state, state?.gamePhase],
  );

  if (mode === 'menu' && !state) {
    // A live online session in this tab (refresh mid-game) jumps straight back in.
    if (sessionStorage.getItem('bandwidth-session')) {
      setMode('online');
      return null;
    }
    return (
      <div className="lobby">
        <h1 className="lobby-title">Bandwidth</h1>
        <p className="lobby-tag">You have none. They want more.</p>
        <button className="btn btn-primary btn-start" onClick={() => setMode('online')}>
          Play online — everyone on their own device
        </button>
        <button className="btn btn-primary btn-start" onClick={() => setMode('solo')}>
          Solo / vs computer — fill empty seats with bots
        </button>
        <button className="btn btn-primary btn-start" onClick={() => setMode('hotseat')}>
          Pass and play — one shared phone
        </button>
      </div>
    );
  }

  if (mode === 'online') {
    return <OnlineApp onBack={() => setMode('menu')} />;
  }

  if (mode === 'solo' && !state) {
    return (
      <SoloSetup
        onBack={() => setMode('menu')}
        onStart={(cfg: SoloConfig) => {
          resetLocalUi();
          const bots: Record<string, BotDifficulty> = {};
          for (const idx of cfg.botIndices) bots[`p${idx}`] = cfg.difficulty;
          game.start({ playerNames: cfg.playerNames, winThreshold: cfg.winThreshold, bots });
        }}
      />
    );
  }

  if (mode === 'hotseat' && !state) {
    return <Lobby onStart={(names, winThreshold) => {
      resetLocalUi();
      game.start({ playerNames: names, winThreshold });
    }} />;
  }

  if (!state) return null;

  if (state.gamePhase === 'game_over' && standings) {
    return <GameOverScreen state={state} standings={standings} onAgain={() => { resetLocalUi(); game.reset(); }} />;
  }

  const active = activePlayer(state);
  const decider = deciderId ? getPlayer(state, deciderId) : active;
  const deciderIsBot = deciderId !== null && isBot(deciderId);

  const humanIds = state.players.filter((p) => !isBot(p.id)).map((p) => p.id);
  const soloSingle = humanIds.length === 1;
  const viewerId = soloSingle ? humanIds[0]! : null;

  // Pass-the-phone privacy only applies BETWEEN HUMANS. A lone human never
  // hands off; bots act automatically and are never gated.
  const needsHandover =
    !soloSingle && deciderId !== null && !deciderIsBot && confirmedId !== deciderId;

  // ---- overlay precedence: elimination moment > reveal > handover > sub-prompts
  const overlay = (() => {
    if (game.moment) {
      return <EliminationModal name={game.moment.eliminatedName} onClose={game.clearMoment} />;
    }
    if (game.reveal) {
      return <RevealModal targetName={game.reveal.targetName} cards={game.reveal.cards} onClose={game.clearReveal} />;
    }
    if (needsHandover) {
      const note =
        pending?.kind === 'aid_discard'
          ? `${getPlayer(state, (pending as { sourcePlayerId: string }).sourcePlayerId).name} actually asked if you're OK. Choose one card to let go of.`
          : undefined;
      return <PassInterstitial name={decider.name} note={note} onReady={() => setConfirmedId(deciderId)} />;
    }
    // Sub-prompts belong to whoever owns the pending decision — never render one
    // for a computer player; the bot driver answers those itself.
    if (pending && isBot(pending.playerId)) return null;
    if (pending?.kind === 'peek_swap') {
      const target = getPlayer(state, pending.targetId);
      if (swapTake === null) {
        return (
          <HandPicker
            title={`${target.name}'s hand — take one card`}
            subtitle="Pick the card you want. Then you'll choose one of yours to hand over."
            cards={target.hand.filter((c) => pending.revealedCardIds.includes(c.id))}
            onPick={(id) => setSwapTake(id)}
          />
        );
      }
      const me = getPlayer(state, pending.playerId);
      return (
        <HandPicker
          title="Give one of yours back"
          cards={me.hand}
          onPick={(giveId) => {
            game.decide({ type: 'peek_swap', takeCardId: swapTake, giveCardId: giveId });
            setSwapTake(null);
          }}
        />
      );
    }
    if (pending?.kind === 'force_discard') {
      const target = getPlayer(state, pending.targetId);
      return (
        <HandPicker
          title={`${target.name}'s hand — choose their discard`}
          subtitle="It's not overtime if they're passionate about the mission."
          cards={target.hand.filter((c) => pending.revealedCardIds.includes(c.id))}
          onPick={(id) => game.decide({ type: 'force_discard', cardId: id })}
        />
      );
    }
    if (pending?.kind === 'aid_discard') {
      const target = getPlayer(state, pending.playerId);
      return (
        <HandPicker
          title="Choose one card to let go of"
          subtitle="You'll draw a replacement. The room breathes out (−6 stress)."
          cards={target.hand}
          onPick={(id) => game.decide({ type: 'aid_discard', cardId: id })}
        />
      );
    }
    if (staged) {
      return (
        <TargetPrompt
          cardName={staged.name}
          targets={eligibleTargets(state, decider.id).map((t) => ({
            id: t.id, name: t.name, influence: t.influence, isProtected: t.isProtected,
          }))}
          onPick={(targetId) => {
            const card = staged;
            setStaged(null);
            game.decide({ type: 'play_card', cardId: card.id, targetId });
          }}
          onCancel={() => setStaged(null)}
        />
      );
    }
    return null;
  })();

  // Which hand (if any) to show face-up, and whether it is interactive now.
  // Solo (1 human): always show the viewer's hand. Multi-human hotseat: show the
  // human decider's hand once they've taken the phone. Never show a bot's hand.
  const handOwnerId = soloSingle
    ? viewerId
    : deciderIsBot || needsHandover || pending?.kind !== 'play_card'
      ? null
      : deciderId;
  const canPlay =
    pending?.kind === 'play_card' && deciderId === handOwnerId && !deciderIsBot && !needsHandover;
  const mustDiscard = canPlay && pending.mustDiscard;
  const handOwner = handOwnerId ? getPlayer(state, handOwnerId) : null;

  const banner = deciderIsBot
    ? `${decider.name} is deciding…`
    : mustDiscard
      ? `${decider.name}: no playable cards — discard one`
      : soloSingle && deciderId === viewerId
        ? 'Your turn — play a card'
        : `${decider.name}'s turn — play a card`;

  return (
    <div className="game">
      <StressTrack value={state.collectiveStress} />
      <Scoreboard state={state} activeId={active.id} botIds={humanIds.length < state.players.length ? new Set(state.players.filter((p) => isBot(p.id)).map((p) => p.id)) : undefined} />
      <div className={`turn-banner${deciderIsBot ? ' turn-bot' : ''}`}>{banner}</div>
      {handOwner && (
        <div className="hand">
          {handOwner.hand.map((c) => {
            const playable = canPlay && (pending.mustDiscard || pending.playableCardIds.includes(c.id));
            const disabled = !canPlay || (!mustDiscard && !playable);
            return (
              <CardView
                key={c.id}
                card={c}
                disabled={disabled}
                disabledReason={
                  canPlay && c.condition === 'not_sole_leader' ? TOOLTIP_NOT_SOLE_LEADER : undefined
                }
                onClick={() => {
                  if (!canPlay) return;
                  if (mustDiscard) game.decide({ type: 'discard_card', cardId: c.id });
                  else if (c.requiresTarget) setStaged(c);
                  else game.decide({ type: 'play_card', cardId: c.id });
                }}
              />
            );
          })}
        </div>
      )}
      <GameLog lines={state.gameLog} />
      {overlay}
    </div>
  );
}
