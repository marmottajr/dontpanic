import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FlagIcon } from './flags';
import { localeMeta } from '@/i18n/locales';

describe('FlagIcon', () => {
  it('renders the Brazil flag for pt-BR with an accessible label', () => {
    render(<FlagIcon locale="pt-BR" />);
    const flag = screen.getByRole('img', { name: localeMeta['pt-BR'].label });
    expect(flag).toBeInTheDocument();
    expect(flag.querySelector('svg')).toBeTruthy();
  });

  it('renders the US flag for en-US', () => {
    render(<FlagIcon locale="en-US" />);
    expect(screen.getByRole('img', { name: localeMeta['en-US'].label })).toBeInTheDocument();
  });

  it('applies a custom className and falls back to the locale code as label', () => {
    // @ts-expect-error — exercising the defensive fallback for an unknown locale
    render(<FlagIcon locale="xx-XX" className="size-10" />);
    expect(screen.getByRole('img', { name: 'xx-XX' })).toBeInTheDocument();
  });
});
