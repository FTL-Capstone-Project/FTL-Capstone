// Wrapper for Google Safe Browsing (fast yes/no: is this a known-bad URL?).
// STUB for now; TODO(David): real lookup. Result feeds the verdict + a score floor.
import { env } from "../config/env.js";

export async function checkBlacklist(rawUrl) {
  if (!env.safeBrowsingKey) {
    return { blacklist_hit: false, blacklist_source: null }; // stub: unknown → not flagged
  }
  // TODO(David): POST to safebrowsing.googleapis.com/v4/threatMatches:find
  throw new Error("Safe Browsing integration not implemented yet");
}
