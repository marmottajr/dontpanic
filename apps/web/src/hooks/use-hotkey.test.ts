import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHotkey } from './use-hotkey';

function press(key: string, target: EventTarget = window, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

let extras: HTMLElement[] = [];

function mount<T extends HTMLElement>(element: T): T {
  document.body.append(element);
  extras.push(element);
  return element;
}

beforeEach(() => {
  extras = [];
});
afterEach(() => {
  extras.forEach((element) => element.remove());
});

describe('useHotkey', () => {
  it('fires on the bare key and swallows the browser default', () => {
    const handler = vi.fn();
    renderHook(() => useHotkey('n', handler));
    const event = press('n');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('is case-insensitive', () => {
    const handler = vi.fn();
    renderHook(() => useHotkey('n', handler));
    press('N');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores any other key', () => {
    const handler = vi.fn();
    renderHook(() => useHotkey('n', handler));
    press('m');
    expect(handler).not.toHaveBeenCalled();
  });

  it('never steals a modified shortcut from the browser', () => {
    const handler = vi.fn();
    renderHook(() => useHotkey('n', handler));
    press('n', window, { ctrlKey: true });
    press('n', window, { metaKey: true });
    press('n', window, { altKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it('mutes itself while the user is typing', () => {
    const handler = vi.fn();
    renderHook(() => useHotkey('n', handler));

    for (const tag of ['input', 'textarea', 'select'] as const) {
      press('n', mount(document.createElement(tag)));
    }
    const editable = mount(document.createElement('div'));
    editable.contentEditable = 'true';
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    press('n', editable);

    expect(handler).not.toHaveBeenCalled();
  });

  it('still fires from a non-typing element', () => {
    const handler = vi.fn();
    renderHook(() => useHotkey('n', handler));
    press('n', mount(document.createElement('div')));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('mutes itself while a modal is open', () => {
    const handler = vi.fn();
    renderHook(() => useHotkey('n', handler));
    const dialog = mount(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    press('n');
    expect(handler).not.toHaveBeenCalled();
  });

  it('stays quiet while disabled and wakes up when enabled', () => {
    const handler = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useHotkey('n', handler, enabled), {
      initialProps: { enabled: false },
    });
    press('n');
    expect(handler).not.toHaveBeenCalled();

    rerender({ enabled: true });
    press('n');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('always calls the latest handler, without rebinding', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ handler }) => useHotkey('n', handler), {
      initialProps: { handler: first },
    });
    rerender({ handler: second });
    press('n');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('unbinds on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useHotkey('n', handler));
    unmount();
    press('n');
    expect(handler).not.toHaveBeenCalled();
  });
});
