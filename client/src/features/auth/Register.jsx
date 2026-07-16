import { SignUp } from "@clerk/clerk-react";

// Clerk's prebuilt sign-up (email/password + Google/Apple). Styling TODO(Michael).
const Register = () => {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <SignUp signInUrl="/login" forceRedirectUrl="/home" />
    </div>
  );
}

export default Register;
