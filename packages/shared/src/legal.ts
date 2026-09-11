import { z } from 'zod';

/**
 * The version of each legal document currently in force — the single source.
 *
 * It lives here, not in the page, because three places need the same number and
 * none of them may drift: the page that shows the document, the record that
 * stores what was accepted, and the check that decides whether a fresh
 * acceptance is needed. If the page showed 1.1 while the server recorded 1.0,
 * the evidence would point at a text the user never saw — and evidence pointing
 * at the wrong document is worse than no evidence at all.
 *
 * **When you publish a new version**: bump the number HERE and put the
 * effective date in the content. Consumer-protection law in most jurisdictions
 * does not allow unilateral changes to a contract, so the change has to come
 * with notice and the right to leave without penalty.
 */
export const LEGAL_VERSIONS = {
  terms: '1.0',
  privacy: '1.0',
} as const;

export const legalDocuments = ['TERMS_OF_USE', 'PRIVACY_POLICY'] as const;
export const legalDocumentSchema = z.enum(legalDocuments);
export type LegalDocumentKind = z.infer<typeof legalDocumentSchema>;

export const legalAcceptanceDtoSchema = z.object({
  id: z.string().uuid(),
  document: legalDocumentSchema,
  version: z.string(),
  acceptedAt: z.string(),
  /** Null when the user who accepted no longer exists. */
  userId: z.string().uuid().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
});
export type LegalAcceptanceDto = z.infer<typeof legalAcceptanceDtoSchema>;
