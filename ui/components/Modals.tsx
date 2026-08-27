import React, { useEffect, useId, useRef, type ReactNode } from 'react';
import { cardRuleText, influenceYield, stressLoad } from '../../src/cards.js';
import { CardView } from './CardView.js';
import type { Card, GameState, StandingsEntry } from '../../src/types.js';
import { cardArtPath } from '../cardArt.js';

function ModalFrame({
  title,
  subtitle,
  className = '',
  onClose,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const modal = modalRef.current;
    if (!modal) return;
    const focusable = () => Array.from(modal.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ));
    (focusable()[0] ?? modal).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) { event.preventDefault(); return; }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, []);
  return (
    <div className="overlay" role="presentation">
      <div
        ref={modalRef}
        className={`modal${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {subtitle && <p className="modal-sub">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

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
    <ModalFrame title={<>Choose a target for <em>{cardName}</em></>} onClose={onCancel}>
      <div className="target-list">
        {targets.map((t) => (
          <button key={t.id} className="btn target-btn" onClick={() => onPick(t.id)}>
            {t.name} — {t.influence} Influence{t.isProtected ? ' · protected' : ''}
          </button>
        ))}
      </div>
      <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
    </ModalFrame>
  );
}

export function HandPicker({
  title,
  subtitle,
  cards,
  onPick,
  confirmLabel,
}: {
  title: string;
  subtitle?: string;
  cards: Card[];
  onPick: (cardId: string) => void;
  /** When supplied, selecting a card opens its full details before committing. */
  confirmLabel?: string;
}) {
  const [preview, setPreview] = React.useState<Card | null>(null);
  if (preview && confirmLabel) {
    return (
      <CardDetailModal
        card={preview}
        onClose={() => setPreview(null)}
        actionLabel={confirmLabel}
        onAction={() => {
          const id = preview.id;
          setPreview(null);
          onPick(id);
        }}
        closeLabel="Back to the hand"
      />
    );
  }
  return (
    <ModalFrame title={title} subtitle={subtitle} className="modal-wide">
      <div className="hand hand-picker">
        {cards.map((c) => (
          <CardView
            key={c.id}
            card={c}
            onClick={() => confirmLabel ? setPreview(c) : onPick(c.id)}
          />
        ))}
      </div>
    </ModalFrame>
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
    <ModalFrame
      title={`${targetName}'s hand`}
      subtitle="For your eyes only. Nothing's confirmed. Everything's confirmed."
      className="modal-wide"
      onClose={onClose}
    >
      <div className="hand hand-picker">
        {cards.map((c) => (
          <CardView key={c.id} card={c} />
        ))}
      </div>
      <button className="btn btn-primary" onClick={onClose}>Got it</button>
    </ModalFrame>
  );
}

export function EliminationModal({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <ModalFrame title={`${name} is out`} className="modal-elim" onClose={onClose}>
        <div className="elim-burst" aria-hidden="true">📤</div>
        <p className="elim-quote">"Meet you all down the pub for a goodbye drink."</p>
        <p>
          {name} tipped the Collective Stress Track past 100. The track settles at 75 —
          and the <strong>Halo Effect</strong> costs every survivor 2 Influence. Nobody
          profits cleanly from a colleague's collapse.
        </p>
        <button className="btn btn-primary" onClick={onClose}>Back to work</button>
    </ModalFrame>
  );
}

export function CardDetailModal({
  card,
  onClose,
  actionLabel,
  onAction,
  closeLabel = 'Close',
}: {
  card: Card;
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
  closeLabel?: string;
}) {
  const inf = influenceYield(card);
  const load = stressLoad(card);
  const relief = card.effectType === 'stress_delta' && (card.effectParams.amount ?? 0) < 0
    ? -(card.effectParams.amount ?? 0) : 0;
  return (
    <ModalFrame title={card.name} subtitle={card.deckType} className="card-detail-modal" onClose={onClose}>
      <img className="card-detail-art" src={cardArtPath(card.name)} alt="" />
      <div className="detail-stats" aria-label="Card effects">
        {inf > 0 && <span>+{inf} Influence</span>}
        {load > 0 && <span>+{load} Collective Stress</span>}
        {relief > 0 && <span>−{relief} Collective Stress</span>}
        {card.requiresTarget && <span>Choose a target</span>}
      </div>
      <p className="detail-rule">{cardRuleText(card)}</p>
      <p className="detail-flavour">{card.flavour}</p>
      <div className="detail-actions">
        {actionLabel && onAction && <button className="btn btn-primary" onClick={onAction}>{actionLabel}</button>}
        <button className={actionLabel ? 'btn btn-ghost' : 'btn btn-primary'} onClick={onClose}>{closeLabel}</button>
      </div>
    </ModalFrame>
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
