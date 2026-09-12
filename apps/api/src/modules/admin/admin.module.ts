import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminProfilesController } from './admin-profiles.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [AuthModule], // for TokenService (session revocation)
  controllers: [AdminUsersController, AdminProfilesController],
  providers: [AdminUsersService, RolesGuard],
})
export class AdminModule {}
