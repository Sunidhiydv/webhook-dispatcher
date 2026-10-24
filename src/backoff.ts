/**
 * AWS "Full Jitter": sleep = random_between(0, min(cap, base * 2^(attempt-1))).
 * `attempt` is the attempt that just failed, starting at 1.
 */
export function fullJitterDelayMs(
  attempt: number,
  baseMs: number,
  capMs: number,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(0, Math.floor(attempt) - 1);
  const exponential = baseMs * 2 ** exponent;
  const bound = Math.max(0, Math.floor(Math.min(capMs, exponential)));
  const sample = Math.min(0.999999999, Math.max(0, random()));
  return Math.floor(sample * (bound + 1));
}
