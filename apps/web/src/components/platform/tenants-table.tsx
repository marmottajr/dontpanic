'use client';

import { useLocale, useTranslations } from 'next-intl';
import { CalendarPlus, Ban, RefreshCw, Tag } from 'lucide-react';
import { tenantStatuses, type PlatformTenantDto, type TenantStatus } from '@dontpanic/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TenantStatusBadge } from './tenant-status-badge';
import { formatDate, formatNumber } from './format';

/**
 * The companies table of the platform panel.
 *
 * A controlled component: the filters live in the page (which turns them into a
 * query string) and the table only displays them and reports changes. That is
 * what makes the table testable without a network.
 *
 * It shows metrics — never the contents of a company's records.
 */
export interface TenantsTableProps {
  rows: PlatformTenantDto[];
  loading?: boolean;
  search: string;
  status: TenantStatus | '';
  onSearchChange: (value: string) => void;
  onStatusChange: (value: TenantStatus | '') => void;
  onSuspend: (row: PlatformTenantDto) => void;
  onReactivate: (row: PlatformTenantDto) => void;
  onChangePlan: (row: PlatformTenantDto) => void;
  onExtendTrial: (row: PlatformTenantDto) => void;
}

const selectClass =
  'h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring';

export function TenantsTable({
  rows,
  loading = false,
  search,
  status,
  onSearchChange,
  onStatusChange,
  onSuspend,
  onReactivate,
  onChangePlan,
  onExtendTrial,
}: TenantsTableProps) {
  const t = useTranslations('platform.tenants');
  const tStatus = useTranslations('platform.status');
  const tc = useTranslations('common');
  const locale = useLocale();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
          <label htmlFor="platform-tenant-search" className="text-xs text-muted-foreground">
            {t('searchLabel')}
          </label>
          <Input
            id="platform-tenant-search"
            value={search}
            placeholder={t('searchPlaceholder')}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="platform-tenant-status" className="text-xs text-muted-foreground">
            {t('filterStatus')}
          </label>
          <select
            id="platform-tenant-status"
            className={selectClass}
            value={status}
            onChange={(event) => onStatusChange(event.target.value as TenantStatus | '')}
          >
            <option value="">{t('allStatuses')}</option>
            {tenantStatuses.map((value) => (
              <option key={value} value={value}>
                {tStatus(value)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('tableCaption')}</caption>
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colCompany')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colPlan')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colStatus')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colUsers')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colTrialEnds')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('colCreated')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('colActions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {tc('loading')}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {t('empty')}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">/{row.slug}</div>
                    <div className="font-mono text-xs text-muted-foreground">{row.email}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.planName ?? t('noPlan')}</td>
                  <td className="px-4 py-3">
                    <TenantStatusBadge status={row.status} />
                    {/* The reason is the only thing that explains a suspension
                        after the fact — the operator who reads this table is
                        rarely the one who typed it. */}
                    {row.suspendedReason ? (
                      <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                        {row.suspendedReason}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(row.userCount, locale)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(row.trialEndsAt, locale) ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(row.createdAt, locale)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('changePlan', { name: row.name })}
                        onClick={() => onChangePlan(row)}
                      >
                        <Tag className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={row.status !== 'TRIAL'}
                        aria-label={t('extendTrial', { name: row.name })}
                        onClick={() => onExtendTrial(row)}
                      >
                        <CalendarPlus className="size-4" />
                      </Button>
                      {row.status === 'SUSPENDED' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t('reactivate', { name: row.name })}
                          onClick={() => onReactivate(row)}
                        >
                          <RefreshCw className="size-4 text-primary" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={row.status === 'CANCELED'}
                          aria-label={t('suspend', { name: row.name })}
                          onClick={() => onSuspend(row)}
                        >
                          <Ban className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
