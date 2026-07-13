import { Outlet, NavLink } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { NotificationsProvider } from "../context/NotificationsContext.jsx";
import NotificationBell from "./NotificationBell.jsx";

// Sidebar + top bar around every signed-in page. <Outlet/> renders the active route.
export default function AppShell() {
  return (
    <NotificationsProvider>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <aside style={{ width: 240, background: "var(--surface)", borderRight: "1px solid var(--border)",
          padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontWeight: 800, color: "var(--navy)", fontSize: "1.3em", marginBottom: 12 }}>🪐 Orbis</div>
          <NavItem to="/home">New check</NavItem>
          <NavItem to="/reports">My reports</NavItem>
        </aside>

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <header style={{ height: 60, borderBottom: "1px solid var(--border)", background: "var(--surface)",
            display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16, padding: "0 22px" }}>
            <NotificationBell />
            <UserButton />
          </header>
          <main style={{ flex: 1 }}><Outlet /></main>
        </div>
      </div>
    </NotificationsProvider>
  );
}

function NavItem({ to, children }) {
  return (
    <NavLink to={to} style={({ isActive }) => ({
      padding: "8px 12px", borderRadius: 8, textDecoration: "none", fontWeight: 600,
      color: isActive ? "var(--primary)" : "var(--navy)",
      background: isActive ? "var(--canvas)" : "transparent",
    })}>{children}</NavLink>
  );
}
