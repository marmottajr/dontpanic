import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));

const apiMock = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

import { ApiError } from '@/lib/api';
import {
  PLATFORM_FALLBACK,
  PLATFORM_ROUTES,
  buildTenantsQuery,
  isPlatformDenied,
  useChangeTenantPlan,
  useCreatePlan,
  useCreateTenant,
  useExtendTrial,
  usePlatformAccess,
  usePlatformDeniedRedirect,
  usePlatformPlans,
  usePlatformStats,
  usePlatformTenant,
  usePlatformTenants,
  useReactivateTenant,
  useSuspendTenant,
  useUpdatePlan,
} from './platform-api';

function harness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

beforeEach(() => {
  apiMock.mockReset();
  replace.mockReset();
});

describe('PLATFORM_ROUTES', () => {
  it('keeps every path under /platform, never /admin', () => {
    const paths = [
      PLATFORM_ROUTES.stats,
      PLATFORM_ROUTES.tenants,
      PLATFORM_ROUTES.tenant('t1'),
      PLATFORM_ROUTES.suspend('t1'),
      PLATFORM_ROUTES.reactivate('t1'),
      PLATFORM_ROUTES.extendTrial('t1'),
      PLATFORM_ROUTES.changePlan('t1'),
      PLATFORM_ROUTES.plans,
      PLATFORM_ROUTES.plan('p1'),
    ];
    for (const path of paths) expect(path.startsWith('/platform')).toBe(true);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('buildTenantsQuery', () => {
  it('always carries the page window', () => {
    expect(buildTenantsQuery({ page: 2, limit: 20 })).toBe('/platform/tenants?page=2&limit=20');
  });

  it('omits empty filters instead of sending blanks the API would have to ignore', () => {
    expect(buildTenantsQuery({ page: 1, limit: 20, search: '', status: '' })).toBe(
      '/platform/tenants?page=1&limit=20',
    );
  });

  it('encodes what the operator typed', () => {
    expect(buildTenantsQuery({ page: 1, limit: 20, search: 'a b&c', status: 'TRIAL' })).toBe(
      '/platform/tenants?page=1&limit=20&search=a+b%26c&status=TRIAL',
    );
  });
});

describe('isPlatformDenied', () => {
  it('reads a 404 as the panel denying its own existence', () => {
    expect(isPlatformDenied(new ApiError(404, null))).toBe(true);
  });

  it('is not fooled by other failures', () => {
    expect(isPlatformDenied(new ApiError(403, null))).toBe(false);
    expect(isPlatformDenied(new ApiError(500, null))).toBe(false);
    expect(isPlatformDenied(new Error('offline'))).toBe(false);
    expect(isPlatformDenied(undefined)).toBe(false);
  });
});

describe('usePlatformAccess', () => {
  it('waits without deciding while the user is still loading', async () => {
    apiMock.mockReturnValue(new Promise(() => {}));
    const { wrapper } = harness();
    const { result } = renderHook(() => usePlatformAccess(), { wrapper });

    expect(result.current.checking).toBe(true);
    expect(result.current.allowed).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it('lets a SUPERADMIN in and redirects nobody', async () => {
    apiMock.mockResolvedValue({ id: 'u1', role: 'SUPERADMIN' });
    const { wrapper } = harness();
    const { result } = renderHook(() => usePlatformAccess(), { wrapper });

    await waitFor(() => expect(result.current.allowed).toBe(true));
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends any other role away without a word about why', async () => {
    apiMock.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
    const { wrapper } = harness();
    const { result } = renderHook(() => usePlatformAccess(), { wrapper });

    await waitFor(() => expect(replace).toHaveBeenCalledWith(PLATFORM_FALLBACK));
    expect(result.current.allowed).toBe(false);
  });

  it('sends an unauthenticated visitor to the login screen', async () => {
    apiMock.mockRejectedValue(new ApiError(401, null));
    const { wrapper } = harness();
    renderHook(() => usePlatformAccess(), { wrapper });

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });
});

describe('usePlatformDeniedRedirect', () => {
  it('leaves the page alone while nothing has failed', () => {
    const { wrapper } = harness();
    renderHook(() => usePlatformDeniedRedirect(undefined), { wrapper });
    expect(replace).not.toHaveBeenCalled();
  });

  it('leaves on a 404 from any of the panel’s queries', async () => {
    const { wrapper } = harness();
    renderHook(() => usePlatformDeniedRedirect(new ApiError(404, null)), { wrapper });
    await waitFor(() => expect(replace).toHaveBeenCalledWith(PLATFORM_FALLBACK));
  });

  it('stays put on an ordinary server error', () => {
    const { wrapper } = harness();
    renderHook(() => usePlatformDeniedRedirect(new ApiError(500, null)), { wrapper });
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('platform queries', () => {
  it('does not touch the network until access is confirmed', () => {
    const { wrapper } = harness();
    renderHook(() => usePlatformStats(false), { wrapper });
    renderHook(() => usePlatformPlans(false), { wrapper });
    renderHook(() => usePlatformTenants({ page: 1, limit: 20 }, false), { wrapper });
    renderHook(() => usePlatformTenant('t1', false), { wrapper });

    expect(apiMock).not.toHaveBeenCalled();
  });

  it('reads the platform-wide statistics', async () => {
    apiMock.mockResolvedValue({ totalTenants: 3 });
    const { wrapper } = harness();
    const { result } = renderHook(() => usePlatformStats(true), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ totalTenants: 3 }));
    expect(apiMock).toHaveBeenCalledWith(PLATFORM_ROUTES.stats);
  });

  it('reads a page of companies through the built query', async () => {
    apiMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    const { wrapper } = harness();
    const { result } = renderHook(
      () => usePlatformTenants({ page: 1, limit: 20, status: 'ACTIVE' }, true),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(apiMock).toHaveBeenCalledWith('/platform/tenants?page=1&limit=20&status=ACTIVE');
  });

  it('reads one company and the plan catalogue', async () => {
    apiMock.mockResolvedValue({ id: 't1' });
    const { wrapper } = harness();
    const tenant = renderHook(() => usePlatformTenant('t1', true), { wrapper });
    await waitFor(() => expect(tenant.result.current.data).toBeTruthy());
    expect(apiMock).toHaveBeenCalledWith(PLATFORM_ROUTES.tenant('t1'));

    apiMock.mockResolvedValue([{ id: 'p1' }]);
    const plans = renderHook(() => usePlatformPlans(true), { wrapper });
    await waitFor(() => expect(plans.result.current.data).toBeTruthy());
    expect(apiMock).toHaveBeenCalledWith(PLATFORM_ROUTES.plans);
  });
});

describe('platform mutations', () => {
  // Every case below asserts the same thing twice over: the right request went
  // out, AND the panel was invalidated afterwards. Without the second half the
  // table keeps showing the state from before the action.

  it('suspends with the reason the operator typed', async () => {
    const { qc, wrapper } = harness();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    apiMock.mockResolvedValue({ id: 't1' });
    const { result } = renderHook(() => useSuspendTenant(), { wrapper });

    result.current.mutate({ id: 't1', input: { reason: 'abuse' } });

    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['platform'] }));
    expect(apiMock).toHaveBeenCalledWith(PLATFORM_ROUTES.suspend('t1'), {
      method: 'POST',
      body: { reason: 'abuse' },
    });
  });

  it('reactivates without a body — there is nothing to say', async () => {
    const { qc, wrapper } = harness();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    apiMock.mockResolvedValue({ id: 't1' });
    const { result } = renderHook(() => useReactivateTenant(), { wrapper });

    result.current.mutate('t1');

    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['platform'] }));
    expect(apiMock).toHaveBeenCalledWith(PLATFORM_ROUTES.reactivate('t1'), { method: 'POST' });
  });

  it('extends a trial by a number of days', async () => {
    const { qc, wrapper } = harness();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    apiMock.mockResolvedValue({ id: 't1' });
    const { result } = renderHook(() => useExtendTrial(), { wrapper });

    result.current.mutate({ id: 't1', input: { days: 30 } });

    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['platform'] }));
    expect(apiMock).toHaveBeenCalledWith(PLATFORM_ROUTES.extendTrial('t1'), {
      method: 'POST',
      body: { days: 30 },
    });
  });

  it('moves a company to another plan', async () => {
    const { qc, wrapper } = harness();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    apiMock.mockResolvedValue({ id: 't1' });
    const { result } = renderHook(() => useChangeTenantPlan(), { wrapper });

    result.current.mutate({ id: 't1', input: { planId: 'p2' } });

    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['platform'] }));
    expect(apiMock).toHaveBeenCalledWith(PLATFORM_ROUTES.changePlan('t1'), {
      method: 'POST',
      body: { planId: 'p2' },
    });
  });

  it('creates a company by POSTing to the same collection it lists', async () => {
    const input = {
      companyName: 'Sirius Cybernetics',
      slug: 'sirius-cybernetics',
      email: 'contato@sirius.example',
      status: 'TRIAL' as const,
      adminEmail: 'arthur@sirius.example',
      adminName: 'Arthur Dent',
      sendInvitation: true,
    };
    const { qc, wrapper } = harness();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    apiMock.mockResolvedValue({ tenant: { id: 't1' }, invitationSent: true });

    const { result } = renderHook(() => useCreateTenant(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['platform'] }));
    expect(apiMock).toHaveBeenCalledWith(PLATFORM_ROUTES.tenants, { method: 'POST', body: input });
  });

  it('creates a plan with POST and updates one with PATCH', async () => {
    const input = {
      code: 'pro',
      name: 'Pro',
      priceCents: 9900,
      currency: 'USD',
      trialDays: 14,
    };
    const { qc, wrapper } = harness();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    apiMock.mockResolvedValue({ id: 'p1' });

    const create = renderHook(() => useCreatePlan(), { wrapper });
    create.result.current.mutate(input);
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['platform'] }));
    expect(apiMock).toHaveBeenCalledWith(PLATFORM_ROUTES.plans, { method: 'POST', body: input });

    const update = renderHook(() => useUpdatePlan(), { wrapper });
    update.result.current.mutate({ id: 'p1', input });
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(PLATFORM_ROUTES.plan('p1'), {
        method: 'PATCH',
        body: input,
      }),
    );
  });

  it('leaves the cache alone when the request fails', async () => {
    const { qc, wrapper } = harness();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    apiMock.mockRejectedValue(new ApiError(400, null));
    const { result } = renderHook(() => useSuspendTenant(), { wrapper });

    result.current.mutate({ id: 't1', input: { reason: 'abuse' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(spy).not.toHaveBeenCalled();
  });
});
