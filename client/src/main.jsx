import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App.jsx";
import "./theme/global.css";
import { watchSystemTheme } from "./lib/theme.js";
import { useResolvedTheme } from "./lib/useResolvedTheme.js";
import { getClerkAppearance } from "./lib/clerkAppearance.js";

// Keep the app in sync with the OS theme while the user's preference is "system".
watchSystemTheme();

// Wraps ClerkProvider so ALL Clerk UI (UserButton, OrganizationSwitcher, and the profile/org
// MODALS + sign-in flow) follows the Orbis theme — and re-themes live when the user toggles
// light/dark. Putting appearance on the PROVIDER (not just individual components) is what covers
// the modals, which render in a portal at the document root.
const ThemedClerkProvider = ({ children, ...props }) => {
  const resolved = useResolvedTheme();
  return (
    <ClerkProvider {...props} appearance={getClerkAppearance(resolved)}>
      {children}
    </ClerkProvider>
  );
}

// Clerk publishable key comes from client/.env.local (see .env.example).
const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const root = ReactDOM.createRoot(document.getElementById("root"));

// Guard: without the key, ClerkProvider throws a cryptic error / white screen.
// Show a clear message instead so setup problems are obvious.
if (!clerkKey) {
  root.render(
    <div style={{ maxWidth: 520, margin: "80px auto", fontFamily: "system-ui", lineHeight: 1.5 }}>
      <h1>⚠ Missing Clerk key</h1>
      <p>Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in <code>client/.env.local</code>, then restart <code>npm run dev</code>.</p>
      <p style={{ color: "#556070" }}>See <code>client/.env.example</code>.</p>
    </div>
  );
} else {
  root.render(
    <React.StrictMode>
      <ThemedClerkProvider
          publishableKey={clerkKey}
          signInUrl="/signin"
          signUpUrl="/create-account"
          afterSignInUrl="/ask-orbo"
          afterSignUpUrl="/ask-orbo"
        >
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemedClerkProvider>
    </React.StrictMode>
  );
}
