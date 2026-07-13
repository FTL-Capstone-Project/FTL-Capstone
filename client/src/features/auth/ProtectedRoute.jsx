import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";

// Gate for protected pages: render children if signed in, else bounce to Clerk sign-in.
export default function ProtectedRoute({ children }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
