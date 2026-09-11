/**
 * Who provides the service.
 *
 * **This must be filled in before publishing.** Brazilian law (LGPD art. 9, III
 * and IV) requires the controller to be identified and reachable, and the
 * Consumer Code requires the supplier to be identifiable. A legal document with
 * "[LEGAL NAME]" on display identifies nobody — and a contract whose party is
 * unidentified is a contract nobody knows who to enforce against.
 *
 * The values below are marked with `⚠` on purpose: they show up on the page and
 * keep the test failing while they are still there, so they cannot reach
 * production by inattention.
 */
export const OPERATOR = {
  legalName: '⚠ RAZÃO SOCIAL COMPLETA',
  taxId: '⚠ CNPJ',
  address: '⚠ ENDEREÇO COMPLETO, COM CEP',
  product: 'DontPanic',
  supportEmail: '⚠ contato@seudominio.com.br',
  privacyEmail: '⚠ privacidade@seudominio.com.br',
  /** Data protection officer (LGPD, art. 41). */
  dpoName: '⚠ NOME DO ENCARREGADO',
  dpoEmail: '⚠ encarregado@seudominio.com.br',
} as const;

/** `true` while any field is still a placeholder — read by the banner and the test. */
export const OPERATOR_INCOMPLETE = Object.values(OPERATOR).some((value) => value.startsWith('⚠'));
