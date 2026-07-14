import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { UserButton, OrganizationSwitcher } from "@clerk/clerk-react";
import { NotificationsProvider } from "../context/NotificationsContext.jsx";
import NotificationBell from "./NotificationBell.jsx";
import { NAV_BY_ROLE } from "../config/constants.js";
import { useOrbisRole } from "../lib/useOrbisRole.js";

// Sidebar + top bar around every signed-in page. <Outlet/> renders the active route.
// Sidebar is collapsible (toggled by the Orbis logo, per the wireframes) and its
// nav items are role-aware (individuals/members lead with Home; analysts with Dashboard).
export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const { role, orgName } = useOrbisRole();
  const navigate = useNavigate();
  const nav = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.individual;
  const inOrg = role === "member" || role === "analyst";

  return (
    <NotificationsProvider>
      <div style={{ display: "flex", minHeight: "100vh", background: "var(--canvas)" }}>
        {/* ── Sidebar ── */}
        <aside
          style={{
            width: collapsed ? 64 : 260,
            background: "var(--surface)",
            borderRight: "1px solid var(--border)",
            padding: collapsed ? "16px 10px" : 20,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            transition: "width .15s ease",
          }}
        >
          {/* Logo toggles the sidebar */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand" : "Collapse"}
            aria-label="Toggle sidebar"
            style={{
              display: "flex", alignItems: "center", gap: 8, background: "none", border: "none",
              cursor: "pointer", fontWeight: 800, color: "var(--navy)", fontSize: "1.3em", padding: 0,
            }}
          >
            🪐 {!collapsed && <span>Orbis</span>}
          </button>

          {inOrg && !collapsed && (
            <div style={{ margin: "6px 0" }}>
              <OrganizationSwitcher hidePersonal={false} />
            </div>
          )}

          {/* + New check → starts a fresh chat (Home). */}
          <button
            onClick={() => navigate("/home?new=1")}
            style={{
              background: "var(--primary)", color: "#fff", border: "none", borderRadius: 10,
              padding: collapsed ? "10px 0" : "10px 14px", fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            ＋ {!collapsed && "New check"}
          </button>

          {!collapsed && (
            <input
              placeholder="Search your past checks…"
              style={{
                border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px",
                fontSize: ".9em", background: "var(--surface)", color: "var(--text)",
              }}
            />
          )}

          {/* Role-aware nav */}
          <nav style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
            {nav.map((item) => (
              <NavItem key={item.to} item={item} collapsed={collapsed} />
            ))}
          </nav>

          {!collapsed && (
            <div style={{ marginTop: 14, fontSize: ".72em", fontWeight: 700, letterSpacing: ".04em", color: "var(--text-dim)" }}>
              RECENTS
            </div>
          )}
          {/* RECENTS list is chat history — populated once conversations land (David's slice). */}

          <div style={{ marginTop: "auto" }}>
            <NavLink to="/settings" style={navLinkStyle(collapsed)}>
              ⚙ {!collapsed && "Settings"}
            </NavLink>
          </div>
        </aside>

        {/* ── Main column ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <header
            style={{
              height: 60, borderBottom: "1px solid var(--border)", background: "var(--surface)",
              display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16, padding: "0 22px",
            }}
          >
            {orgName && (
              <span style={{ marginRight: "auto", color: "var(--text-dim)", fontSize: ".9em" }}>{orgName}</span>
            )}
            <button title="Inbox" aria-label="Inbox" style={iconBtn}>📥</button>
            <NotificationBell />
            <UserButton afterSignOutUrl="/" />
          </header>
          <main style={{ flex: 1 }}>
            <Outlet />
          </main>
        </div>
      </div>
    </NotificationsProvider>
  );
}

const iconBtn = { background: "none", border: "none", cursor: "pointer", fontSize: "1.1em" };

function navLinkStyle(collapsed) {
  return ({ isActive }) => ({
    display: "flex", alignItems: "center", gap: 10, padding: collapsed ? "10px 0" : "9px 12px",
    justifyContent: collapsed ? "center" : "flex-start", borderRadius: 10, textDecoration: "none",
    fontWeight: 600, color: isActive ? "var(--primary)" : "var(--navy)",
    background: isActive ? "var(--canvas)" : "transparent",
  });
}

function NavItem({ item, collapsed }) {
  return (
    <NavLink to={item.to} title={item.label} style={navLinkStyle(collapsed)}>
      <span aria-hidden>{item.icon}</span>
      {!collapsed && (
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <span>{item.label}</span>
          <span style={{ fontSize: ".72em", fontWeight: 500, color: "var(--text-dim)" }}>{item.sub}</span>
        </span>
      )}
    </NavLink>
  );
}
