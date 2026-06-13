'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useUser, useLogout } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Turn a display name (or email local-part) into up to 2 uppercase initials. */
function initials(name: string, email: string) {
  const source = name.trim() || email.split('@')[0] || '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2)) ?? '';
  return letters.toUpperCase() || '42';
}

export function UserMenu() {
  const t = useTranslations('nav');
  const { data: user, isLoading } = useUser();
  const logout = useLogout();

  if (isLoading || !user) {
    return <Skeleton className="size-9 rounded-full" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label={user.name || user.email}
        >
          <Avatar className="size-9 border border-border">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
            <AvatarFallback className="bg-primary/10 text-primary">
              {initials(user.name, user.email)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
            <span className="truncate font-mono text-xs text-muted-foreground">{user.email}</span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserIcon className="size-4" />
            {t('profile')}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={() => logout.mutate()}
          disabled={logout.isPending}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="size-4" />
          {t('logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
