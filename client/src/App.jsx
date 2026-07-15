import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./features/auth/ProtectedRoute.jsx";
import AppShell from "./components/AppShell.jsx";
import ComingSoon from "./components/ComingSoon.jsx";

import Landing from "./features/auth/Landing.jsx";
import Login from "./features/auth/Login.jsx";
import Register from "./features/auth/Register.jsx";
import Home from "./features/check-link/Home.jsx";
import Reports from "./features/reports/Reports.jsx";
import Dashboard from "./features/dashboard/Dashboard.jsx";

// Route map:
//  Public:    /  /login  /register
//  Protected: everything inside <AppShell> (redirects to /login if signed out)
//
// /ask-orbo is the CANONICAL chat Home (Home.jsx = the Ask-Orbo chat). /home and legacy
// /check/:id redirect to it. Unbuilt routes (dashboard/settings) + any unknown path render
// a "Coming soon" page INSIDE the shell, so you can always navigate away (no blank dead-ends).
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

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
        <Route path="/settings" element={<ComingSoon title="Settings" note="Account and preferences are on the way." />} />
        {/* Catch-all: never strand the user on a blank screen. */}
        <Route path="*" element={<ComingSoon note="That page doesn't exist yet." />} />
      </Route>
    </Routes>
  );
}
