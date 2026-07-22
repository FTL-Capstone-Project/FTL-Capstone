import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { UserButton, OrganizationSwitcher } from "@clerk/clerk-react";
import { Plus, Search, LayoutGrid, FileText, Sparkles, Settings, Orbit, PanelLeftClose, PanelLeft, Clock, MoreHorizontal, Pencil, Pin, Trash2, BarChart3, Menu } from "lucide-react";
import { NotificationsProvider } from "../context/NotificationsContext.jsx";
import NotificationBell from "./NotificationBell.jsx";
import OrbisLogo from "./OrbisLogo.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { NAV_BY_ROLE } from "../config/constants.js";
import { useOrbisRole } from "../lib/useOrbisRole.js";
import { useMediaQuery, MOBILE_QUERY } from "../lib/useMediaQuery.js";
import { listConversations, searchConversations, subscribe, deleteConversation, renameConversation, togglePin, groupConversations } from "../lib/conversations.js";

// NOTE: SHARED COMPONENT (app frame). Merged: David's wireframe styling + real Orbis logo +
// lucide icons, layered with Michael's role-aware nav (useOrbisRole + NAV_BY_ROLE), collapsible
// sidebar, and Clerk OrganizationSwitcher. Nav is role-aware: individuals/members lead with Home
// (chat); analysts lead with Dashboard / Ask Orbo.

// Map a nav path → its lucide icon (we render these, not the emoji in NAV_BY_ROLE data).
const NAV_ICON = {
  "/ask-orbo": Sparkles,
  "/dashboard": LayoutGrid,
  "/reports": FileText,
  "/insights": BarChart3,
};

// Clerk components (OrganizationSwitcher, UserButton) render their own DOM and DON'T
// read our CSS variables, so in dark mode their default near-black text/surfaces blend
// into the dark sidebar. We hand Clerk our theme tokens via `variables` so it follows
// the active theme. Passing var(--...) means it re-themes automatically on toggle.
const clerkAppearance = {
  variables: {
    colorText: "var(--text)",
    colorTextSecondary: "var(--text-dim)",
    colorBackground: "var(--surface)",
    colorInputBackground: "var(--surface)",
    colorInputText: "var(--text)",
    colorPrimary: "var(--primary)",
    borderRadius: "10px",
  },
  elements: {
    // The switcher trigger sits on the sidebar; give it a visible border so it reads
    // in both themes instead of melting into the surface.
    organizationSwitcherTrigger: {
      color: "var(--text)",
      border: "1px solid var(--border)",
      padding: "6px 10px",
    },
  },
};

