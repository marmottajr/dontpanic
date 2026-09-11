import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const apiMock = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

import {
  BRANDING_QUERY_KEY,
  PLAN_QUERY_KEY,
  PLAN_USAGE_QUERY_KEY,
  TENANT_QUERY_KEY,
  isAtLimit,
  useBranding,
  usePlan,
  usePlanUsage,
  useTenant,
  useUpdateBranding,
  useUpdateTenant,
} from './use-tenant';

function harness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

beforeEach(() => apiMock.mockReset());

describe('tenant queries', () => {
  it('reads the session’s company', async () => {
    apiMock.mockResolvedValue({ id: 't1', name: 'Acme' });
    const { wrapper } = harness();
    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ id: 't1', name: 'Acme' }));
    expect(apiMock).toHaveBeenCalledWith('/tenants/me');
  });

  it('reads branding and the plan without retrying', async () => {
    apiMock.mockResolvedValue({ primaryColor: '#112233' });
    const { wrapper } = harness();
    const branding = renderHook(() => useBranding(), { wrapper });
    await waitFor(() => expect(branding.result.current.data).toBeTruthy());
    expect(apiMock).toHaveBeenCalledWith('/tenants/me/branding');

    apiMock.mockResolvedValue({ id: 'p1', code: 'pro' });
    const plan = renderHook(() => usePlan(), { wrapper });
    await waitFor(() => expect(plan.result.current.data).toBeTruthy());
    expect(apiMock).toHaveBeenCalledWith('/tenants/me/plan');
  });

  it('reads how much of the plan is spent', async () => {
    apiMock.mockResolvedValue({ planCode: 'pro', users: { used: 2, limit: 5 } });
    const { wrapper } = harness();
    const { result } = renderHook(() => usePlanUsage(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(apiMock).toHaveBeenCalledWith('/tenants/me/plan-usage');
  });

  it('keeps the query keys stable — other screens invalidate by them', () => {
    expect(TENANT_QUERY_KEY).toEqual(['tenant']);
    expect(BRANDING_QUERY_KEY).toEqual(['tenant', 'branding']);
    expect(PLAN_QUERY_KEY).toEqual(['tenant', 'plan']);
    expect(PLAN_USAGE_QUERY_KEY).toEqual(['tenant', 'plan-usage']);
  });
});

describe('tenant mutations', () => {
  it('writes the updated company straight into the cache', async () => {
    const updated = { id: 't1', name: 'Acme Two' };
    apiMock.mockResolvedValue(updated);
    const { qc, wrapper } = harness();
    const { result } = renderHook(() => useUpdateTenant(), { wrapper });

    result.current.mutate({ name: 'Acme Two' });

    await waitFor(() => expect(qc.getQueryData(TENANT_QUERY_KEY)).toEqual(updated));
    expect(apiMock).toHaveBeenCalledWith('/tenants/me', {
      method: 'PATCH',
      body: { name: 'Acme Two' },
    });
  });

  it('saves branding with PUT and caches the result', async () => {
    const branding = { primaryColor: '#000000', secondaryColor: '#ffffff' };
    apiMock.mockResolvedValue(branding);
    const { qc, wrapper } = harness();
    const { result } = renderHook(() => useUpdateBranding(), { wrapper });

    result.current.mutate(branding);

    await waitFor(() => expect(qc.getQueryData(BRANDING_QUERY_KEY)).toEqual(branding));
    expect(apiMock).toHaveBeenCalledWith('/tenants/me/branding', {
      method: 'PUT',
      body: branding,
    });
  });
});

describe('isAtLimit', () => {
  it('is false when the limit is null — unlimited never runs out', () => {
    expect(isAtLimit({ used: 9_999, limit: null })).toBe(false);
  });

  it('is false while there is room, true once the seat is taken', () => {
    expect(isAtLimit({ used: 4, limit: 5 })).toBe(false);
    expect(isAtLimit({ used: 5, limit: 5 })).toBe(true);
    expect(isAtLimit({ used: 6, limit: 5 })).toBe(true);
  });

  it('is false when the counter is not known yet', () => {
    expect(isAtLimit(undefined)).toBe(false);
  });
});
