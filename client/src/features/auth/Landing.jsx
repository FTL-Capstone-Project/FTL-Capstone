import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck, Building2, ScatterChart, Zap, Link2, BarChart3,
  Twitter, Linkedin, Github, ArrowRight, Download, Send,
  Mail, Globe, Users, AlertTriangle,
} from "lucide-react";
// Auth entry points: "Login" → sign-in; "Get Started" → the account-type chooser
// (personal / organizational / analyst), which then routes to the right auth screen.
import OrbisLogo from "../../components/OrbisLogo.jsx";
import OrboAvatar from "../../components/OrboAvatar.jsx";

// ── feature: landing · owner: David ──
// Public marketing page at "/". Product = "Orbis"; Orbo is the assistant/bot.
// No emojis (lucide icons only), no em-dashes. Colors come from theme tokens
// (var(--...)), never hard-coded hex.
//
// LIGHT MODE = fully light. The logo is a DARK wordmark, so every surface that holds
// it (nav, footer) is light and it sits bare with no background chip. Blue is used as
// an ACCENT (buttons, the CTA band, chat-card highlights), never as a full-bleed
// background slab, so nothing "sticks out" and the page flows.
//
// MOTION (Apple-like, but restrained): the hero assembles in a short staged load, and
// sections glide in on scroll via one shared IntersectionObserver. All of it is gated
// behind prefers-reduced-motion in global.css and is VISIBLE BY DEFAULT, so the page is
// fully accessible and works even if the reveal script never runs.

const SECTION_MAX = 1200; // content column width (matches app shell feel)

// Reveal-on-scroll: attach `className="landing-reveal"` to anything that should glide in, then
// call useReveal() once at the page root. It watches every .landing-reveal and adds .is-visible
// as they enter the viewport (one observer for the whole page, so it stays cheap). Reduced-motion
// users just see everything already in place (the CSS keeps .landing-reveal fully visible).
const useReveal = () => {
  useEffect(() => {
    const nodes = document.querySelectorAll(".landing-reveal");
    if (!nodes.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target); // reveal once, then stop watching
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
}

// Shared button styles (all tuned for LIGHT surfaces). Defined up top because arrow
// consts are not hoisted, and the components below reference them.
const primaryBtnStyle = {
  background: "var(--primary)", color: "#fff", fontWeight: 700, padding: "10px 18px",
  borderRadius: 10, border: "none", cursor: "pointer",
};
const ghostBtnStyle = {
  background: "transparent", color: "var(--navy)", fontWeight: 700, padding: "10px 18px",
  borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer",
};
const outlineBtnStyle = {
  background: "transparent", color: "var(--navy)", fontWeight: 700, padding: "10px 16px",
  borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 8,
};

// Small pill label above a section heading ("SOLUTIONS", "DETECTION", ...)
const Eyebrow = ({ children }) => (
  <span style={{
    display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: 1,
    textTransform: "uppercase", color: "var(--primary)", padding: "5px 12px",
    borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)",
  }}>{children}</span>
);

// ── top navigation (light bar; dark logo sits bare, no chip) ──
const Nav = () => {
  const links = ["Features", "Solutions", "About"];
  return (
    <nav style={{
      background: "color-mix(in srgb, var(--surface) 82%, transparent)",
      backdropFilter: "saturate(180%) blur(12px)", WebkitBackdropFilter: "saturate(180%) blur(12px)",
      borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 10,
    }}>
      <div style={{
        maxWidth: SECTION_MAX, margin: "0 auto", padding: "14px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24,
      }}>
        <OrbisLogo height={30} />
        <div className="landing-navlinks" style={{ display: "flex", gap: 32 }}>
          {links.map((l) => (
            <a key={l} href={`#${l.toLowerCase()}`} style={{ color: "var(--text-dim)", fontWeight: 600 }}>{l}</a>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {/* → /extension how-to-install page; swaps to the Chrome Web Store link once listed. */}
          <Link to="/extension" style={outlineBtnStyle}><Download size={16} /> Download Extension</Link>
          <Link to="/signin?type=personal" style={ghostBtnStyle}>Login</Link>
          <Link to="/get-started" style={primaryBtnStyle}>Get Started</Link>
        </div>
      </div>
    </nav>
  );
};

// A compact preview of the Ask Orbo chat, fronted by the mascot. Illustrative of the
// real feature (paste a link, Orbo gives a plain-English safety verdict). The `landing-scanline`
// runs a one-time "scanning" sweep on load, so the card demonstrates what Orbis does at a glance.
const OrboChatCard = () => (
  <div className="landing-float landing-scanline" style={{
    position: "relative", background: "var(--surface)", borderRadius: 16, boxShadow: "var(--shadow)",
    overflow: "hidden", border: "1px solid var(--border)",
  }}>
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "16px 20px",
      borderBottom: "1px solid var(--border)",
    }}>
      <OrboAvatar pose="wave" size={40} />
      <div>
        <div style={{ fontWeight: 700, color: "var(--navy)" }}>Ask Orbo</div>
        <div style={{ fontSize: 13, color: "var(--safe)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--safe)" }} /> Online
        </div>
      </div>
    </div>

    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, background: "var(--canvas)" }}>
      {/* user bubble (right) */}
      <div style={{ alignSelf: "flex-end", maxWidth: "80%", background: "var(--primary)", color: "#fff",
        padding: "10px 14px", borderRadius: "14px 14px 4px 14px", fontSize: 14 }}>
        Is this link safe to open?
      </div>
      {/* Orbo reply (left) */}
      <div style={{ alignSelf: "flex-start", maxWidth: "85%", background: "var(--surface)", color: "var(--text)",
        padding: "10px 14px", borderRadius: "14px 14px 14px 4px", fontSize: 14, border: "1px solid var(--border)" }}>
        Good news, that link looks safe. I checked it in a sandbox and found no signs of a scam.
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, color: "var(--safe)", fontWeight: 700, fontSize: 13 }}>
          <ShieldCheck size={15} /> Safe
        </div>
      </div>
    </div>

    {/* input row (decorative) */}
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
      <span style={{ flex: 1, color: "var(--text-dim)", fontSize: 14 }}>Paste a link or email address...</span>
      <span style={{ width: 34, height: 34, borderRadius: 8, background: "var(--primary)", display: "grid", placeItems: "center" }}>
        <Send size={16} color="#fff" />
      </span>
    </div>
  </div>
);

