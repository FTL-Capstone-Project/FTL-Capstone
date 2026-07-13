# feature: auth  · owner: Michael

Everything for getting into Orbis. Uses **Clerk** prebuilt components (we style them, we don't
hand-build forms).

| File | What it is |
|---|---|
| `Landing.jsx` | Public marketing page; routes to sign up / log in |
| `Login.jsx` | Clerk `<SignIn />`, styled |
| `Register.jsx` | Clerk `<SignUp />`, styled |
| `ProtectedRoute.jsx` | Wraps protected pages; redirects to `/login` if signed out |

Clerk key: `VITE_CLERK_PUBLISHABLE_KEY` (see `client/.env.example`).
