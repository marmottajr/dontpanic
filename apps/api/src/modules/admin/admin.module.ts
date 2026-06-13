import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [AuthModule], // for TokenService (session revocation)
  controllers: [AdminUsersController],
  providers: [AdminUsersService, RolesGuard],
})
export class AdminModule {}
