'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Label + control + error, always with the same anatomy and the same spacing. */
export function Field({
  id,
  label,
  error,
  hint,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Input that applies a mask on every keystroke. It stays uncontrolled (so
 * react-hook-form's `register` keeps the wheel), which is why the value is
 * rewritten on the event itself before it is handed over — the shared contract
 * strips the mask again at validation time.
 */
export function MaskedInput({
  mask,
  onChange,
  ...props
}: React.ComponentProps<'input'> & { mask: (value: string) => string }) {
  return (
    <Input
      {...props}
      onChange={(event) => {
        event.target.value = mask(event.target.value);
        onChange?.(event);
      }}
    />
  );
}

/** Native `<select>` wearing the system tokens — fast on the keyboard, no new dependency. */
export function SelectInput({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/30',
        className,
      )}
      {...props}
    />
  );
}

/** Textarea with the same tokens as `Input`. */
export function TextareaInput({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/30',
        className,
      )}
      {...props}
    />
  );
}

/** A titled block of fields — it splits long forms without breaking them into pages. */
export function FieldSet({
  legend,
  children,
  className,
}: {
  legend: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn('space-y-3', className)}>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}
