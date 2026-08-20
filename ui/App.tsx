import React, { useMemo, useRef, useState } from 'react';
import {
  activePlayer,
  eligibleTargets,
  getPlayer,
  getStandings,
} from '../src/engine.js';
import type { Card } from '../src/types.js';
import { useGame } from './useGame.js';
import { CardView } from './components/CardView.js';
import { GameLog } from './components/GameLog.js';
import { Lobby } from './components/Lobby.js';
import { PassInterstitial } from './components/PassInterstitial.js';
import { Scoreboard } from './components/Scoreboard.js';
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
  const game = useGame();
  const { state } = game;

  // Hotseat privacy: hide hands until the deciding player confirms the handover.
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  // Card play staging: card picked, waiting for target selection.
  const [staged, setStaged] = useState<Card | null>(null);
  // peek_swap staging: card taken from the revealed hand, waiting for the give-back pick.
  const [swapTake, setSwapTake] = useState<string | null>(null);
  const lastDecider = useRef<string | null>(null);

  const pending = state?.pending ?? null;
  const deciderId = pending?.playerId ?? null;

  const standings = useMemo(
    () => (state && state.gamePhase === 'game_over' ? getStandings(state) : null),
    [state, state?.gamePhase],
  );

  if (!state) {
    return <Lobby onStart={(names, winThreshold) => {
      setConfirmedId(null);
      setStaged(null);
      setSwapTake(null);
      lastDecider.current = null;
      game.start({ playerNames: names, winThreshold });
    }} />;
  }

  if (state.gamePhase === 'game_over' && standings) {
    return <GameOverScreen state={state} standings={standings} onAgain={game.reset} />;
  }

  const active = activePlayer(state);
  const decider = deciderId ? getPlayer(state, deciderId) : active;

  // ---- overlay precedence: elimination moment > reveal > handover > sub-prompts
  const needsHandover = deciderId !== null && confirmedId !== deciderId;

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

  const showHand = pending?.kind === 'play_card' && !needsHandover;
  const mustDiscard = pending?.kind === 'play_card' && pending.mustDiscard;

  return (
    <div className="game">
      <StressTrack value={state.collectiveStress} />
      <Scoreboard state={state} activeId={active.id} />
      <div className="turn-banner">
        {mustDiscard
          ? `${decider.name}: no playable cards — discard one`
          : `${decider.name}'s turn — play a card`}
      </div>
      {showHand && (
        <div className="hand">
          {decider.hand.map((c) => {
            const playable = pending.playableCardIds.includes(c.id);
            const disabled = !mustDiscard && !playable;
            return (
              <CardView
                key={c.id}
                card={c}
                disabled={disabled}
                disabledReason={c.condition === 'not_sole_leader' ? TOOLTIP_NOT_SOLE_LEADER : undefined}
                onClick={() => {
                  if (mustDiscard) {
                    game.decide({ type: 'discard_card', cardId: c.id });
                  } else if (c.requiresTarget) {
                    setStaged(c);
                  } else {
                    game.decide({ type: 'play_card', cardId: c.id });
                  }
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
