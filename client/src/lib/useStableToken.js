// ── shared hook: a token getter with a STABLE identity · owner: David ──
//
// THE PROBLEM THIS SOLVES
// Clerk's useAuth() returns a fresh object each render, and `getToken` is not guaranteed to keep the
// same function identity. Nearly every data effect in this app was written as:
//
//     useEffect(() => { api.get(url, { getToken }).then(setRows); }, [getToken]);
//
// which reads as "fetch once on mount" but actually means "re-fetch whenever getToken's identity
// changes". When it does change, the effect re-runs, setRows() lands a brand-new array, that renders,
// the render produces another new getToken — and the effect fires again. A self-feeding fetch loop.
// It stays hidden in tests (mocks return the SAME array reference, so React bails out of the
// re-render) and in any build where Clerk happens to memoize, which is exactly what makes it a nasty
// latent bug rather than an obvious one. It bit us for real in the analyst search box, where the
// effect also armed a debounce timer, so every render re-armed it.
//
// THE FIX
// Keep the latest getToken in a ref and hand callers a wrapper whose identity NEVER changes. Effects
// can then depend on the things they actually care about (an id, a search term) and still always call
// the CURRENT token function — no stale closure, no re-run.
//
// USAGE — note the empty/id-only dependency list, which is the whole point:
//     const getToken = useStableToken();
//     useEffect(() => { api.get(`/api/thing/${id}`, { getToken }).then(setRows); }, [id, getToken]);
//
// getToken is safe to list as a dependency here precisely because it is stable forever.
import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";

export const useStableToken = () => {
  const { getToken } = useAuth();
  const ref = useRef(getToken);

  // Keep the ref pointing at the newest function. This runs after render, so a fetch fired during
  // the same commit still uses a valid (if slightly older) getToken — Clerk's tokens outlive a tick.
  useEffect(() => { ref.current = getToken; }, [getToken]);

  // Identity is fixed for the component's whole lifetime ([] deps), so putting this in a dependency
  // array can never retrigger an effect.
  return useCallback((...args) => ref.current?.(...args), []);
};
