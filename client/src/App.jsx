import { Routes, Route, Navigate } from "react-router-dom";
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import ProtectedRoute from "./features/auth/ProtectedRoute.jsx";
import AppShell from "./components/AppShell.jsx";
import ComingSoon from "./components/ComingSoon.jsx";

import Landing from "./features/auth/Landing.jsx";
import ChooseAccountType from "./features/auth/ChooseAccountType.jsx";
import SignIn from "./features/auth/SignIn.jsx";
import CreateAccount from "./features/auth/CreateAccount.jsx";
import CreateTeam from "./features/auth/CreateTeam.jsx";
import SsoCallback from "./features/auth/SsoCallback.jsx";
import ExtensionInstall from "./features/auth/ExtensionInstall.jsx";
import Home from "./features/check-link/Home.jsx";
import Reports from "./features/reports/Reports.jsx";
import Dashboard from "./features/dashboard/Dashboard.jsx";
import Insights from "./features/insights/Insights.jsx";
import Settings from "./features/settings/Settings.jsx";

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
    <Routes>
      {/* Public marketing + auth flow. */}
      <Route path="/" element={<Landing />} />
      <Route path="/get-started" element={<PublicOnly><ChooseAccountType /></PublicOnly>} />
      <Route path="/signin" element={<PublicOnly><SignIn /></PublicOnly>} />
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
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/insights" element={<Insights />} />{/* AI Feature B: NL → chart */}
        <Route path="/settings" element={<Settings />} />
        {/* Catch-all: never strand the user on a blank screen. */}
        <Route path="*" element={<ComingSoon note="That page doesn't exist yet." />} />
      </Route>
    </Routes>
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