const AppShell = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [recents, setRecents] = useState(() => listConversations());
  const { role, orgName } = useOrbisRole();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const activeId = params.get("c"); // which chat is open right now → highlight it
  const nav = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.individual;
  const inOrg = role === "member" || role === "analyst";

  // ── Responsive frame ──
  // Desktop: the sidebar is docked (a flex column that can collapse to a rail).
  // Mobile (Gemini-style): the sidebar is hidden off-screen and slides in as an OVERLAY over a
  // dim backdrop when the header hamburger is tapped; the chat is full-width underneath. We track
  // the breakpoint in JS because inline styles can't hold @media rules.
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // On mobile, tapping a nav link / chat / New-check should navigate AND close the drawer, so the
  // user lands straight on the full-width content (exactly how Gemini's mobile menu behaves).
  const go = (to) => { navigate(to); if (isMobile) setDrawerOpen(false); };

  // Never leave the drawer "stuck open" when rotating to desktop width.
  useEffect(() => { if (!isMobile) setDrawerOpen(false); }, [isMobile]);

  // Keep Recents live: re-read when the conversation store changes (chat saved/deleted).
  useEffect(() => subscribe(() => setRecents(listConversations())), []);
  // While searching: a flat list of matches (no date headers). Otherwise: date-grouped.
  const searching = search.trim().length > 0;
  const searchResults = searching ? searchConversations(search) : [];
  const groups = searching ? [] : groupConversations(recents);

  // On mobile the sidebar is always shown "expanded" (never the icon-rail), since it's an overlay
  // drawer with room. The collapse rail is a desktop-only affordance.
  const railCollapsed = collapsed && !isMobile;

  // Sidebar box: docked flex column on desktop; fixed slide-in overlay on mobile.
  const asideStyle = isMobile
    ? {
        position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 50, width: 280,
        transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform .22s ease", boxShadow: drawerOpen ? "var(--shadow)" : "none",
        background: "var(--surface)", borderRight: "1px solid var(--border)", padding: 18,
        display: "flex", flexDirection: "column", gap: 14,
      }
    : {
        width: railCollapsed ? 68 : 250, background: "var(--surface)",
        borderRight: "1px solid var(--border)", padding: railCollapsed ? "18px 12px" : 18,
        display: "flex", flexDirection: "column", gap: 14, flexShrink: 0, transition: "width .15s ease",
      };

  return (
    <NotificationsProvider>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {/* Mobile backdrop — tap outside the drawer to close it. */}
        {isMobile && drawerOpen && (
          <div onClick={() => setDrawerOpen(false)} aria-hidden="true"
            style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(10,37,64,0.45)" }} />
        )}
        {/* ── Sidebar ── */}
        <aside style={asideStyle}>

          {/* Logo → Home (the Ask-Orbo chat). The chevron collapses the sidebar (desktop only;
              on mobile the drawer just closes via the backdrop / a nav tap). */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: railCollapsed ? "center" : "space-between", padding: "2px 0 6px" }}>
            <button onClick={() => go("/ask-orbo")} aria-label="Go to Orbo home" title="Home"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
              {railCollapsed ? <Orbit size={26} color="var(--navy)" /> : <OrbisLogo height={32} />}
            </button>
            {!railCollapsed && (
              <button onClick={() => isMobile ? setDrawerOpen(false) : setCollapsed(true)}
                aria-label={isMobile ? "Close menu" : "Collapse sidebar"} title={isMobile ? "Close" : "Collapse"}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "grid", placeItems: "center" }}>
                <PanelLeftClose size={18} />
              </button>
            )}
          </div>
          {railCollapsed && (
            <button onClick={() => setCollapsed(false)} aria-label="Expand sidebar" title="Expand"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "grid", placeItems: "center" }}>
              <PanelLeft size={18} />
            </button>
          )}

          {inOrg && !railCollapsed && (
            <div style={{ margin: "2px 0" }}>
              <OrganizationSwitcher hidePersonal={false} appearance={clerkAppearance} />
            </div>
          )}

          <button onClick={() => go("/ask-orbo?new=1")} style={{ display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8, background: "var(--primary)", color: "#fff", border: "none",
            borderRadius: 12, padding: railCollapsed ? "11px 0" : "11px 14px", fontWeight: 700, cursor: "pointer", fontSize: "0.95em" }}>
            <Plus size={18} /> {!railCollapsed && "New check"}
          </button>

          {!railCollapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border)",
              borderRadius: 10, padding: "8px 12px", color: "var(--text-dim)" }}>
              <Search size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your past chats…"
                // color:var(--text) so typed search text is visible in dark mode (else it
                // inherits the browser default near-black and disappears on the dark sidebar).
                style={{ border: "none", outline: "none", background: "transparent", fontSize: "0.85em", width: "100%", color: "var(--text)" }} />
            </div>
          )}

          {/* Role-aware nav */}
          <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {nav.map((item) => (
              <NavItem key={item.to} item={item} collapsed={railCollapsed} onNavigate={() => isMobile && setDrawerOpen(false)} />
            ))}
          </nav>

          {/* Recents — real past chat threads (localStorage). Click to reopen; ⋯ menu to
              rename / pin / delete. Grouped by date (Today/Yesterday/…), or a flat list of
              matches while searching. The open chat is highlighted. */}
          {!railCollapsed && (
            <div style={{ marginTop: 4, overflowY: "auto", flex: 1, minHeight: 0 }}>
              {searching ? (
                // Search mode: one flat list under a "Recents" header.
                <>
                  <div style={groupHeaderStyle}>Recents</div>
                  {searchResults.length === 0 ? (
                    <EmptyRecents label="No matching chats" />
                  ) : (
                    searchResults.map((c) => (
                      <RecentItem key={c.id} convo={c} active={c.id === activeId}
                        onOpen={() => go(`/ask-orbo?c=${c.id}`)}
                        onDelete={() => deleteConversation(c.id)} />
                    ))
                  )}
                </>
              ) : groups.length === 0 ? (
                <EmptyRecents label="Your past chats show up here" />
              ) : (
                // Normal mode: a header per date group (Pinned / Today / Yesterday / …).
                groups.map((group) => (
                  <div key={group.label}>
                    <div style={groupHeaderStyle}>{group.label}</div>
                    {group.items.map((c) => (
                      <RecentItem key={c.id} convo={c} active={c.id === activeId}
                        onOpen={() => go(`/ask-orbo?c=${c.id}`)}
                        onDelete={() => deleteConversation(c.id)} />
                    ))}
                  </div>
                ))
              )}
            </div>
          )}

          <NavLink to="/settings" onClick={() => isMobile && setDrawerOpen(false)} style={navLinkStyle(railCollapsed)}>
            <Settings size={16} /> {!railCollapsed && "Settings"}
          </NavLink>
        </aside>

        {/* ── Main column ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <header style={{ height: 56, borderBottom: "1px solid var(--border)", background: "var(--surface)",
            display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16, padding: "0 22px", flexShrink: 0 }}>
            {/* Mobile hamburger → opens the slide-in sidebar drawer. Hidden on desktop (docked sidebar). */}
            {isMobile && (
              <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" title="Menu"
                style={{ marginRight: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text)", display: "grid", placeItems: "center" }}>
                <Menu size={22} />
              </button>
            )}
            {orgName && <span style={{ marginRight: isMobile ? 0 : "auto", color: "var(--text-dim)", fontSize: "0.9em" }}>{orgName}</span>}
            <NotificationBell />
            <UserButton afterSignOutUrl="/" appearance={clerkAppearance} />
          </header>
          {/* minWidth:0 lets the content shrink instead of pushing wide children (long
              URLs / text) off-screen; overflow:auto makes this the page scroll area. */}
          <main style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", background: "var(--canvas)" }}><Outlet /></main>
        </div>
      </div>
    </NotificationsProvider>
  );
}

