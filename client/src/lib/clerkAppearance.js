import { dark } from "@clerk/themes";

// ── lib: clerkAppearance · owner: David ──
// One source of truth for how Clerk's UI (UserButton, OrganizationSwitcher, the profile + org
// MODALS, and the sign-in flow) is themed to match Orbis.
//
// Why a function of `resolved` ("light"|"dark") instead of just CSS vars:
//   • Clerk renders its popovers/modals in a PORTAL at the document root, styled by its own
//     `baseTheme`. Color variables alone don't flip that base, so in dark mode the modal CHROME
//     (card background, borders, shadows) stayed light — that's the "profile looks like default
//     Clerk" bug. Setting `baseTheme: dark` when we're dark fixes the whole modal, not just text.
//   • We STILL pass our brand colors as variables on top so buttons/links use Orbis blue etc.
//     These are literal hex values (not var(--...)) because Clerk's portal is outside our themed
//     subtree, so a var() reference there wouldn't resolve — we read the real token per theme.
//
// Keep these hexes in sync with theme/tokens.css (:root and :root[data-theme="dark"]).
const TOKENS = {
  light: {
    colorPrimary: "#0F62FE",
    colorText: "#1A2230",
    colorTextSecondary: "#556070",
    colorBackground: "#FFFFFF",
    colorInputBackground: "#FFFFFF",
    colorInputText: "#1A2230",
    colorDanger: "#DA1E28",
    colorSuccess: "#198038",
    colorWarning: "#B9860B",
  },
  dark: {
    colorPrimary: "#3B82F6",
    colorText: "#E4E8EF",
    colorTextSecondary: "#93A0B5",
    colorBackground: "#131C2B",
    colorInputBackground: "#131C2B",
    colorInputText: "#E4E8EF",
    colorDanger: "#F26B72",
    colorSuccess: "#34D07F",
    colorWarning: "#E0A93A",
  },
};

// Build the appearance object for the current resolved theme. Pass to <ClerkProvider appearance>
// (covers everything, including modals) and/or an individual Clerk component.
export const getClerkAppearance = (resolved) => ({
  // In dark mode, start from Clerk's official dark base theme so the modal chrome is dark too.
  baseTheme: resolved === "dark" ? dark : undefined,
  variables: {
    ...TOKENS[resolved] ?? TOKENS.light,
    borderRadius: "10px",
    fontFamily: "inherit", // use Orbis's font, not Clerk's default stack
  },
  elements: {
    // The switcher trigger sits on the sidebar; a visible border keeps it legible in both themes
    // instead of melting into the surface.
    organizationSwitcherTrigger: {
      border: "1px solid var(--border)",
      padding: "6px 10px",
    },
    // Match our primary buttons' weight so Clerk's CTAs don't look foreign next to ours.
    formButtonPrimary: { fontWeight: 700 },
  },
});
