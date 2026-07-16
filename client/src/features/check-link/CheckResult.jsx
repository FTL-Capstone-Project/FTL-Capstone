import { Navigate } from "react-router-dom";

// Legacy route. Verdicts now render inline in the Home chat (VerdictMessage), so this
// standalone page is retired — redirect any old /check/:id link back to the chat.
// TODO(David): deep-linking to a past check can reopen it in the chat later.
const CheckResult = () => {
  return <Navigate to="/home" replace />;
}

export default CheckResult;
