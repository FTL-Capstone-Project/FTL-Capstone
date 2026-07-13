import { SignIn } from "@clerk/clerk-react";

// Clerk's prebuilt sign-in (email/password + Google/Apple). Styling TODO(Michael).
export default function Login() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <SignIn signUpUrl="/register" forceRedirectUrl="/home" />
    </div>
  );
}
