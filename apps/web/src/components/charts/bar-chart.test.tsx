import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BarChart, type BarChartPoint } from './bar-chart';

const data: BarChartPoint[] = [
  { key: '2026-01-01', label: '1 Jan', value: 4 },
  { key: '2026-01-02', label: '2 Jan', value: 0 },
  { key: '2026-01-03', label: '3 Jan', value: 8 },
];

const describePoint = (label: string, value: number) => `${label}: ${value} sign-ups`;

describe('BarChart', () => {
  it('draws one bar per point, described for a screen reader', () => {
    const { container } = render(
      <BarChart
        data={data}
        ariaLabel="Sign-ups per day"
        emptyLabel="No data yet"
        describePoint={describePoint}
      />,
    );
    expect(screen.getByRole('img', { name: 'Sign-ups per day' })).toBeInTheDocument();
    expect(container.querySelectorAll('rect')).toHaveLength(3);
    expect(screen.getByText('1 Jan: 4 sign-ups')).toBeInTheDocument();
    expect(screen.getByText('3 Jan: 8 sign-ups')).toBeInTheDocument();
  });

  it('scales the bars against the tallest point', () => {
    const { container } = render(
      <BarChart
        data={data}
        ariaLabel="Sign-ups"
        emptyLabel="No data yet"
        describePoint={describePoint}
      />,
    );
    const [first, , third] = Array.from(container.querySelectorAll('rect'));
    const height = (rect: Element | undefined) => Number(rect!.getAttribute('height'));
    expect(height(third)).toBeCloseTo(132, 5);
    expect(height(first)).toBeCloseTo(66, 5);
  });

  it('keeps a faded stub for a zero, so the day stays on the axis', () => {
    const { container } = render(
      <BarChart
        data={data}
        ariaLabel="Sign-ups"
        emptyLabel="No data yet"
        describePoint={describePoint}
      />,
    );
    const zero = Array.from(container.querySelectorAll('rect'))[1];
    expect(zero).toHaveAttribute('height', '1');
    expect(zero).toHaveAttribute('opacity', '0.25');
  });

  it('does not collapse when every value is zero', () => {
    const { container } = render(
      <BarChart
        data={[{ key: 'a', label: 'A', value: 0 }]}
        ariaLabel="Sign-ups"
        emptyLabel="No data yet"
        describePoint={describePoint}
      />,
    );
    expect(container.querySelector('rect')).toHaveAttribute('height', '1');
  });

  it('labels the first and the last point under the chart', () => {
    render(
      <BarChart
        data={data}
        ariaLabel="Sign-ups"
        emptyLabel="No data yet"
        describePoint={describePoint}
      />,
    );
    const caption = screen.getByText('1 Jan').parentElement;
    expect(caption).toHaveTextContent('1 Jan');
    expect(caption).toHaveTextContent('3 Jan');
  });

  it('takes a colour token class from the caller', () => {
    const { container } = render(
      <BarChart
        data={data}
        ariaLabel="Sign-ups"
        emptyLabel="No data yet"
        describePoint={describePoint}
        className="h-24 w-full text-destructive"
      />,
    );
    expect(container.querySelector('svg')).toHaveClass('text-destructive');
  });

  it('says so plainly when there is nothing to draw', () => {
    render(
      <BarChart
        data={[]}
        ariaLabel="Sign-ups"
        emptyLabel="No data yet"
        describePoint={describePoint}
      />,
    );
    expect(screen.getByText('No data yet')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
