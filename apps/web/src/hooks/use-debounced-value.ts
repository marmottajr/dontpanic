'use client';

import { useEffect, useState } from 'react';

/**
 * Delays a value (typically a search box) so one request per keystroke never
 * happens — the list keeps reacting while you type, the server gets a rest.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
