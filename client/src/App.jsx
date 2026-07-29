import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import ProtectedRoute from "./features/auth/ProtectedRoute.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";
import AppShell from "./components/AppShell.jsx";
import ComingSoon from "./components/ComingSoon.jsx";

// Landing is the public first paint (no auth, no charts) → keep it EAGER so "/" renders instantly.
import Landing from "./features/auth/Landing.jsx";

// Everything else is lazy-loaded (React.lazy + a Suspense fallback below). This splits the ~900KB
// single bundle: the heavy, signed-in-only screens — especially the Recharts-powered Dashboard and
// Insights — no longer ship to a visitor who only hits the landing/auth pages, and each route's code
// arrives on demand. First paint of "/" gets dramatically lighter.
const ChooseAccountType = lazy(() => import("./features/auth/ChooseAccountType.jsx"));
const SignIn = lazy(() => import("./features/auth/SignIn.jsx"));
const CreateAccount = lazy(() => import("./features/auth/CreateAccount.jsx"));
const CreateTeam = lazy(() => import("./features/auth/CreateTeam.jsx"));
const SsoCallback = lazy(() => import("./features/auth/SsoCallback.jsx"));
const ExtensionInstall = lazy(() => import("./features/auth/ExtensionInstall.jsx"));
const Home = lazy(() => import("./features/check-link/Home.jsx"));
const Reports = lazy(() => import("./features/reports/Reports.jsx"));
const CampaignDetail = lazy(() => import("./features/reports/CampaignDetail.jsx"));
const Dashboard = lazy(() => import("./features/dashboard/Dashboard.jsx"));
const Insights = lazy(() => import("./features/insights/Insights.jsx"));
const Settings = lazy(() => import("./features/settings/Settings.jsx"));

// Route map:
//  Public:  /  (marketing Landing) → /get-started (account-type chooser) → /signin,
//           /create-account, /create-team.  OAuth returns at /sso-callback.
//  Protected: everything inside <AppShell> (redirects to / if signed out).
//
// Landing's "Login"/"Get Started" buttons route into the account-type chooser, which
// tags the sign-in with the chosen type. A signed-in user visiting a public auth page
// is bounced into the app (<PublicOnly>). /ask-orbo is the canonical chat Home.
const App = () => {
  return (
    // One boundary around all routes: a render-time throw in any screen shows a recoverable
    // "something went wrong" fallback instead of unmounting the whole app to a blank screen.
    <ErrorBoundary>
    {/* Suspense fallback for the lazy route chunks below — a lazy chunk that hasn't loaded yet
        (slow network, cold cache) shows the branded loading screen instead of a blank frame. */}
    <Suspense fallback={<LoadingScreen label="Loading…" />}>
    <Routes>
      {/* Public marketing + auth flow. */}
      <Route path="/" element={<Landing />} />
      <Route path="/get-started" element={<PublicOnly><ChooseAccountType /></PublicOnly>} />
      {/* /signin is NOT wrapped in PublicOnly: it owns the signed-in state so it can route by
          role vs. the ?type= page (personal/org/analyst) and show a mismatch error instead of
          being auto-bounced to /ask-orbo. See SignIn.jsx post-auth routing. */}
      <Route path="/signin" element={<SignIn />} />
      <Route path="/create-account" element={<PublicOnly><CreateAccount /></PublicOnly>} />
      <Route path="/create-team" element={<PublicOnly><CreateTeam /></PublicOnly>} />
      <Route path="/sso-callback" element={<SsoCallback />} />
      <Route path="/extension" element={<ExtensionInstall />} />{/* how-to-install (landing "Download Extension") */}

      {/* Legacy auth paths → new flow. */}
      <Route path="/login" element={<Navigate to="/signin?type=personal" replace />} />
      <Route path="/register" element={<Navigate to="/get-started" replace />} />

      {/* Protected app. */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/ask-orbo" element={<Home />} />
        <Route path="/home" element={<Navigate to="/ask-orbo" replace />} />
        <Route path="/check/:indicatorId" element={<Navigate to="/ask-orbo" replace />} />
        <Route path="/reports" element={<Reports />} />
        {/* One campaign, opened from a triage-queue campaign row. Nested under /reports on
            purpose: the sidebar highlights by path prefix, so "Reports" stays lit here. */}
        <Route path="/reports/campaigns/:campaignId" element={<CampaignDetail />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/insights" element={<Insights />} />{/* AI Feature B: NL → chart */}
        <Route path="/settings" element={<Settings />} />
        {/* Catch-all: never strand the user on a blank screen. */}
        <Route path="*" element={<ComingSoon note="That page doesn't exist yet." />} />
      </Route>
    </Routes>
    </Suspense>
    </ErrorBoundary>
  );
};

// Renders children only when signed OUT; a signed-in visitor is sent into the app.
const PublicOnly = ({ children }) => {
  return (
    <>
      <SignedOut>{children}</SignedOut>
      <SignedIn>
        <Navigate to="/ask-orbo" replace />
      </SignedIn>
    </>
  );
};

export default App;
