'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  onComplete?: (value: string) => void;
  ariaLabel?: string;
}

/** Accessible one-time-code input: N digit boxes with paste, auto-advance and
 *  backspace navigation. Numeric only. */
export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled,
  autoFocus,
  onComplete,
  ariaLabel = 'Verification code',
}: OtpInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  React.useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function commit(next: string) {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  }

  function setAt(i: number, digit: string) {
    const next = (value.slice(0, i) + digit + value.slice(i + 1)).slice(0, length);
    commit(next);
    if (digit && i < length - 1) refs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[i]) {
        setAt(i, '');
      } else if (i > 0) {
        refs.current[i - 1]?.focus();
        setAt(i - 1, '');
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < length - 1) {
      refs.current[i + 1]?.focus();
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = commit(e.clipboardData.getData('text'));
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div className="flex justify-center gap-2 sm:gap-2.5" onPaste={onPaste}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={`${ariaLabel} ${i + 1}`}
          onChange={(e) => setAt(i, e.target.value.replace(/\D/g, '').slice(-1))}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={(e) => e.currentTarget.select()}
          className={cn(
            'size-12 rounded-xl border border-input bg-background text-center font-mono text-xl font-semibold shadow-sm transition-colors',
            'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'disabled:cursor-not-allowed disabled:opacity-50',
            digit && 'border-primary/50 text-primary',
          )}
        />
      ))}
    </div>
  );
}
