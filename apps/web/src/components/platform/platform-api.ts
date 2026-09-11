'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangePlanInput,
  ExtendTrialInput,
  Paginated,
  PlanDto,
  PlatformStatsDto,
  PlatformTenantDto,
  SuspendTenantInput,
  TenantStatus,
  UpsertPlanInput,
} from '@dontpanic/shared';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/hooks/use-auth';

/**
 * The panel's single point of contact with the API.
 *
 * Every path lives here on purpose: if one of them changes, it changes in this
 * file and nowhere else. The prefix is `/platform` (not `/admin`) because
 * `/api/admin/*` is already the administration **inside** one company — see
 * PlatformController.
 */
export const PLATFORM_ROUTES = {
  stats: '/platform/stats',
  tenants: '/platform/tenants',
  tenant: (id: string) => `/platform/tenants/${id}`,
  suspend: (id: string) => `/platform/tenants/${id}/suspend`,
  reactivate: (id: string) => `/platform/tenants/${id}/reactivate`,
  extendTrial: (id: string) => `/platform/tenants/${id}/extend-trial`,
  changePlan: (id: string) => `/platform/tenants/${id}/plan`,
  plans: '/platform/plans',
  plan: (id: string) => `/platform/plans/${id}`,
} as const;

/** Where someone who does not belong in the panel is sent. */
export const PLATFORM_FALLBACK = '/';

export interface PlatformTenantFilters {
  page: number;
  limit: number;
  search?: string;
  status?: TenantStatus | '';
}

export function buildTenantsQuery(filters: PlatformTenantFilters): string {
  const params = new URLSearchParams();
  params.set('page', String(filters.page));
  params.set('limit', String(filters.limit));
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  return `${PLATFORM_ROUTES.tenants}?${params.toString()}`;
}

/**
 * The API answers **404** (not 403) to anyone who is not a superadmin, so the
 * panel's existence is confirmed to nobody. The panel mirrors that: a 404 is
 * treated as "this page does not exist".
 */
export function isPlatformDenied(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * The panel's doorman. Anyone who is not SUPERADMIN is sent to the company
 * dashboard with no message at all — nothing in the response distinguishes
 * "you have no access" from "there is nothing here".
 */
export function usePlatformAccess(): { allowed: boolean; checking: boolean } {
  const router = useRouter();
  const { data: me, isLoading, isError } = useUser();
  const allowed = me?.role === 'SUPERADMIN';

  useEffect(() => {
    if (isLoading) return;
    if (isError) {
      router.replace('/login');
      return;
    }
    if (!allowed) router.replace(PLATFORM_FALLBACK);
  }, [allowed, isError, isLoading, router]);

  return { allowed, checking: isLoading };
}

/** A 404 from any of the panel's queries sends the user away. */
export function usePlatformDeniedRedirect(error: unknown): void {
  const router = useRouter();
  useEffect(() => {
    if (isPlatformDenied(error)) router.replace(PLATFORM_FALLBACK);
  }, [error, router]);
}

// ── Queries ─────────────────────────────────────────────────────────────────

export function usePlatformStats(enabled: boolean) {
  return useQuery({
    queryKey: ['platform', 'stats'],
    queryFn: () => api<PlatformStatsDto>(PLATFORM_ROUTES.stats),
    enabled,
    retry: false,
  });
}

export function usePlatformTenants(filters: PlatformTenantFilters, enabled: boolean) {
  return useQuery({
    queryKey: ['platform', 'tenants', filters],
    queryFn: () => api<Paginated<PlatformTenantDto>>(buildTenantsQuery(filters)),
    enabled,
    retry: false,
  });
}

export function usePlatformTenant(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['platform', 'tenant', id],
    queryFn: () => api<PlatformTenantDto>(PLATFORM_ROUTES.tenant(id)),
    enabled,
    retry: false,
  });
}

export function usePlatformPlans(enabled: boolean) {
  return useQuery({
    queryKey: ['platform', 'plans'],
    queryFn: () => api<PlanDto[]>(PLATFORM_ROUTES.plans),
    enabled,
    retry: false,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

function useInvalidatePlatform() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['platform'] });
  };
}

export function useSuspendTenant() {
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SuspendTenantInput }) =>
      api<PlatformTenantDto>(PLATFORM_ROUTES.suspend(id), { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useReactivateTenant() {
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: (id: string) =>
      api<PlatformTenantDto>(PLATFORM_ROUTES.reactivate(id), { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useExtendTrial() {
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ExtendTrialInput }) =>
      api<PlatformTenantDto>(PLATFORM_ROUTES.extendTrial(id), { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useChangeTenantPlan() {
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ChangePlanInput }) =>
      api<PlatformTenantDto>(PLATFORM_ROUTES.changePlan(id), { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useCreatePlan() {
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: (input: UpsertPlanInput) =>
      api<PlanDto>(PLATFORM_ROUTES.plans, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdatePlan() {
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpsertPlanInput }) =>
      api<PlanDto>(PLATFORM_ROUTES.plan(id), { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}
