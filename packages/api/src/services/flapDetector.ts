/**
 * Alert Flapping Detection
 *
 * Tracks state transitions per alert fingerprint. If an alert transitions
 * more than FLAP_THRESHOLD times within FLAP_WINDOW_MS, it is considered
 * "flapping" and notifications will be suppressed.
 */

const transitionMap = new Map<string, Date[]>();
const FLAP_THRESHOLD = 5;
const FLAP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Record a state transition for the given fingerprint.
 * Returns true if the alert is now considered flapping.
 */
export function recordTransition(fingerprint: string): boolean {
  const now = new Date();
  const cutoff = new Date(now.getTime() - FLAP_WINDOW_MS);

  let transitions = transitionMap.get(fingerprint) || [];

  // Prune transitions outside the window
  transitions = transitions.filter((t) => t > cutoff);

  // Add the new transition
  transitions.push(now);

  transitionMap.set(fingerprint, transitions);

  return transitions.length > FLAP_THRESHOLD;
}

/**
 * Check if a fingerprint is currently flapping (without recording a new transition).
 */
export function isFlapping(fingerprint: string): boolean {
  const now = new Date();
  const cutoff = new Date(now.getTime() - FLAP_WINDOW_MS);

  const transitions = transitionMap.get(fingerprint);
  if (!transitions) return false;

  const recent = transitions.filter((t) => t > cutoff);
  return recent.length > FLAP_THRESHOLD;
}

/**
 * Clear flapping state for a fingerprint.
 */
export function clearFlapping(fingerprint: string): void {
  transitionMap.delete(fingerprint);
}
