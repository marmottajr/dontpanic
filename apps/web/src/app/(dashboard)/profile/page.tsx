'use client';

import { useTranslations } from 'next-intl';
import { useUser } from '@/hooks/use-auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { AvatarCard } from '@/components/profile/avatar-card';
import { NameCard } from '@/components/profile/name-card';
import { EmailCard } from '@/components/profile/email-card';
import { PasswordCard } from '@/components/profile/password-card';
import { TwoFactorCard } from '@/components/profile/two-factor-card';
import { SessionsCard } from '@/components/profile/sessions-card';
import { DangerCard } from '@/components/profile/danger-card';

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

export default function ProfilePage() {
  const t = useTranslations('profile');
  const { data: user, isLoading } = useUser();

  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="font-mono text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {isLoading || !user ? (
        <ProfileSkeleton />
      ) : (
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="general" className="flex-1 sm:flex-none">
              {t('tabs.general')}
            </TabsTrigger>
            <TabsTrigger value="security" className="flex-1 sm:flex-none">
              {t('tabs.security')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <AvatarCard user={user} />
            <NameCard user={user} />
            <EmailCard user={user} />
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <PasswordCard />
            <Separator />
            <TwoFactorCard user={user} />
            <Separator />
            <SessionsCard />
            <Separator />
            <DangerCard />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
