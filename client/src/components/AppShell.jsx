import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { UserButton, OrganizationSwitcher } from "@clerk/clerk-react";
import { Plus, Search, Home as HomeIcon, LayoutGrid, FileText, Sparkles, Settings, Inbox, Orbit } from "lucide-react";
import { NotificationsProvider } from "../context/NotificationsContext.jsx";
import NotificationBell from "./NotificationBell.jsx";
import OrbisLogo from "./OrbisLogo.jsx";
import { NAV_BY_ROLE } from "../config/constants.js";
import { useOrbisRole } from "../lib/useOrbisRole.js";

// NOTE: SHARED COMPONENT (app frame). Merged: David's wireframe styling + real Orbis logo +
// lucide icons, layered with Michael's role-aware nav (useOrbisRole + NAV_BY_ROLE), collapsible
// sidebar, and Clerk OrganizationSwitcher. Nav is role-aware: individuals/members lead with Home
// (chat); analysts lead with Dashboard / Ask Orbo.

// Map a nav path → its lucide icon (we render these, not the emoji in NAV_BY_ROLE data).
const NAV_ICON = {
  "/home": HomeIcon,
  "/dashboard": LayoutGrid,
  "/reports": FileText,
  "/ask-orbo": Sparkles,
};

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const { role, orgName } = useOrbisRole();
  const navigate = useNavigate();
  const nav = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.individual;
  const inOrg = role === "member" || role === "analyst";

  return (
    <NotificationsProvider>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {/* ── Sidebar ── */}
        <aside style={{ width: collapsed ? 68 : 250, background: "var(--surface)",
          borderRight: "1px solid var(--border)", padding: collapsed ? "18px 12px" : 18,
          display: "flex", flexDirection: "column", gap: 14, flexShrink: 0, transition: "width .15s ease" }}>

          {/* Logo — click to collapse/expand (compact planet mark when collapsed) */}
          <button onClick={() => setCollapsed((c) => !c)} aria-label="Toggle sidebar"
            title={collapsed ? "Expand" : "Collapse"}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px 6px",
              display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start" }}>
            {collapsed ? <Orbit size={26} color="var(--navy)" /> : <OrbisLogo height={32} />}
          </button>

          {inOrg && !collapsed && (
            <div style={{ margin: "2px 0" }}>
              <OrganizationSwitcher hidePersonal={false} />
            </div>
          )}

          <button onClick={() => navigate("/home?new=1")} style={{ display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8, background: "var(--primary)", color: "#fff", border: "none",
            borderRadius: 12, padding: collapsed ? "11px 0" : "11px 14px", fontWeight: 700, cursor: "pointer", fontSize: "0.95em" }}>
            <Plus size={18} /> {!collapsed && "New check"}
          </button>

          {!collapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border)",
              borderRadius: 10, padding: "8px 12px", color: "var(--text-dim)" }}>
              <Search size={16} />
              <input placeholder="Search your past checks…" disabled
                style={{ border: "none", outline: "none", background: "transparent", fontSize: "0.85em", width: "100%" }} />
            </div>
          )}

          {/* Role-aware nav */}
          <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {nav.map((item) => (
              <NavItem key={item.to} item={item} collapsed={collapsed} />
            ))}
          </nav>

          {/* Recents — chat history; static placeholders until wired (David's slice / DB) */}
          {!collapsed && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: "0.68em", fontWeight: 700, color: "var(--text-dim)",
                textTransform: "uppercase", letterSpacing: "0.06em", padding: "0 8px 6px" }}>Recents</div>
              {["Is this PayPal email real?", "Check bit.ly link", "Suspicious invoice PDF"].map((r) => (
                <div key={r} style={{ padding: "6px 8px", color: "var(--text-dim)", fontSize: "0.85em",
                  cursor: "default", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r}</div>
              ))}
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

function NavItem({ item, collapsed }) {
  const Icon = NAV_ICON[item.to] ?? HomeIcon;
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
