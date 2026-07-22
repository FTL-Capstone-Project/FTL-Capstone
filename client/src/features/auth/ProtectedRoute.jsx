import { useAuth } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";

// Gate for protected pages. We read Clerk state explicitly (isLoaded + isSignedIn) instead
// of <SignedIn>/<SignedOut> so we never redirect DURING Clerk's brief "still resolving the
// session" window — that transient window is what bounced a freshly-signed-in user to the
// landing page. While Clerk loads we render nothing; only once definitively signed out do
// we redirect to "/".
const ProtectedRoute = ({ children }) => {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to="/" replace />;
  return children;
};

export default ProtectedRoute;
