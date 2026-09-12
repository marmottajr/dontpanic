'use client';

import type { SVGProps } from 'react';
import { useTranslations } from 'next-intl';
import { Apple, GitBranch } from 'lucide-react';
import type { OAuthProvider } from '@dontpanic/shared';
import { enabledOAuthProviders, oauthStartUrl } from '@/lib/auth-config';
import { Button } from '@/components/ui/button';

/**
 * A plain monochrome "G" letterform.
 *
 * Deliberately **not** Google's four-colour mark: reproducing a vendor's logo
 * is governed by their brand rules, and a boilerplate cannot know whether a
 * given deployment complies with them. A neutral glyph in the theme's own
 * colours is unambiguous next to the word "Google" and belongs to nobody.
 */
function GoogleMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* An open ring (the G's bowl) closed by a bar (its crossbar). */}
      <path d="M21 12a9 9 0 1 0-3.2 6.9" />
      <path d="M21 12h-8" />
    </svg>
  );
}

/**
 * Which mark goes with which provider.
 *
 * `apple` and `git-branch` come from lucide (already a dependency — no new
 * package for three buttons). Both are generic pictograms rather than the
 * vendors' registered marks, which is the point: the label carries the identity
 * and the icon only carries the theme's foreground colour.
 */
const MARKS: Record<OAuthProvider, (props: SVGProps<SVGSVGElement>) => React.ReactNode> = {
  google: GoogleMark,
  apple: Apple,
  github: GitBranch,
};

export interface OAuthButtonsProps {
  /**
   * Which entry point this is. The API needs it to decide what a brand-new
   * identity means: on `login` it is an error (`no_account`), on `signup` it is
   * a company waiting to be named.
   */
  intent: 'login' | 'signup';
  /** Override the configured list. For tests and Storybook only. */
  providers?: OAuthProvider[];
  className?: string;
}

/**
 * The social sign-in block: an "or" rule and one button per configured provider.
 *
 * The separator lives **inside** this component on purpose. Rendering it in the
 * page would leave an "or" with nothing under it on every deployment that has
 * no provider keys — which is the default one.
 *
 * Each button is an anchor, not a fetch. `/api/auth/oauth/:provider/start`
 * answers 302 to the provider's consent screen: an XHR would chase that
 * redirect invisibly and hand back an opaque cross-origin response, leaving the
 * user on the login page wondering what happened.
 */
export function OAuthButtons({ intent, providers, className }: OAuthButtonsProps) {
  const t = useTranslations('auth.oauth');
  const list = providers ?? enabledOAuthProviders;

  if (list.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex items-center gap-3 py-1" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
          {t('separator')}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="mt-3 grid gap-2">
        {list.map((provider) => {
          const Mark = MARKS[provider];
          return (
            <Button key={provider} asChild variant="outline" className="w-full">
              <a href={oauthStartUrl(provider, intent)} rel="nofollow">
                <Mark className="size-4" />
                {t('continueWith', { provider: t(`provider.${provider}`) })}
              </a>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
