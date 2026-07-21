import { Link } from "react-router-dom";
import {
  ShieldCheck, Building2, ScatterChart, Zap, Link2, BarChart3,
  Twitter, Linkedin, Github, ArrowRight, Download, Send,
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
// background slab, so nothing "sticks out" and the page flows. The navy/dark hero is
// deferred to the real dark-mode theme (coming from Figma).

const SECTION_MAX = 1200; // content column width (matches app shell feel)

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
  const links = ["Features", "Solutions"];
  return (
    <nav style={{
      background: "var(--surface)", borderBottom: "1px solid var(--border)",
      position: "sticky", top: 0, zIndex: 10,
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
// real feature (paste a link, Orbo gives a plain-English safety verdict).
const OrboChatCard = () => (
  <div style={{
    background: "var(--surface)", borderRadius: 16, boxShadow: "var(--shadow)",
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

// ── hero (light, with a soft blue glow for depth) ──
const Hero = () => (
  <header style={{
    background: "radial-gradient(1100px 480px at 78% 15%, rgba(15,98,254,0.10), transparent 60%), var(--canvas)",
  }}>
    <div className="landing-hero" style={{
      maxWidth: SECTION_MAX, margin: "0 auto", padding: "88px 24px",
      display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 48, alignItems: "center",
    }}>
      <div>
        <Eyebrow>AI-Powered Phishing Defense</Eyebrow>

        <h1 style={{ fontSize: 60, lineHeight: 1.05, fontWeight: 800, letterSpacing: -1.5, color: "var(--navy)", margin: "24px 0 0" }}>
          Stop Phishing Attacks Before They Strike
        </h1>
        <p style={{ fontSize: 19, color: "var(--text-dim)", margin: "24px 0 32px", maxWidth: 520 }}>
          Orbis detects, checks, and explains phishing threats across your inbox, in plain English and in seconds.
        </p>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Link to="/get-started" style={{ ...primaryBtnStyle, padding: "14px 30px", fontSize: 16 }}>Get Started</Link>
          <Link to="/signin?type=personal" style={{ ...ghostBtnStyle, padding: "14px 30px", fontSize: 16 }}>Login</Link>
          <Link to="/extension" style={{ ...outlineBtnStyle, padding: "14px 24px", fontSize: 16 }}><Download size={18} /> Download Extension</Link>
        </div>
      </div>

      {/* Orbo chat card: represents the real "Ask Orbo" chat feature. */}
      <OrboChatCard />
    </div>
  </header>
);

// ── "Built for every security role": 3 cards (white section) ──
const Roles = () => {
  const cards = [
    { icon: ShieldCheck, title: "For Yourself", body: "Protect your personal identity and sensitive emails from sophisticated phishing attempts.", cta: "Protect Myself" },
    { icon: Building2, title: "For Your Organization", body: "Train your workforce with AI simulations and monitor threats across thousands of mailboxes.", cta: "Secure My Team" },
    { icon: ScatterChart, title: "For Analysts", body: "Deep-dive into threat intelligence with advanced simulation tools and custom API access.", cta: "Start Analyzing" },
  ];
  return (
    <section id="solutions" style={{ background: "var(--surface)", padding: "80px 24px" }}>
      <div style={{ maxWidth: SECTION_MAX, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <Eyebrow>Solutions</Eyebrow>
          <h2 style={{ fontSize: 42, fontWeight: 800, color: "var(--navy)", letterSpacing: -1, marginTop: 20 }}>
            Built for every security role
          </h2>
        </div>
        <div className="landing-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {cards.map(({ icon: Icon, title, body, cta }) => (
            <div key={title} style={{
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
    { eyebrow: "Detection", icon: Zap, title: "Real-Time Phishing Detection",
      body: "Our AI engines scan every incoming signal, from header metadata to embedded link behavior, neutralizing threats in milliseconds." },
    { eyebrow: "Simulation", icon: Link2, title: "Phishing Simulation Campaigns",
      body: "Create hyper-realistic simulations to train your team. Identify vulnerabilities before attackers do with automated reporting." },
    { eyebrow: "Intelligence", icon: BarChart3, title: "Analyst Intelligence Dashboard",
      body: "Get a bird's eye view of your security posture. Track campaign metrics, threat trends, and response times in one place." },
  ];
  return (
    <section id="features" style={{ background: "var(--canvas)", padding: "40px 24px" }}>
      <div style={{ maxWidth: SECTION_MAX, margin: "0 auto", display: "flex", flexDirection: "column", gap: 96, padding: "60px 0" }}>
        {features.map((f, i) => (
          <div key={f.title} className="landing-feature" style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center",
          }}>
            <div style={{ order: i % 2 === 1 ? 2 : 1 }}>
              <Eyebrow>{f.eyebrow}</Eyebrow>
              <h2 style={{ fontSize: 40, fontWeight: 800, color: "var(--navy)", letterSpacing: -1, margin: "20px 0 20px" }}>{f.title}</h2>
              <p style={{ fontSize: 18, color: "var(--text-dim)", lineHeight: 1.6, maxWidth: 520 }}>{f.body}</p>
            </div>
            {/* image placeholder: soft blue-tinted panel with the feature icon (real screenshots drop in later) */}
            <div style={{
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
    { n: 1, title: "Connect", body: "Integrate with your email and infrastructure in one click." },
    { n: 2, title: "Detect", body: "Orbo's AI scans every threat signal automatically." },
    { n: 3, title: "Respond", body: "Receive instant alerts and actionable intelligence." },
  ];
  return (
    <section style={{ background: "var(--surface)", padding: "80px 24px" }}>
      <div style={{ maxWidth: SECTION_MAX, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <Eyebrow>Process</Eyebrow>
          <h2 style={{ fontSize: 42, fontWeight: 800, color: "var(--navy)", letterSpacing: -1, marginTop: 20 }}>
            Get protected in minutes
          </h2>
        </div>
        <div className="landing-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 40, textAlign: "center" }}>
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
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
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
                  <a key={i} href="#" style={{ color: "var(--text-dim)" }}>{i}</a>
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

const Landing = () => (
  <div style={{ background: "var(--surface)", color: "var(--text)" }}>
    <Nav />
    <Hero />
    <Roles />
    <Features />
    <Process />
    <FinalCta />
    <Footer />
  </div>
);

export default Landing;
