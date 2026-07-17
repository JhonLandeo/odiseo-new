import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly planRepository: Repository<SubscriptionPlan>,
  ) {}

  async findAll(): Promise<SubscriptionPlan[]> {
    return this.planRepository.find();
  }

  async create(data: CreateSubscriptionPlanDto): Promise<SubscriptionPlan> {
    const plan = this.planRepository.create({
      name: data.name,
      price: data.price,
      maxUsers: data.max_users,
      maxPdfPagesPerMonth: data.max_pdf_pages_per_month,
      maxQuestionsPerMonth: data.max_questions_per_month,
    });
    return this.planRepository.save(plan);
  }
}
