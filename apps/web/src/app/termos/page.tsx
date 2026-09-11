import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/legal/legal-page';
import { TERMS } from '@/components/legal/terms-content';

export const metadata: Metadata = { title: 'Termos de Uso' };

export default async function TermsPage() {
  const t = await getTranslations('legal.page');
  return <LegalPage document={TERMS} otherHref="/privacidade" otherLabel={t('privacyLink')} />;
}
