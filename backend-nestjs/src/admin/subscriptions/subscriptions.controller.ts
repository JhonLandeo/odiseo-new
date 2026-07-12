import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../../auth/auth.guard';

@ApiTags('Admin / Subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/admin/subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Listar todos los planes de suscripción' })
  async findAll() {
    return this.subscriptionsService.findAll();
  }

  @Post('plans')
  @ApiOperation({ summary: 'Crear nuevo plan de suscripción' })
  async create(
    @Body() data: { name: string; price: number; max_users: number; max_pdf_pages_per_month: number; max_questions_per_month: number },
  ) {
    return this.subscriptionsService.create(data);
  }
}
