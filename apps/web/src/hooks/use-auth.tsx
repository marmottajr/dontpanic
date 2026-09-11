'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type {
  ChangePasswordInput,
  LoginInput,
  LoginResponse,
  SignupInput,
  SignupResponse,
  UpdateProfileInput,
  UserDto,
} from '@dontpanic/shared';

export function useUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<UserDto>('/users/me'),
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api<LoginResponse>('/auth/login', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

/**
 * Self-serve signup creates the company and its first administrator in one go —
 * there is no public way to create a user without a company.
 */
export function useSignup() {
  return useMutation({
    mutationFn: (input: SignupInput) =>
      api<SignupResponse>('/auth/signup', { method: 'POST', body: input }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear();
      router.replace('/login');
      router.refresh();
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      api<UserDto>('/users/me', { method: 'PATCH', body: input }),
    onSuccess: (user) => qc.setQueryData(['me'], user),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      api('/users/me/password', { method: 'PATCH', body: input }),
  });
}
