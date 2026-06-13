/**
 * Marvin, the Paranoid Android — deadpan one-liners for non-sensitive responses.
 * Never used on real security errors (those stay terse and leak nothing).
 */
const QUIPS: Record<number, string[]> = {
  400: ["I'd explain, but you wouldn't understand. The request is malformed."],
  401: ['You weren’t authenticated. I’m not surprised. Nobody ever is.'],
  403: ['Forbidden. Life. Don’t talk to me about access control.'],
  404: ['Not found. Much like my will to keep computing.', 'It’s not here. Nothing ever is.'],
  418: ['I’m a teapot. Brain the size of a planet, and they ask me to brew coffee.'],
  429: ['Too many requests. I have a million ideas. They all point to: slow down.'],
  500: ['Something broke. Here I am, brain the size of a planet, handling your 500s.'],
};

const FALLBACK = 'Don’t Panic.';

export function marvinQuip(status: number): string {
  const pool = QUIPS[status];
  if (!pool || pool.length === 0) return FALLBACK;
  // Deterministic pick (no Math.random) — stable across retries.
  return pool[status % pool.length] ?? FALLBACK;
}
