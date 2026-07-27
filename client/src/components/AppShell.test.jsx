// ── sidebar search bar · dual-purpose behavior · tests · owner: David ──
// The one sidebar box does two jobs. For everyone it filters local chat history. For an ANALYST,
// Enter ALSO runs the term against the org's whole threat history by deep-linking into the triage
// queue (/reports?q=…), which owns that results view — analysts asked for one search box, not two.
// A member/individual has no org history to search, so Enter must do nothing for them.
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// jsdom ships no matchMedia, and the shell reads it twice on mount (resolved theme + the mobile
// breakpoint). Report "no match" so we render the desktop, light-theme frame.
beforeAll(() => {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
});

// One shared navigate spy, so we can assert exactly where Enter sent the user.
const navigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
  Outlet: () => <div data-testid="outlet" />,
}));

// The role under test is swapped per test.
let currentRole = "analyst";
vi.mock("../lib/useOrbisRole.js", () => ({
  useOrbisRole: () => ({ role: currentRole, orgName: "Acme", isAdmin: false }),
}));

// Clerk widgets render nothing meaningful here; useAuth just needs a userId + getToken.
vi.mock("@clerk/clerk-react", () => ({
  UserButton: () => <div data-testid="user-button" />,
  OrganizationSwitcher: () => <div data-testid="org-switcher" />,
  useOrganizationList: () => ({ isLoaded: true, userMemberships: { data: [] } }),
  useAuth: () => ({ userId: "user_1", getToken: async () => "t" }),
}));

// Keep the frame light: the bell polls, and the provider wraps it.
vi.mock("../context/NotificationsContext.jsx", () => ({
  NotificationsProvider: ({ children }) => <>{children}</>,
}));
vi.mock("./NotificationBell.jsx", () => ({ default: () => <div data-testid="bell" /> }));

const { default: AppShell } = await import("./AppShell.jsx");

const renderShell = () =>
  render(
    <MemoryRouter initialEntries={["/ask-orbo"]}>
      <AppShell />
    </MemoryRouter>
  );

const searchBox = () => screen.getByPlaceholderText(/search/i);

beforeEach(() => { navigate.mockReset(); });

describe("AppShell sidebar search", () => {
  it("an ANALYST pressing Enter deep-links into the org report search", async () => {
    currentRole = "analyst";
    const user = userEvent.setup();
    renderShell();

    await user.type(searchBox(), "paypal{Enter}");

    expect(navigate).toHaveBeenCalledWith("/reports?q=paypal");
  });

  it("URL-encodes the term so a slash or space can't break the query string", async () => {
    currentRole = "analyst";
    const user = userEvent.setup();
    renderShell();

    await user.type(searchBox(), "a b/c{Enter}");

    expect(navigate).toHaveBeenCalledWith("/reports?q=a%20b%2Fc");
  });

  it("a MEMBER pressing Enter does nothing (no org search for them)", async () => {
    currentRole = "member";
    const user = userEvent.setup();
    renderShell();

    await user.type(searchBox(), "paypal{Enter}");

    expect(navigate).not.toHaveBeenCalled();
  });

  it("an INDIVIDUAL pressing Enter does nothing", async () => {
    currentRole = "individual";
    const user = userEvent.setup();
    renderShell();

    await user.type(searchBox(), "paypal{Enter}");

    expect(navigate).not.toHaveBeenCalled();
  });

  it("an analyst's one-character term doesn't navigate (too broad; the server rejects it)", async () => {
    currentRole = "analyst";
    const user = userEvent.setup();
    renderShell();

    await user.type(searchBox(), "p{Enter}");

    expect(navigate).not.toHaveBeenCalled();
  });

  it("whitespace alone doesn't navigate", async () => {
    currentRole = "analyst";
    const user = userEvent.setup();
    renderShell();

    await user.type(searchBox(), "   {Enter}");

    expect(navigate).not.toHaveBeenCalled();
  });

  it("typing without Enter never navigates (chat filtering stays the default)", async () => {
    currentRole = "analyst";
    const user = userEvent.setup();
    renderShell();

    await user.type(searchBox(), "paypal");

    expect(navigate).not.toHaveBeenCalled();
  });

  it("tells the analyst what Enter does, but doesn't promise it to other roles", () => {
    currentRole = "analyst";
    renderShell();
    expect(screen.getByPlaceholderText(/enter to search reports/i)).toBeInTheDocument();
  });

  it("keeps the plain chat-search placeholder for a member", () => {
    currentRole = "member";
    renderShell();
    expect(screen.getByPlaceholderText(/search your past chats/i)).toBeInTheDocument();
  });
});