// ── hero (light, with a soft blue glow for depth; staged load-in) ──
const Hero = () => (
  <header style={{
    background: "radial-gradient(1100px 480px at 78% 15%, rgba(15,98,254,0.10), transparent 60%), var(--canvas)",
  }}>
    <div className="landing-hero" style={{
      maxWidth: SECTION_MAX, margin: "0 auto", padding: "88px 24px",
      display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 48, alignItems: "center",
    }}>
      <div>
        <div className="landing-load landing-load-1"><Eyebrow>AI-Powered Phishing Defense</Eyebrow></div>

        <h1 className="landing-load landing-load-1" style={{ fontSize: "clamp(38px, 6vw, 62px)", lineHeight: 1.03, fontWeight: 800, letterSpacing: -1.5, color: "var(--navy)", margin: "24px 0 0" }}>
          Stop phishing<br />before it starts.
        </h1>
        <p className="landing-load landing-load-2" style={{ fontSize: 19, color: "var(--text-dim)", margin: "24px 0 32px", maxWidth: 520, lineHeight: 1.6 }}>
          Orbis is the personal security analyst for everyone who doesn't have one. Paste a link or forward an email, and get a plain-English safety verdict in seconds, so you never have to click and hope.
        </p>

        <div className="landing-load landing-load-3" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Link to="/get-started" style={{ ...primaryBtnStyle, padding: "14px 30px", fontSize: 16 }}>Get Started</Link>
          <Link to="/signin?type=personal" style={{ ...ghostBtnStyle, padding: "14px 30px", fontSize: 16 }}>Login</Link>
          <Link to="/extension" style={{ ...outlineBtnStyle, padding: "14px 24px", fontSize: 16 }}><Download size={18} /> Download Extension</Link>
        </div>
      </div>

      {/* Orbo chat card: represents the real "Ask Orbo" chat feature. */}
      <div className="landing-load landing-load-4"><OrboChatCard /></div>
    </div>
  </header>
);

