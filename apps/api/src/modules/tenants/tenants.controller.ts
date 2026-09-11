import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  PlanDto,
  PlanUsageDto,
  TenantBrandingDto as TenantBrandingResponse,
  TenantDto,
} from '@dontpanic/shared';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { TenantsService } from './services/tenants.service';
import { PlanLimitsService } from './services/plan-limits.service';
import { TenantBrandingDto, UpdateTenantDto } from './dto/tenants.dto';

/**
 * The company managing itself. `@RequirePermission('settings')` on the class
 * means the action is inferred from the HTTP verb — GET is `read`, PATCH/PUT
 * are `update` — so a read-only profile can see the company without being able
 * to rename it.
 */
@ApiTags('tenants')
@Controller('tenants')
@RequirePermission('settings')
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'The authenticated user’s company' })
  async me(): Promise<TenantDto> {
    return this.tenants.me();
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the company' })
  async update(@Body() dto: UpdateTenantDto): Promise<TenantDto> {
    return this.tenants.update(dto);
  }

  @Get('me/branding')
  @ApiOperation({ summary: 'Visual identity for generated documents' })
  async branding(): Promise<TenantBrandingResponse | null> {
    return this.tenants.branding();
  }

  @Put('me/branding')
  @ApiOperation({ summary: 'Save the visual identity' })
  async saveBranding(@Body() dto: TenantBrandingDto): Promise<TenantBrandingResponse> {
    return this.tenants.saveBranding(dto);
  }

  @Get('me/plan')
  @ApiOperation({ summary: 'The company\u2019s current plan' })
  async plan(): Promise<PlanDto | null> {
    return this.tenants.plan();
  }

  @Get('me/plan-usage')
  @ApiOperation({ summary: 'How much of the plan is already spent' })
  async planUsage(): Promise<PlanUsageDto> {
    return this.planLimits.usage();
  }
}
