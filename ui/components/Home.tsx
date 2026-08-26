import React from 'react';

interface HomeProps {
  onOnline: () => void;
  onSolo: () => void;
  onHotseat: () => void;
}

const MODES = [
  {
    eyebrow: '3–8 players',
    title: 'Play online',
    copy: 'One room code. Everyone’s terrible hand is classified: strictly need-to-know.',
    action: 'Create or join a room',
    key: 'online',
  },
  {
    eyebrow: '1–6 humans + AI colleagues',
    title: 'Solo / vs AI',
    copy: 'Fill the empty desks with your new AI colleagues. They’re always available and somehow already in the succession plan.',
    action: 'Set up a game',
    key: 'solo',
  },
  {
    eyebrow: '3–8 players · one phone',
    title: 'Pass and play',
    copy: 'Hand over the device. Pretend you did not look at anyone else’s cards.',
    action: 'Gather around',
    key: 'hotseat',
  },
] as const;

export function Home({ onOnline, onSolo, onHotseat }: HomeProps) {
  const actions = { online: onOnline, solo: onSolo, hotseat: onHotseat };
  return (
    <main className="home-shell">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-copy">
          <div className="brand-lockup" aria-label="Bandwidth">
            <span className="brand-mark" aria-hidden="true">B/</span>
            <span>Bandwidth</span>
          </div>
          <p className="home-kicker">A corporate survival card game</p>
          <h1 id="home-title">You have none.<br />They want more.</h1>
          <p className="home-intro">
            Race for Influence while every career-enhancing initiative raises the team’s Collective Stress.
            Take it to 100 and the company will no longer require your services.
          </p>
          <a className="text-link" href="#how-it-works">How the quarterly nightmare works <span aria-hidden="true">↓</span></a>
        </div>
        <img
          className="home-hero-art"
          src="/assets/brand/bandwidth-hero.png"
          alt="An overwhelmed office worker beneath a collective stress gauge nearing its limit"
        />
      </section>

      <section className="how-section" id="how-it-works" aria-labelledby="how-heading">
        <div className="section-heading">
          <p className="section-number">01 / OKRs</p>
          <h2 id="how-heading">Get ahead. Don’t burn everyone out.</h2>
        </div>
        <ol className="how-grid">
          <li>
            <span className="how-index">1</span>
            <h3>Make your move</h3>
            <p>On your turn, play one card from your six-card hand. Resolve it, then draw back to six.</p>
          </li>
          <li>
            <span className="how-index">2</span>
            <h3>Make it everyone’s problem</h3>
            <p>Gain Influence, undermine a colleague or lower Collective Stress. Most career-enhancing moves raise it.</p>
          </li>
          <li>
            <span className="how-index">3</span>
            <h3>Remain employable</h3>
            <p>Reach 15 Influence to win. Take Collective Stress to 100 and you’re out; the track resets and everyone left loses 2 Influence.</p>
          </li>
        </ol>
      </section>

      <section className="mode-section" aria-labelledby="play-heading">
        <div className="section-heading">
          <p className="section-number">02 / Choose your reporting structure</p>
          <h2 id="play-heading">How would you like to suffer?</h2>
        </div>
        <div className="mode-grid">
          {MODES.map((mode) => (
            <article className={`mode-card mode-${mode.key}`} key={mode.key}>
              <p className="mode-eyebrow">{mode.eyebrow}</p>
              <h3>{mode.title}</h3>
              <p>{mode.copy}</p>
              <button className="btn btn-primary mode-action" onClick={actions[mode.key]}>
                {mode.action}<span aria-hidden="true"> →</span>
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
