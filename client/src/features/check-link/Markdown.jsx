// Tiny, dependency-free Markdown renderer for Orbo's chat replies.
// Handles the subset Claude produces: headings, bold/italic, inline code, bullet &
// numbered lists, blockquotes, and paragraphs. Renders to React (no dangerouslySetInnerHTML,
// so it's XSS-safe). Not a full CommonMark parser — just what the chat needs.

// Inline: **bold**, *italic*, `code`. Returns an array of React nodes.
function renderInline(text) {
  const nodes = [];
  let i = 0, key = 0;
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let m, last = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] != null) nodes.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3] != null) nodes.push(<em key={key++}>{m[3]}</em>);
    else if (m[4] != null) nodes.push(
      <code key={key++} style={{ background: "var(--canvas)", padding: "1px 5px", borderRadius: 5,
        fontSize: "0.88em", fontFamily: "ui-monospace, monospace" }}>{m[4]}</code>
    );
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function Markdown({ text = "" }) {
  const lines = String(text).replace(/\r/g, "").split("\n");
  const blocks = [];
  let list = null; // { ordered, items: [] }

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i} style={{ margin: "2px 0" }}>{renderInline(it)}</li>);
    blocks.push(list.ordered
      ? <ol key={blocks.length} style={{ margin: "6px 0", paddingLeft: 22 }}>{items}</ol>
      : <ul key={blocks.length} style={{ margin: "6px 0", paddingLeft: 22 }}>{items}</ul>);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushList(); continue; }

    // headings ## / ### → bold line (kept small; it's a chat bubble, not a doc)
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushList();
      blocks.push(<div key={blocks.length} style={{ fontWeight: 800, margin: "8px 0 2px", fontSize: "1.02em" }}>{renderInline(h[2])}</div>);
      continue;
    }
    // blockquote >
    if (line.startsWith(">")) {
      flushList();
      blocks.push(<blockquote key={blocks.length} style={{ borderLeft: "3px solid var(--border)",
        margin: "6px 0", padding: "2px 0 2px 10px", color: "var(--text-dim)" }}>{renderInline(line.replace(/^>\s?/, ""))}</blockquote>);
      continue;
    }
    // bullet: -, *, •
    const b = line.match(/^\s*[-*•]\s+(.*)$/);
    if (b) { if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; } list.items.push(b[1]); continue; }
    // numbered: 1.
    const n = line.match(/^\s*\d+\.\s+(.*)$/);
    if (n) { if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; } list.items.push(n[1]); continue; }
    // horizontal rule
    if (/^---+$/.test(line)) { flushList(); blocks.push(<hr key={blocks.length} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "8px 0" }} />); continue; }
    // paragraph
    flushList();
    blocks.push(<p key={blocks.length} style={{ margin: "4px 0", lineHeight: 1.5 }}>{renderInline(line)}</p>);
  }
  flushList();
  return <>{blocks}</>;
}
