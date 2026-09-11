import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PlanDto } from '@dontpanic/shared';
import { SuperAdminGuard } from './guards/superadmin.guard';
import { PlatformPlansService } from './services/platform-plans.service';
import { UpsertPlanDto } from './dto/platform.dto';

@ApiTags('platform')
@Controller('platform/plans')
@UseGuards(SuperAdminGuard)
export class PlatformPlansController {
  constructor(private readonly plans: PlatformPlansService) {}

  @Get()
  @ApiOperation({ summary: 'List every plan, active or not' })
  async list(): Promise<PlanDto[]> {
    return this.plans.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create a plan' })
  async create(@Body() dto: UpsertPlanDto): Promise<PlanDto> {
    return this.plans.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a plan' })
  async update(@Param('id') id: string, @Body() dto: UpsertPlanDto): Promise<PlanDto> {
    return this.plans.update(id, dto);
  }
}