const navLinkStyle = (collapsed) => {
  return ({ isActive }) => ({
    marginTop: "auto", display: "flex", alignItems: "center", gap: 8,
    padding: collapsed ? "8px 0" : "8px 12px", justifyContent: collapsed ? "center" : "flex-start",
    borderRadius: 10, textDecoration: "none", fontSize: "0.9em",
    color: isActive ? "var(--primary)" : "var(--text-dim)",
  });
}

// Shared style for a Recents date-group header ("Today", "Pinned", …). Mirrors the old
// single "Recents" label so grouped headers look consistent.
const groupHeaderStyle = {
  fontSize: "0.68em", fontWeight: 700, color: "var(--text-dim)",
  textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 8px 4px",
};

// Placeholder shown when there are no chats to list.
const EmptyRecents = ({ label }) => {
  return (
    <div style={{ padding: "6px 8px", color: "var(--text-dim)", fontSize: "0.8em", fontStyle: "italic" }}>
      {label}
    </div>
  );
}

// One past-chat row: pin/clock icon + title. Click to reopen; the ⋯ button opens a small
// menu to Rename / Pin / Delete. The active (currently open) chat is highlighted.
const RecentItem = ({ convo, active, onOpen, onDelete }) => {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false); // themed "delete this chat?" dialog
  const highlight = active || hover;

  // Rename via a simple prompt (beginner-friendly, no custom modal). Cancel leaves it as-is.
  const handleRename = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    const name = window.prompt("Rename chat", convo.customTitle || convo.title);
    if (name != null) renameConversation(convo.id, name);
  }
  const handlePin = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    togglePin(convo.id);
  }
  // Open the themed confirm dialog (not window.confirm, which can't be styled).
  const handleDelete = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    setConfirmingDelete(true);
  }

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setMenuOpen(false); }}
      onClick={onOpen} title={convo.title}
      style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
        borderRadius: 8, cursor: "pointer", color: active ? "var(--primary)" : "var(--text-dim)",
        fontSize: "0.85em", fontWeight: active ? 700 : 400,
        background: highlight ? "var(--canvas)" : "transparent" }}>
      {convo.pinned ? <Pin size={14} style={{ flexShrink: 0 }} /> : <Clock size={14} style={{ flexShrink: 0 }} />}
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{convo.title}</span>

      {(hover || menuOpen) && (
        <button onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }} aria-label="Chat options"
          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-dim)", display: "grid", placeItems: "center", padding: 0 }}>
          <MoreHorizontal size={16} />
        </button>
      )}

      {menuOpen && (
        <div style={{ position: "absolute", top: "100%", right: 4, zIndex: 20, minWidth: 150,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "var(--shadow)", padding: 4, color: "var(--text)", fontWeight: 400 }}>
          <button onClick={handleRename} style={menuItemStyle}><Pencil size={14} /> Rename</button>
          <button onClick={handlePin} style={menuItemStyle}>
            <Pin size={14} /> {convo.pinned ? "Unpin" : "Pin"}
          </button>
          <button onClick={handleDelete} style={{ ...menuItemStyle, color: "var(--danger)" }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}

      {/* Themed "delete this chat?" confirm. stopPropagation on the wrapper so clicks inside the
          dialog don't bubble up to the row's onClick (which would reopen the chat). */}
      {confirmingDelete && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title="Delete this chat?"
            message="This removes the conversation from your history."
            confirmLabel="Delete"
            danger
            onConfirm={() => { setConfirmingDelete(false); onDelete(); }}
            onCancel={() => setConfirmingDelete(false)}
          />
        </div>
      )}
    </div>
  );
}

// One row inside the ⋯ menu.
const menuItemStyle = {
  display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
  padding: "7px 10px", borderRadius: 8, border: "none", background: "none",
  cursor: "pointer", fontSize: "0.9em", color: "inherit",
};

const NavItem = ({ item, collapsed, onNavigate }) => {
  const Icon = NAV_ICON[item.to] ?? Sparkles;
  return (
    <NavLink to={item.to} title={item.label} onClick={onNavigate} style={({ isActive }) => ({
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

export default AppShell;
