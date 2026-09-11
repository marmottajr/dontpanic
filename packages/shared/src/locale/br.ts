import { z } from 'zod';

/**
 * Brazilian validators — an OPT-IN locale module.
 *
 * This is deliberately NOT re-exported from `src/index.ts`: the boilerplate
 * stays locale-neutral by default, and a product that needs Brazilian
 * documents imports the subpath explicitly:
 *
 *     import { taxIdSchema, onlyDigits } from '@dontpanic/shared/locale/br';
 *
 * It lives in the shared package so the API and the web app apply exactly the
 * same rule — a CPF rejected by the server must be rejected by the form, and
 * vice-versa.
 *
 * Convention: the database stores **digits only**. Formatting is the UI's job
 * (see `apps/web/src/lib/masks.ts`).
 *
 * The `message` strings below are English fallbacks. A product that surfaces
 * them to users should map them through the `validation` i18n namespace, the
 * way `apps/web/src/lib/zod-error-map.ts` does for the built-in Zod codes
 * (it leaves custom `refine` issues alone, so the message here is what shows).
 */

export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

/** CPF check digits (mod 11). */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  // Repeated sequences (000…, 111…) pass the arithmetic but are not valid.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += Number(cpf[i]) * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/** CNPJ check digits (mod 11 with cyclic weights 2..9). */
export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digit = (length: number): number => {
    let sum = 0;
    let weight = length - 7;
    for (let i = 0; i < length; i += 1) {
      sum += Number(cnpj[i]) * weight;
      weight -= 1;
      if (weight < 2) weight = 9;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

export const isValidTaxId = (value: string): boolean => {
  const digits = onlyDigits(value);
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
};

export const cpfSchema = z
  .string()
  .transform(onlyDigits)
  .refine(isValidCpf, { message: 'Invalid CPF' });

export const cnpjSchema = z
  .string()
  .transform(onlyDigits)
  .refine(isValidCnpj, { message: 'Invalid CNPJ' });

/** CPF or CNPJ — sign-up accepts either an individual or a company. */
export const taxIdSchema = z
  .string()
  .transform(onlyDigits)
  .refine(isValidTaxId, { message: 'Invalid CPF or CNPJ' });

export const postalCodeSchema = z
  .string()
  .transform(onlyDigits)
  .refine((v) => v.length === 8, { message: 'Postal code must have 8 digits' });

/** Brazilian phone: 10 digits (landline) or 11 (mobile), area code included. */
export const phoneSchema = z
  .string()
  .transform(onlyDigits)
  .refine((v) => v.length === 10 || v.length === 11, {
    message: 'Phone must have 10 or 11 digits, including the area code',
  });

/** Federative units — used by the address and by per-region reports. */
export const brazilianStates = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

export const stateSchema = z.enum(brazilianStates);
export type BrazilianState = (typeof brazilianStates)[number];

export const addressSchema = z.object({
  postalCode: postalCodeSchema,
  street: z.string().min(1).max(200),
  number: z.string().max(20).optional(),
  complement: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  city: z.string().min(1).max(100),
  state: stateSchema,
  country: z.string().length(2).default('BR'),
});
export type Address = z.infer<typeof addressSchema>;

/** PIX key kinds accepted when registering bank details. */
export const pixKeyTypes = ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'] as const;
export const pixKeyTypeSchema = z.enum(pixKeyTypes);
export type PixKeyType = (typeof pixKeyTypes)[number];
