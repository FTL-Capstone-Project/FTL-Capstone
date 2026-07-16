import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";

// Gate for protected pages: render children if signed in, else bounce to our OWN
// account-type chooser at "/" (not Clerk's hosted page — we use custom auth screens).
export default function ProtectedRoute({ children }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <Navigate to="/" replace />
      </SignedOut>
    </>
  );
}
