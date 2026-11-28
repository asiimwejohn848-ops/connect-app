"use client";

import { useState } from "react";

const features = [
  {
    number: "01",
    icon: "✳",
    title: "Conversations, made simple",
    description:
      "A welcoming space for private conversations and group discussions, with a focus on keeping everyday communication accessible.",
    tag: "CORE EXPERIENCE",
  },
  {
    number: "02",
    icon: "◇",
    title: "A more personal voice",
    description:
      "Voice messages with creative enhancement options, giving people more ways to express themselves.",
    tag: "VOICE",
  },
  {
    number: "03",
    icon: "✧",
    title: "Messages worth unwrapping",
    description:
      "A VIP gift-message concept: send a special locked message that its recipient can request to open, with the sender in control.",
    tag: "VIP CHAT",
  },
  {
    number: "04",
    icon: "▧",
    title: "Create. Refine. Share.",
    description:
      "A built-in creative direction for editing photos, enhancing colour and texture, and preparing content to share.",
    tag: "CREATOR STUDIO",
  },
];

const highlights = [
  ["Free to get started", "The core CONNECT experience is intended to remain accessible."],
  ["Designed for real people", "Clear, approachable tools for the moments that matter."],
  ["A global outlook", "Starting in Uganda, with a vision to connect people everywhere."],
];

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main className="marketing-site">
      <div className="announcement">
        <span className="announcement-dot" />
        A new communication experience is taking shape
        <a href="#story">Discover the vision <span aria-hidden="true">↗</span></a>
      </div>

      <header className="marketing-header">
        <a className="marketing-brand" href="#" aria-label="CONNECT home">
          <span className="brand-symbol">C</span>
          <span>CONNECT<span className="brand-period">.</span><small>BY CIZZY TECHNOLOGIES</small></span>
        </a>
        <button
          className="mobile-menu-toggle"
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span /><span />
        </button>
        <nav className={menuOpen ? "marketing-nav is-open" : "marketing-nav"} aria-label="Main navigation">
          <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#story" onClick={() => setMenuOpen(false)}>Our story</a>
          <a href="#vip" onClick={() => setMenuOpen(false)}>VIP Chat</a>
          <a className="nav-cta" href="#updates" onClick={() => setMenuOpen(false)}>Stay in the loop <span>↗</span></a>
        </nav>
      </header>

      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow"><span /> INTRODUCING CONNECT</div>
          <h1>Closer is a<br />beautiful place<br /><em>to be.</em></h1>
          <p className="hero-description">
            The next chapter in how we connect. Thoughtfully imagined communication,
            expressive tools and more meaningful ways to stay in touch — from Uganda to the world.
          </p>
          <div className="hero-actions">
            <a className="button-primary" href="#features">Explore CONNECT <span>↗</span></a>
            <a className="button-text" href="#story">The idea behind it <span>↓</span></a>
          </div>
          <div className="hero-footnote"><span className="tiny-orbit">✳</span> A Cizzy Technologies product <span className="footnote-divider">/</span> Uganda first, worldwide next</div>
        </div>

        <div className="hero-art" aria-label="Decorative CONNECT product artwork">
          <div className="art-glow" />
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-orbit orbit-three" />
          <div className="art-star star-one">✦</div>
          <div className="art-star star-two">✧</div>
          <div className="art-star star-three">·</div>
          <div className="phone-frame">
            <div className="phone-top"><span>9:41</span><span>•••</span></div>
            <div className="phone-brand"><span className="phone-brand-icon">C</span><span>CONNECT<small>YOUR PEOPLE, YOUR SPACE</small></span><b>···</b></div>
            <div className="phone-greeting">Good to see you.</div>
            <div className="phone-subtitle">A little closer, every day.</div>
            <div className="phone-search">⌕ <span>Find a conversation</span></div>
            <div className="phone-section-title">YOUR CONNECTIONS <span>VIEW ALL</span></div>
            <div className="chat-row"><div className="avatar avatar-lilac">A</div><div className="chat-info"><b>Alex Morgan</b><span>That sounds wonderful ✨</span></div><time>09:32</time></div>
            <div className="chat-row"><div className="avatar avatar-rose">J</div><div className="chat-info"><b>Jamie Lee</b><span>Voice message · 0:18</span></div><time>08:54</time></div>
            <div className="chat-row"><div className="avatar avatar-gold">M</div><div className="chat-info"><b>My people</b><span>You: See you soon!</span></div><time>Yesterday</time></div>
            <div className="phone-bottom"><span className="active">◈<small>Chats</small></span><span>◇<small>Discover</small></span><span>◎<small>Profile</small></span></div>
          </div>
          <div className="floating-note note-top"><span>✧</span><div><b>Made for connection</b><small>Everyday moments, closer</small></div></div>
          <div className="floating-note note-bottom"><span className="note-wave">〰</span><div><b>Your voice, your way</b><small>Express more with voice</small></div></div>
          <div className="art-caption">A NEW WAY TO FEEL CONNECTED <span>— EST. 2026</span></div>
        </div>
      </section>

      <div className="marquee-band" aria-label="CONNECT values">
        <div>MEANINGFUL MOMENTS <span>✳</span> MORE WAYS TO EXPRESS <span>✳</span> CONNECTION WITHOUT BORDERS <span>✳</span> MADE TO BRING US CLOSER <span>✳</span></div>
      </div>

      <section className="intro-section" id="story">
        <div className="section-kicker">01 / THE THINKING</div>
        <div className="intro-grid">
          <h2>Technology should bring us <em>closer.</em></h2>
          <div className="intro-copy">
            <p>CONNECT is being created around a simple belief: communication should feel natural, expressive and accessible.</p>
            <p>We are bringing together the essentials of staying in touch with thoughtful ideas that make conversations feel a little more personal.</p>
            <a className="underlined-link" href="#features">See what we're imagining <span>↗</span></a>
          </div>
        </div>
        <div className="value-strip">
          {highlights.map(([title, description], index) => (
            <article className="value-item" key={title}>
              <span className="value-number">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="features-section" id="features">
        <div className="section-kicker">02 / THE EXPERIENCE</div>
        <div className="section-heading-row">
          <div><h2>More ways to<br /><em>connect.</em></h2></div>
          <p>One considered experience, with room for conversations, creativity and the little details that make communication yours.</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <div className="feature-card-top"><span>{feature.number}</span><span className="feature-icon">{feature.icon}</span></div>
              <div className="feature-card-bottom"><div className="feature-tag">{feature.tag}</div><h3>{feature.title}</h3><p>{feature.description}</p></div>
              <span className="feature-arrow">↗</span>
            </article>
          ))}
        </div>
        <p className="feature-disclaimer">These are planned product experiences. Availability and final functionality will be confirmed as CONNECT develops.</p>
      </section>

      <section className="vip-section" id="vip">
        <div className="vip-visual">
          <div className="vip-halo" />
          <div className="gift-card">
            <div className="gift-card-top"><span>CONNECT</span><span>PRIVATE MOMENT Nº 01</span></div>
            <div className="gift-lock">✧</div>
            <div className="gift-message">A little something<br /><em>just for you.</em></div>
            <div className="gift-card-bottom"><span>YOUR MESSAGE AWAITS</span><span>✳</span></div>
          </div>
        </div>
        <div className="vip-copy">
          <div className="section-kicker">03 / A SPECIAL TOUCH</div>
          <div className="vip-label"><span>✦</span> THE VIP EXPERIENCE</div>
          <h2>Some messages<br />deserve a <em>moment.</em></h2>
          <p>Imagine sending a message that arrives as a gift. The recipient requests access, and you decide when to reveal what is inside. A more thoughtful way to make a message feel special.</p>
          <a className="button-light" href="#updates">Discover the VIP vision <span>↗</span></a>
          <small>VIP Chat is a planned premium experience and is not yet available for purchase.</small>
        </div>
      </section>

      <section className="updates-section" id="updates">
        <div className="updates-decoration">C<span>.</span></div>
        <div className="section-kicker">04 / THE JOURNEY</div>
        <h2>Be here for<br />the <em>beginning.</em></h2>
        <p>CONNECT is taking shape. Follow the journey as we prepare to introduce a new communication experience, starting in Uganda.</p>
        <a className="button-primary" href="https://github.com/asiimwejohn848-ops/connect-app" target="_blank" rel="noreferrer">Follow development <span>↗</span></a>
        <div className="updates-note"><span className="status-dot" /> IN DEVELOPMENT <span className="note-separator">·</span> MORE TO COME</div>
      </section>

      <footer className="marketing-footer">
        <div className="footer-main">
          <a className="marketing-brand footer-brand" href="#"><span className="brand-symbol">C</span><span>CONNECT<span className="brand-period">.</span><small>BY CIZZY TECHNOLOGIES</small></span></a>
          <p>One world. Endless connections.</p>
          <a className="back-top" href="#">BACK TO TOP ↑</a>
        </div>
        <div className="footer-bottom"><span>© 2026 Cizzy Technologies. All rights reserved.</span><span>Designed with intention. Built for connection.</span><span>UGANDA <b>↗</b> THE WORLD</span></div>
      </footer>
    </main>
  );
}