// ── About: why Orbis exists + the scale of the problem (real, cited stats) ──
// Copy is grounded in our own problem statement (planning/user_stories.md): the people most
// targeted by phishing have the least protection. Stats are attributed inline so they're honest.
const STATS = [
  { icon: Mail, value: "3.4 billion", label: "phishing emails are sent every single day", source: "Industry estimate" },
  { icon: AlertTriangle, value: "~90%", label: "of cyberattacks start with a phishing email", source: "Multiple industry reports" },
  { icon: Users, value: "300,000+", label: "phishing complaints filed with the FBI in a single year", source: "FBI IC3, 2022" },
  { icon: Globe, value: "1.4 million", label: "brand-new phishing sites appear every month", source: "Webroot" },
];

const About = () => (
  <section id="about" className="landing-anchor" style={{ background: "var(--canvas)", padding: "96px 24px" }}>
    <div style={{ maxWidth: SECTION_MAX, margin: "0 auto" }}>
      {/* The inspiration story */}
      <div className="landing-reveal" style={{ maxWidth: 760, margin: "0 auto 64px", textAlign: "center" }}>
        <Eyebrow>About Orbis</Eyebrow>
        <h2 style={{ fontSize: "clamp(30px, 4.5vw, 44px)", fontWeight: 800, color: "var(--navy)", letterSpacing: -1, margin: "20px 0 24px", lineHeight: 1.1 }}>
          The people who need protection most have the least of it.
        </h2>
        <p style={{ fontSize: 19, color: "var(--text-dim)", lineHeight: 1.7 }}>
          A suspicious link is a moment of both risk and uncertainty. If you have a security team, you can
          report it and wait. If you don't, your only options are to click and hope, or ignore it and maybe
          miss something real. Students, retirees, and small companies are targeted precisely because they
          have looser defenses and no expert to ask.
        </p>
        <p style={{ fontSize: 19, color: "var(--text-dim)", lineHeight: 1.7, marginTop: 18 }}>
          We built Orbis to be that expert, for anyone. It reads the signals a scammer hopes you'll miss and
          explains, in plain language, whether something is safe, so the answer takes seconds instead of a
          gamble.
        </p>
      </div>

      {/* The scale of the problem, in numbers */}
      <div className="landing-grid-4 landing-reveal" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
        {STATS.map(({ icon: Icon, value, label, source }) => (
          <div key={value} className="landing-lift" style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16,
            padding: 28, boxShadow: "var(--shadow)", display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: "rgba(15,98,254,0.1)",
              display: "grid", placeItems: "center",
            }}>
              <Icon size={20} color="var(--primary)" />
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, color: "var(--navy)", letterSpacing: -1, marginTop: 4 }}>{value}</div>
            <div style={{ color: "var(--text)", lineHeight: 1.5 }}>{label}</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: "auto", paddingTop: 8 }}>Source: {source}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ── "Built for every security role": 3 cards (white section) ──
