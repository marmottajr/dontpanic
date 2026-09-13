'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PlanDto,
  PlanUsageDto,
  PlanUsageEntry,
  TenantAddress,
  TenantBrandingInput,
  TenantDto,
  UpdateTenantInput,
} from '@dontpanic/shared';
import { api } from '@/lib/api';

/**
 * The company as seen from its own settings screen: the public contract
 * (`tenantDtoSchema`) plus the address fields, which the API returns flattened
 * into the same object. Hence the intersection with `TenantAddress` instead of
 * a brand-new type, which would duplicate the contract.
 */
export type TenantSettings = TenantDto & Partial<TenantAddress>;

export const TENANT_QUERY_KEY = ['tenant'] as const;

/** The session's company. Fails quietly: the shell works without it. */
export function useTenant() {
  return useQuery({
    queryKey: TENANT_QUERY_KEY,
    queryFn: () => api<TenantSettings>('/tenants/me'),
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * The mutations below — and `useBranding`/`useUpdateBranding` — have no caller
 * in the boilerplate yet: the company settings screen is one of the screens a
 * product is expected to design for itself.
 *
 * They are kept rather than deleted because each one wraps a route that already
 * EXISTS and is tested (`PATCH /tenants/me`, `GET|PUT /tenants/me/branding`).
 * That is the difference between a hook and a promise: nothing here claims a
 * capability the API lacks, it just saves whoever builds that screen from
 * rediscovering the endpoints, the query keys and the cache invalidation. A
 * contract for a route that does not answer would be the other thing, and that
 * one gets deleted — see the note where the linked-accounts DTO used to be, in
 * @dontpanic/shared.
 */
export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTenantInput) =>
      api<TenantSettings>('/tenants/me', { method: 'PATCH', body: input }),
    onSuccess: (tenant) => qc.setQueryData(TENANT_QUERY_KEY, tenant),
  });
}

export const BRANDING_QUERY_KEY = ['tenant', 'branding'] as const;

export function useBranding() {
  return useQuery({
    queryKey: BRANDING_QUERY_KEY,
    queryFn: () => api<TenantBrandingInput>('/tenants/me/branding'),
    retry: false,
  });
}

export function useUpdateBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TenantBrandingInput) =>
      api<TenantBrandingInput>('/tenants/me/branding', { method: 'PUT', body: input }),
    onSuccess: (branding) => qc.setQueryData(BRANDING_QUERY_KEY, branding),
  });
}

export const PLAN_QUERY_KEY = ['tenant', 'plan'] as const;

/**
 * The contracted plan and its commercial fields.
 *
 * Separate from `usePlanUsage` on purpose: price, currency and trial length
 * describe what the company BOUGHT, while the usage counters describe what it
 * is spending. Screens almost always want one or the other, so they are two
 * routes and two cache entries rather than one fat object refetched whenever
 * either half moves. Fails quietly (`retry: false`): the shell renders without
 * the plan, it just stops being able to name it.
 */
export function usePlan() {
  return useQuery({
    queryKey: PLAN_QUERY_KEY,
    queryFn: () => api<PlanDto>('/tenants/me/plan'),
    retry: false,
  });
}

export const PLAN_USAGE_QUERY_KEY = ['tenant', 'plan-usage'] as const;

/**
 * How much of the plan is already spent.
 *
 * This is what lets a screen warn **before** the action fails on a limit — the
 * create button can explain that there is no seat left instead of letting the
 * user find out after filling in the form. Fails quietly (`retry: false`):
 * without these numbers the screens still work, they just stop anticipating the
 * limit.
 */
export function usePlanUsage() {
  return useQuery({
    queryKey: PLAN_USAGE_QUERY_KEY,
    queryFn: () => api<PlanUsageDto>('/tenants/me/plan-usage'),
    retry: false,
    staleTime: 60_000,
  });
}

/** No room for one more. A `null` limit means unlimited, and never runs out. */
export function isAtLimit(entry: PlanUsageEntry | undefined): boolean {
  return entry?.limit != null && entry.used >= entry.limit;
}
