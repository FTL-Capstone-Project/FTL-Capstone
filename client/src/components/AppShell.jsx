import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { UserButton, OrganizationSwitcher } from "@clerk/clerk-react";
import { Plus, Search, LayoutGrid, FileText, Sparkles, Settings, Inbox, Orbit, PanelLeftClose, PanelLeft, Clock, X } from "lucide-react";
import { NotificationsProvider } from "../context/NotificationsContext.jsx";
import NotificationBell from "./NotificationBell.jsx";
import OrbisLogo from "./OrbisLogo.jsx";
import { NAV_BY_ROLE } from "../config/constants.js";
import { useOrbisRole } from "../lib/useOrbisRole.js";
import { listConversations, searchConversations, subscribe, deleteConversation } from "../lib/conversations.js";

// NOTE: SHARED COMPONENT (app frame). Merged: David's wireframe styling + real Orbis logo +
// lucide icons, layered with Michael's role-aware nav (useOrbisRole + NAV_BY_ROLE), collapsible
// sidebar, and Clerk OrganizationSwitcher. Nav is role-aware: individuals/members lead with Home
// (chat); analysts lead with Dashboard / Ask Orbo.

// Map a nav path → its lucide icon (we render these, not the emoji in NAV_BY_ROLE data).
const NAV_ICON = {
  "/ask-orbo": Sparkles,
  "/dashboard": LayoutGrid,
  "/reports": FileText,
};

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [recents, setRecents] = useState(() => listConversations());
  const { role, orgName } = useOrbisRole();
  const navigate = useNavigate();
  const nav = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.individual;
  const inOrg = role === "member" || role === "analyst";

  // Keep Recents live: re-read when the conversation store changes (chat saved/deleted).
  useEffect(() => subscribe(() => setRecents(listConversations())), []);
  const shownRecents = search.trim() ? searchConversations(search) : recents;

  return (
    <NotificationsProvider>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {/* ── Sidebar ── */}
        <aside style={{ width: collapsed ? 68 : 250, background: "var(--surface)",
          borderRight: "1px solid var(--border)", padding: collapsed ? "18px 12px" : 18,
          display: "flex", flexDirection: "column", gap: 14, flexShrink: 0, transition: "width .15s ease" }}>

          {/* Logo → Home (the Ask-Orbo chat). A separate chevron collapses the sidebar. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", padding: "2px 0 6px" }}>
            <button onClick={() => navigate("/ask-orbo")} aria-label="Go to Orbo home" title="Home"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
              {collapsed ? <Orbit size={26} color="var(--navy)" /> : <OrbisLogo height={32} />}
            </button>
            {!collapsed && (
              <button onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" title="Collapse"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "grid", placeItems: "center" }}>
                <PanelLeftClose size={18} />
              </button>
            )}
          </div>
          {collapsed && (
            <button onClick={() => setCollapsed(false)} aria-label="Expand sidebar" title="Expand"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "grid", placeItems: "center" }}>
              <PanelLeft size={18} />
            </button>
          )}

          {inOrg && !collapsed && (
            <div style={{ margin: "2px 0" }}>
              <OrganizationSwitcher hidePersonal={false} />
            </div>
          )}

          <button onClick={() => navigate("/ask-orbo?new=1")} style={{ display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8, background: "var(--primary)", color: "#fff", border: "none",
            borderRadius: 12, padding: collapsed ? "11px 0" : "11px 14px", fontWeight: 700, cursor: "pointer", fontSize: "0.95em" }}>
            <Plus size={18} /> {!collapsed && "New check"}
          </button>

          {!collapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border)",
              borderRadius: 10, padding: "8px 12px", color: "var(--text-dim)" }}>
              <Search size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your past chats…"
                style={{ border: "none", outline: "none", background: "transparent", fontSize: "0.85em", width: "100%" }} />
            </div>
          )}

          {/* Role-aware nav */}
          <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {nav.map((item) => (
              <NavItem key={item.to} item={item} collapsed={collapsed} />
            ))}
          </nav>

          {/* Recents — real past chat threads (localStorage). Click to reopen; hover to delete. */}
          {!collapsed && (
            <div style={{ marginTop: 4, overflowY: "auto", flex: 1, minHeight: 0 }}>
              <div style={{ fontSize: "0.68em", fontWeight: 700, color: "var(--text-dim)",
                textTransform: "uppercase", letterSpacing: "0.06em", padding: "0 8px 6px" }}>Recents</div>
              {shownRecents.length === 0 ? (
                <div style={{ padding: "6px 8px", color: "var(--text-dim)", fontSize: "0.8em", fontStyle: "italic" }}>
                  {search.trim() ? "No matching chats" : "Your past chats show up here"}
                </div>
              ) : (
                shownRecents.map((c) => (
                  <RecentItem key={c.id} convo={c}
                    onOpen={() => navigate(`/ask-orbo?c=${c.id}`)}
                    onDelete={() => { deleteConversation(c.id); }} />
                ))
              )}
            </div>
          )}

          <NavLink to="/settings" style={navLinkStyle(collapsed)}>
            <Settings size={16} /> {!collapsed && "Settings"}
          </NavLink>
        </aside>

        {/* ── Main column ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header style={{ height: 56, borderBottom: "1px solid var(--border)", background: "var(--surface)",
            display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16, padding: "0 22px", flexShrink: 0 }}>
            {orgName && <span style={{ marginRight: "auto", color: "var(--text-dim)", fontSize: "0.9em" }}>{orgName}</span>}
            <button title="Inbox" aria-label="Inbox"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "grid", placeItems: "center" }}>
              <Inbox size={20} />
            </button>
            <NotificationBell />
            <UserButton afterSignOutUrl="/" />
          </header>
          <main style={{ flex: 1, minHeight: 0, background: "var(--canvas)" }}><Outlet /></main>
        </div>
      </div>
    </NotificationsProvider>
  );
}

function navLinkStyle(collapsed) {
  return ({ isActive }) => ({
    marginTop: "auto", display: "flex", alignItems: "center", gap: 8,
    padding: collapsed ? "8px 0" : "8px 12px", justifyContent: collapsed ? "center" : "flex-start",
    borderRadius: 10, textDecoration: "none", fontSize: "0.9em",
    color: isActive ? "var(--primary)" : "var(--text-dim)",
  });
}

// One past-chat row: clock icon + auto-title, click to reopen, hover reveals a delete ✕.
function RecentItem({ convo, onOpen, onDelete }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onOpen} title={convo.title}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8,
        cursor: "pointer", color: "var(--text-dim)", fontSize: "0.85em",
        background: hover ? "var(--canvas)" : "transparent" }}>
      <Clock size={14} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{convo.title}</span>
      {hover && (
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Delete chat"
          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-dim)", display: "grid", placeItems: "center", padding: 0 }}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function NavItem({ item, collapsed }) {
  const Icon = NAV_ICON[item.to] ?? Sparkles;
  return (
    <NavLink to={item.to} title={item.label} style={({ isActive }) => ({
      display: "flex", alignItems: "center", gap: 10, padding: collapsed ? "8px 0" : "8px 12px",
      justifyContent: collapsed ? "center" : "flex-start", borderRadius: 10, textDecoration: "none",
      background: isActive ? "var(--canvas)" : "transparent",
      border: isActive ? "1px solid var(--border)" : "1px solid transparent",
    })}>
      {({ isActive }) => (
        <>
          <Icon size={18} style={{ flexShrink: 0, color: isActive ? "var(--primary)" : "var(--navy)" }} />
          {!collapsed && (
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.92em", color: isActive ? "var(--primary)" : "var(--navy)" }}>{item.label}</div>
              <div style={{ fontSize: "0.75em", color: "var(--text-dim)" }}>{item.sub}</div>
            </div>
          )}
        </>
      )}
    </NavLink>
  );
}
