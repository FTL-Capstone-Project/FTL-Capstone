// ============================================================
// The ONE place the client talks to the backend.
// Every component calls api.get()/api.post()/... — never raw fetch().
// This wrapper adds the base URL + the Clerk session token so
// individual components never worry about auth headers.
// ============================================================
import { API_URL } from "../config/constants.js";

// `getToken` comes from Clerk's useAuth() — pass it in from a component/hook.
const request = async (method, path, { body, getToken } = {}) => {
  const headers = { "Content-Type": "application/json" };
  if (getToken) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.error || `HTTP ${res.status}`), { status: res.status, body: err });
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  get:    (path, opts) => request("GET", path, opts),
  post:   (path, body, opts) => request("POST", path, { ...opts, body }),
  patch:  (path, body, opts) => request("PATCH", path, { ...opts, body }),
  delete: (path, opts) => request("DELETE", path, opts),
};
