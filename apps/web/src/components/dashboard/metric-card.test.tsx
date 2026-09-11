import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ptBR from '../../../messages/pt-BR.json';

// next-intl needs a provider tree we do not want in a unit test: resolve the
// keys straight out of the real pt-BR catalogue so the test still fails if a
// key goes missing.
vi.mock('next-intl', () => ({
  useLocale: () => 'pt-BR',
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) => {
    const path = `${namespace}.${key}`.split('.');
    const message = path.reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      ptBR,
    );
    if (typeof message !== 'string') throw new Error(`missing message: ${path.join('.')}`);
    return message.replace(/\{(\w+)\}/g, (_, name: string) => values?.[name] ?? '');
  },
}));

import { MetricCard, VariationTag } from './metric-card';

describe('MetricCard', () => {
  it('shows label and value, and keeps a currency value on one line', () => {
    render(<MetricCard label="Revenue" value="R$ 694.130,01" />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('R$ 694.130,01')).toHaveClass('whitespace-nowrap', 'tabular-nums');
  });

  it('paints the alert tone on the number the owner has to see first', () => {
    const { container } = render(<MetricCard label="Overdue" value="R$ 1.200,00" tone="alert" />);
    expect(screen.getByText('R$ 1.200,00')).toHaveClass('text-destructive');
    expect(container.firstElementChild).toHaveClass('border-destructive/40');
  });

  it('paints the positive tone without changing the card border', () => {
    const { container } = render(<MetricCard label="Paid" value="R$ 9,00" tone="positive" />);
    expect(screen.getByText('R$ 9,00')).toHaveClass('text-primary');
    expect(container.firstElementChild).toHaveClass('border-border');
  });

  it('renders hint and footer when they are given', () => {
    render(
      <MetricCard
        label="Events"
        value="12"
        hint="this month"
        footer={<button type="button">See all</button>}
      />,
    );
    expect(screen.getByText('this month')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See all' })).toBeInTheDocument();
  });

  it('shows no variation tag when there is no comparison', () => {
    const { container } = render(<MetricCard label="Events" value="12" variation={null} />);
    expect(container.textContent).not.toContain('mês anterior');
  });

  it('shows the variation tag when there is one', () => {
    render(
      <MetricCard
        label="Revenue"
        value="R$ 10,00"
        variation={{ direction: 'up', percent: '15.5' }}
      />,
    );
    expect(screen.getByText('+15,5%')).toBeInTheDocument();
    expect(screen.getByText('vs. mês anterior')).toBeInTheDocument();
  });
});

describe('VariationTag', () => {
  it('marks a rise in the positive token', () => {
    const { container } = render(<VariationTag variation={{ direction: 'up', percent: '15.5' }} />);
    expect(screen.getByText('+15,5%')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('text-primary');
  });

  it('marks a fall in the destructive token, with an explicit minus sign', () => {
    const { container } = render(
      <VariationTag variation={{ direction: 'down', percent: '25.0' }} />,
    );
    expect(screen.getByText('−25%')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('text-destructive');
  });

  it('keeps a flat month muted and unsigned', () => {
    const { container } = render(
      <VariationTag variation={{ direction: 'flat', percent: '0.0' }} />,
    );
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('text-muted-foreground');
  });
});
