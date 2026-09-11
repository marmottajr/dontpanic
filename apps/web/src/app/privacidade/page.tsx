import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/legal/legal-page';
import { PRIVACY } from '@/components/legal/privacy-content';

export const metadata: Metadata = { title: 'Política de Privacidade' };

export default async function PrivacyPage() {
  const t = await getTranslations('legal.page');
  return <LegalPage document={PRIVACY} otherHref="/termos" otherLabel={t('termsLink')} />;
}
