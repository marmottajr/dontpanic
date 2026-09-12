'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  createInvitationSchema,
  type CreateInvitationInput,
  type ProfileOption,
} from '@dontpanic/shared';
import { api, ApiError } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Inviting a colleague — what replaced "create user with a password".
 *
 * An administrator typing someone else's first password means the credential
 * exists in a second head (and usually in a chat message) before its owner ever
 * sees it, and it proves nothing about the address. An invitation inverts both:
 * the invitee chooses the secret, and accepting the mail is what proves they
 * read it. The API dropped the password path, so the screen does too.
 *
 * Validation is the shared `createInvitationSchema` via `safeParse`, the same
 * way `PlanFormDialog` does it: the dialog cannot send what the API refuses.
 */

/**
 * A permission profile, as the invite dialog needs it.
 *
 * Declared locally because the frozen contracts carry no profile-listing DTO —
 * `createInvitationSchema` takes a `profileId` but nothing describes where the
 * ids come from. `GET /admin/profiles` supplies them, and the select still
 * degrades rather than blocks: if the listing fails the field is left out and
 * the invitation goes with no profile, so the tenant default applies and an
 * administrator can adjust it afterwards. An invite that cannot be sent because
 * a dropdown would not load is the worse outcome.
 */

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring';

interface FormState {
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
  profileId: string;
}

const EMPTY: FormState = { email: '', name: '', role: 'USER', profileId: '' };

export interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteUserDialog({ open, onOpenChange }: InviteUserDialogProps) {
  const t = useTranslations('admin.invite');
  const tc = useTranslations('common');
  const tErr = useTranslations('errors');
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setError(null);
  }, [open]);

  const profiles = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: () => api<ProfileOption[]>('/admin/profiles'),
    // Only while the dialog is up, and never retried: the field is optional, so
    // a failure costs one request and a missing dropdown, not four attempts and
    // a spinner over a form the user could have submitted already.
    enabled: open,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const profileOptions = profiles.data ?? [];

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const invite = useMutation({
    mutationFn: (input: CreateInvitationInput) =>
      api('/admin/invitations', { method: 'POST', body: input }),
    onSuccess: () => {
      toast.success(t('sent'));
      void qc.invalidateQueries({ queryKey: ['admin-invitations'] });
      onOpenChange(false);
    },
    onError: (err) => {
      // 409 is the one the administrator can act on: there is already a person
      // or a pending invitation for that address.
      if (err instanceof ApiError && err.status === 409) {
        setError(t('duplicate'));
        return;
      }
      toast.error(err instanceof ApiError ? err.message : tErr('generic'));
    },
  });

  const submit = () => {
    const parsed = createInvitationSchema.safeParse({
      email: form.email.trim(),
      // Blank means "no courtesy name", not an empty one the accept form would
      // pre-fill with nothing.
      ...(form.name.trim() === '' ? {} : { name: form.name.trim() }),
      role: form.role,
      profileId: form.profileId === '' ? null : form.profileId,
    });
    if (!parsed.success) {
      setError(t('invalid'));
      return;
    }
    setError(null);
    invite.mutate(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="invite-email">{tc('email')}</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-name">
              {tc('name')} <span className="text-muted-foreground">({tc('optional')})</span>
            </Label>
            <Input
              id="invite-name"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('nameHint')}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-role">{t('role')}</Label>
            <select
              id="invite-role"
              className={selectClass}
              value={form.role}
              onChange={(event) => set('role', event.target.value as FormState['role'])}
            >
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          {profileOptions.length > 0 ? (
            <div className="grid gap-2">
              <Label htmlFor="invite-profile">
                {t('profile')} <span className="text-muted-foreground">({tc('optional')})</span>
              </Label>
              <select
                id="invite-profile"
                className={selectClass}
                value={form.profileId}
                onChange={(event) => set('profileId', event.target.value)}
              >
                <option value="">{t('profileDefault')}</option>
                {profileOptions.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">{t('explainer')}</p>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={invite.isPending}>
            {tc('cancel')}
          </Button>
          <Button onClick={submit} disabled={invite.isPending}>
            {invite.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
