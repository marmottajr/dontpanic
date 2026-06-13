import { z } from 'zod';

type Translate = (key: string, values?: Record<string, string | number>) => string;

interface RawIssue {
  code: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  origin?: string;
  format?: string;
}

/**
 * Localise Zod validation messages to the active language. Set on the CLIENT
 * only (see Providers) so form errors come out translated instead of Zod's
 * English defaults. The shared schemas carry NO hardcoded messages, so this map
 * governs what the user sees. Maps the common issue codes to the `validation.*`
 * i18n catalog; unmapped codes fall through to Zod's default.
 */
export function applyZodI18n(t: Translate): void {
  const customError: NonNullable<Parameters<typeof z.config>[0]>['customError'] = (issue) => {
    const i = issue as unknown as RawIssue;
    switch (i.code) {
      case 'invalid_type':
        return t('required');
      case 'too_small': {
        const min = Number(i.minimum ?? 0);
        if (i.origin === 'string' && min <= 1) return t('required');
        if (i.origin === 'string' && min >= 8) return t('passwordWeak');
        return t('tooShort', { min });
      }
      case 'too_big':
        return t('tooLong', { max: Number(i.maximum ?? 0) });
      case 'invalid_format':
        return i.format === 'email' ? t('email') : t('passwordWeak');
      default:
        return undefined;
    }
  };
  z.config({ customError });
}
