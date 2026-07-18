import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  // Root/health probe: must answer before any session exists.
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }
}
