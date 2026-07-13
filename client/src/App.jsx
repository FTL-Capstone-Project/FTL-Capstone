import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "./features/auth/ProtectedRoute.jsx";
import AppShell from "./components/AppShell.jsx";

import Landing from "./features/auth/Landing.jsx";
import Login from "./features/auth/Login.jsx";
import Register from "./features/auth/Register.jsx";
import Home from "./features/check-link/Home.jsx";
import CheckResult from "./features/check-link/CheckResult.jsx";
import Reports from "./features/reports/Reports.jsx";

// Route map:
//  Public:    /  /login  /register
//  Protected: everything inside <AppShell> (redirects to /login if signed out)
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
        <Route path="/home" element={<Home />} />
        <Route path="/check/:indicatorId" element={<CheckResult />} />
        <Route path="/reports" element={<Reports />} />
      </Route>
    </Routes>
  );
}
