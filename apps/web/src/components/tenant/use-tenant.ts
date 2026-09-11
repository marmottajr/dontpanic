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
 * The contracted plan and its limits.
 *
 * The API does not expose this route yet — `/tenants/me/plan-usage` carries the
 * numbers the screens actually need today. The query is kept because the plan's
 * commercial fields (price, trial length) belong here rather than in the usage
 * counters, and it fails quietly (`retry: false`) so a screen that asks for it
 * before the route exists renders without it instead of breaking.
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