const Roles = () => {
  const cards = [
    { icon: ShieldCheck, title: "For Yourself", body: "Vet a suspicious link, email, or webpage for yourself, even with no IT department or security team to ask.", cta: "Protect Myself" },
    { icon: Building2, title: "For Your Organization", body: "Check links in seconds without derailing your work, and escalate anything unsure to your security team.", cta: "Secure My Team" },
    { icon: ScatterChart, title: "For Analysts", body: "A lightweight triage workspace that auto-scores reports, groups related attacks, and answers questions in plain language.", cta: "Start Analyzing" },
  ];
  return (
    <section id="solutions" className="landing-anchor" style={{ background: "var(--surface)", padding: "80px 24px" }}>
      <div style={{ maxWidth: SECTION_MAX, margin: "0 auto" }}>
        <div className="landing-reveal" style={{ textAlign: "center", marginBottom: 56 }}>
          <Eyebrow>Solutions</Eyebrow>
          <h2 style={{ fontSize: 42, fontWeight: 800, color: "var(--navy)", letterSpacing: -1, marginTop: 20 }}>
            Built for every security role
          </h2>
        </div>
        <div className="landing-grid-3 landing-reveal" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {cards.map(({ icon: Icon, title, body, cta }) => (
            <div key={title} className="landing-lift" style={{
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16,
              padding: 32, boxShadow: "var(--shadow)",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: "rgba(15,98,254,0.1)",
                display: "grid", placeItems: "center", marginBottom: 24,
              }}>
                <Icon size={22} color="var(--primary)" />
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", marginBottom: 12 }}>{title}</h3>
              <p style={{ color: "var(--text-dim)", marginBottom: 24, lineHeight: 1.6 }}>{body}</p>
              <Link to="/get-started" style={{ fontWeight: 700, color: "var(--primary)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {cta} <ArrowRight size={16} />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ── 3 alternating feature sections (canvas section) ──
const Features = () => {
  const features = [
    { eyebrow: "Detection", icon: Zap, title: "Real-time phishing detection",
      body: "Orbis detonates a link in an isolated sandbox and reads every signal, from header metadata to where the link truly lands, then scores it 1 to 100 so you never open it yourself." },
    { eyebrow: "Forwarding", icon: Mail, title: "Just forward the email",
      body: "Not sure about a message? Forward the whole thing to Orbis. It analyzes the sender, the wording, and every link inside, then sends back one clear verdict." },
    { eyebrow: "Intelligence", icon: BarChart3, title: "Analyst intelligence dashboard",
      body: "For security teams: reports arrive already scored, duplicate attacks group into one campaign, and you can ask about your threat history in plain language and see it visualized." },
  ];
  return (
    <section id="features" className="landing-anchor" style={{ background: "var(--canvas)", padding: "40px 24px" }}>
      <div style={{ maxWidth: SECTION_MAX, margin: "0 auto", display: "flex", flexDirection: "column", gap: 96, padding: "60px 0" }}>
        {features.map((f, i) => (
          <div key={f.title} className="landing-feature landing-reveal" style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center",
          }}>
            <div style={{ order: i % 2 === 1 ? 2 : 1 }}>
              <Eyebrow>{f.eyebrow}</Eyebrow>
              <h2 style={{ fontSize: 40, fontWeight: 800, color: "var(--navy)", letterSpacing: -1, margin: "20px 0 20px" }}>{f.title}</h2>
              <p style={{ fontSize: 18, color: "var(--text-dim)", lineHeight: 1.6, maxWidth: 520 }}>{f.body}</p>
            </div>
            {/* image placeholder: soft blue-tinted panel with the feature icon (real screenshots drop in later) */}
            <div className="landing-lift" style={{
              order: i % 2 === 1 ? 1 : 2, aspectRatio: "16 / 11", borderRadius: 16,
              background: "linear-gradient(135deg, rgba(15,98,254,0.08), rgba(33,199,230,0.06))",
              border: "1px solid var(--border)",
              display: "grid", placeItems: "center", boxShadow: "var(--shadow)",
            }}>
              <f.icon size={56} color="var(--primary)" opacity={0.5} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

// ── "Get protected in minutes": 3 steps (white section) ──
const Process = () => {
  const steps = [
    { n: 1, title: "Submit", body: "Paste a link, forward an email, or right-click with the extension." },
    { n: 2, title: "Detect", body: "Orbo detonates it safely and weighs every threat signal automatically." },
    { n: 3, title: "Decide", body: "Get a plain-English verdict and a 1 to 100 safety score in seconds." },
  ];
  return (
    <section style={{ background: "var(--surface)", padding: "80px 24px" }}>
      <div style={{ maxWidth: SECTION_MAX, margin: "0 auto" }}>
        <div className="landing-reveal" style={{ textAlign: "center", marginBottom: 56 }}>
          <Eyebrow>Process</Eyebrow>
          <h2 style={{ fontSize: 42, fontWeight: 800, color: "var(--navy)", letterSpacing: -1, marginTop: 20 }}>
            Get protected in minutes
          </h2>
        </div>
        <div className="landing-grid-3 landing-reveal" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 40, textAlign: "center" }}>
          {steps.map((s) => (
            <div key={s.n}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", background: "var(--primary)", color: "#fff",
                display: "grid", placeItems: "center", margin: "0 auto 24px", fontSize: 22, fontWeight: 800,
                boxShadow: "0 0 0 8px rgba(15,98,254,0.1)",
              }}>{s.n}</div>
              <h3 style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", marginBottom: 12 }}>{s.title}</h3>
              <p style={{ color: "var(--text-dim)", lineHeight: 1.6, maxWidth: 280, margin: "0 auto" }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ── final CTA (blue gradient: the one deliberate accent band) ──
const FinalCta = () => (
  <section style={{ background: "linear-gradient(120deg, var(--primary), var(--primary-dark))", color: "#fff", padding: "88px 24px", textAlign: "center" }}>
    <div className="landing-reveal" style={{ maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1.5, marginBottom: 16 }}>Ready to outsmart phishing?</h2>
      <p style={{ fontSize: 19, color: "rgba(255,255,255,0.85)", marginBottom: 32 }}>
        Check any link or email for scams in seconds, with Orbo by your side.
      </p>
      <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
        <Link to="/get-started" style={{
          background: "#fff", color: "var(--primary)", fontWeight: 700, padding: "14px 30px",
          borderRadius: 10, fontSize: 16,
        }}>Get Started</Link>
        <Link to="/extension" style={{
          background: "transparent", color: "#fff", fontWeight: 700, padding: "14px 30px",
          borderRadius: 10, fontSize: 16, border: "1px solid rgba(255,255,255,0.6)",
          display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none",
        }}><Download size={18} /> Download Extension</Link>
      </div>
    </div>
  </section>
);

// ── footer (light: dark logo sits bare, page stays in the light family) ──
const Footer = () => {
  const cols = [
    { head: "Product", items: ["Features", "Security", "Intelligence", "API"] },
    { head: "Company", items: ["About", "Blog", "Careers", "Contact"] },
    { head: "Legal", items: ["Privacy", "Terms", "Cookie Policy", "GDPR"] },
  ];
  const socials = [Twitter, Linkedin, Github];
  return (
    <footer style={{ background: "var(--canvas)", borderTop: "1px solid var(--border)", color: "var(--text-dim)", padding: "64px 24px 32px" }}>
      <div style={{ maxWidth: SECTION_MAX, margin: "0 auto" }}>
        <div className="landing-footer" style={{ display: "grid", gridTemplateColumns: "1.6fr repeat(3, 1fr)", gap: 40 }}>
          <div>
            <OrbisLogo height={30} />
            <p style={{ margin: "16px 0 24px", maxWidth: 300, lineHeight: 1.6 }}>
              AI-powered phishing defense that checks any link or email for scams, and explains why in plain English.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              {socials.map((Icon, i) => (
                <span key={i} style={{
                  width: 36, height: 36, borderRadius: "50%", background: "var(--surface)",
                  border: "1px solid var(--border)", display: "grid", placeItems: "center",
                }}>
                  <Icon size={16} color="var(--navy)" />
                </span>
              ))}
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.head}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--navy)", marginBottom: 16 }}>{c.head}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {c.items.map((i) => (
                  <a key={i} href={i === "About" ? "#about" : "#"} style={{ color: "var(--text-dim)" }}>{i}</a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ height: 1, background: "var(--border)", margin: "40px 0 24px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontSize: 14, color: "var(--text-dim)" }}>
          <span>© 2026 Orbis Security. All rights reserved.</span>
          <span style={{ display: "flex", gap: 24 }}><a href="#" style={{ color: "var(--text-dim)" }}>Status</a><a href="#" style={{ color: "var(--text-dim)" }}>Security</a></span>
        </div>
      </div>
    </footer>
  );
};

const Landing = () => {
  useReveal(); // wire up the scroll-reveal observer for the whole page
  return (
    <div style={{ background: "var(--surface)", color: "var(--text)" }}>
      <Nav />
      <Hero />
      <About />
      <Roles />
      <Features />
      <Process />
      <FinalCta />
      <Footer />
    </div>
  );
}

export default Landing;
