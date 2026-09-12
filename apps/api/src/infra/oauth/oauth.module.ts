import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OAuthProvider } from '@dontpanic/shared';
import { parseOAuthProviders, type Env } from '../../config/env';
import { OAUTH_REGISTRY, type OAuthAdapter } from '../../core/oauth/oauth.provider';
import { oauthCallbackUri } from './callback-url';
import { AppleOAuthAdapter } from './apple.adapter';
import { GitHubOAuthAdapter } from './github.adapter';
import { GoogleOAuthAdapter } from './google.adapter';

/**
 * Builds the adapter registry from OAUTH_PROVIDERS.
 *
 * A provider the operator did not list is not constructed at all, so it has no
 * entry in the map and the routes answer 404 for it. That is the whole enabling
 * mechanism — there is no "enabled" flag to read and get wrong, and no adapter
 * sitting there holding empty credentials waiting to produce a confusing error
 * against the real Google.
 */
@Global()
@Module({
  providers: [
    {
      provide: OAUTH_REGISTRY,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const base = config.get('OAUTH_CALLBACK_BASE_URL', { infer: true });
        const registry = new Map<OAuthProvider, OAuthAdapter>();

        for (const name of parseOAuthProviders(config.get('OAUTH_PROVIDERS', { infer: true }))) {
          const redirectUri = oauthCallbackUri(base, name);
          switch (name) {
            case 'google':
              registry.set(
                name,
                new GoogleOAuthAdapter({
                  clientId: config.get('OAUTH_GOOGLE_CLIENT_ID', { infer: true }),
                  clientSecret: config.get('OAUTH_GOOGLE_CLIENT_SECRET', { infer: true }),
                  redirectUri,
                }),
              );
              break;
            case 'apple':
              registry.set(
                name,
                new AppleOAuthAdapter({
                  clientId: config.get('OAUTH_APPLE_CLIENT_ID', { infer: true }),
                  teamId: config.get('OAUTH_APPLE_TEAM_ID', { infer: true }),
                  keyId: config.get('OAUTH_APPLE_KEY_ID', { infer: true }),
                  privateKey: config.get('OAUTH_APPLE_PRIVATE_KEY', { infer: true }),
                  redirectUri,
                }),
              );
              break;
            case 'github':
              registry.set(
                name,
                new GitHubOAuthAdapter({
                  clientId: config.get('OAUTH_GITHUB_CLIENT_ID', { infer: true }),
                  clientSecret: config.get('OAUTH_GITHUB_CLIENT_SECRET', { infer: true }),
                  redirectUri,
                }),
              );
              break;
          }
        }

        return registry as ReadonlyMap<OAuthProvider, OAuthAdapter>;
      },
    },
  ],
  exports: [OAUTH_REGISTRY],
})
export class OAuthAdaptersModule {}
