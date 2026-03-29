/**
 * Return-path management for auth flows.
 *
 * Stores the intended return path in localStorage before auth redirects
 * (email confirmation, OAuth) so the callback page can redirect back.
 */

const RETURN_PATH_KEY = 'nobre_amor_return_path';

/** Paths that should never be used as return targets. */
const BLOCKED = ['/entrar', '/auth/callback', '/redefinir-senha'];

/**
 * Validates that a path is a safe internal app route.
 * Prevents open redirect vulnerabilities.
 */
export function isValidReturnPath(path) {
  if (!path || typeof path !== 'string') return false;
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (path.includes('://')) return false;
  if (BLOCKED.includes(path)) return false;
  return true;
}

/** Save the return path for post-auth redirect. */
export function saveReturnPath(path) {
  if (!isValidReturnPath(path)) return;
  try { localStorage.setItem(RETURN_PATH_KEY, path); } catch { /* ok */ }
}

/** Get the saved return path (defaults to '/'). */
export function getReturnPath() {
  try {
    const saved = localStorage.getItem(RETURN_PATH_KEY);
    return isValidReturnPath(saved) ? saved : '/';
  } catch {
    return '/';
  }
}

/** Clear the saved return path after use. */
export function clearReturnPath() {
  try { localStorage.removeItem(RETURN_PATH_KEY); } catch { /* ok */ }
}
