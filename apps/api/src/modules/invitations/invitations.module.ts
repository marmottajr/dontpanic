import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InvitationsController } from './invitations.controller';
import { PublicInvitationsController } from './public-invitations.controller';
import { InvitationsService } from './invitations.service';

/**
 * Invitations — the only door into a company that already exists.
 *
 * Imports AuthModule for TokenService and CookieService: accepting an
 * invitation mints a session exactly the way logging in does, so it reuses the
 * same code rather than growing a second way to issue cookies.
 *
 * PlanLimitsService arrives from the @Global TenantsModule; the queue port from
 * the global QueueModule.
 *
 * Exports InvitationsService because it is composed elsewhere: the platform
 * panel creates a company and its first invitation in one transaction, calling
 * `issue()` with its own `tx`.
 */
@Module({
  imports: [AuthModule],
  controllers: [InvitationsController, PublicInvitationsController],
  providers: [InvitationsService, RolesGuard],
  exports: [InvitationsService],
})
export class InvitationsModule {}
