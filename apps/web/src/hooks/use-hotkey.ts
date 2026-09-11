'use client';

import { useEffect, useRef } from 'react';

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return TYPING.has(target.tagName) || target.isContentEditable;
}

/**
 * Single-key shortcut for a screen's most common action (usually "create").
 * It mutes itself while you are typing in a field, while a modal is open, and
 * whenever a modifier is held — so `Ctrl+N` is never stolen from the browser.
 */
export function useHotkey(key: string, handler: () => void, enabled = true): void {
  const saved = useRef(handler);
  saved.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() !== key.toLowerCase()) return;
      if (isTyping(event.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      saved.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, enabled]);
}
