'use client';

import { useLocale, useTranslations } from 'next-intl';
import { BarChart } from '@/components/charts/bar-chart';
import { formatDayLabel } from './format';

/**
 * Signups per day, drawn by the shared `<BarChart>`.
 *
 * This file is only the adapter: it turns the API's `{ date, count }` series
 * into the chart's domain-free points and formats the axis labels for the
 * active locale. The drawing itself stays in `components/charts`, so the panel
 * does not grow a second chart implementation that drifts from the first.
 */
export interface SignupsChartProps {
  data: { date: string; count: number }[];
}

export function SignupsChart({ data }: SignupsChartProps) {
  const t = useTranslations('platform.overview');
  const locale = useLocale();

  return (
    <BarChart
      data={data.map((point) => ({
        key: point.date,
        label: formatDayLabel(point.date, locale),
        value: point.count,
      }))}
      ariaLabel={t('chartTitle')}
      emptyLabel={t('chartEmpty')}
      describePoint={(day, count) => t('chartPoint', { day, count })}
    />
  );
}
