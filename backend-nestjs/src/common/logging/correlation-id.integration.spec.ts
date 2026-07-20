import {
  Controller,
  Get,
  INestApplication,
  Injectable,
  Module,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ClsModule, ClsService } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { setupCorrelationId } from './correlation-id.setup';
import { REQUEST_ID_CLS_KEY } from './correlation-id.constants';
import { createPinoLoggerParams } from './pino-logger.options';

/**
 * Proves the module-import-order dependency documented in `app.module.ts`
 * (`ClsModule.forRoot` must be imported BEFORE `LoggerModule.forRootAsync`,
 * or pino-http's middleware attaches outside the CLS context and `mixin`
 * never sees the id) with a real boot + real HTTP request, not just a code
 * comment asserting it. Uses the SAME two module registrations app.module.ts
 * does, in the SAME order, plus a minimal controller — not the full
 * `AppModule` (which needs live Postgres/Redis this test suite doesn't have)
 * — so a regression in either nestjs-cls or nestjs-pino's internals, or a
 * future accidental reordering, fails this test instead of silently
 * dropping `requestId` from every log line in production.
 */
@Injectable()
class ProbeService {
  constructor(private readonly cls: ClsService) {}

  currentRequestId(): string | undefined {
    return this.cls.get(REQUEST_ID_CLS_KEY);
  }
}

@Controller('probe')
class ProbeController {
  constructor(private readonly probe: ProbeService) {}

  @Get()
  get() {
    return { requestId: this.probe.currentRequestId() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true, setup: setupCorrelationId },
    }),
    LoggerModule.forRootAsync({
      inject: [ClsService, ConfigService],
      useFactory: createPinoLoggerParams,
    }),
  ],
  controllers: [ProbeController],
  providers: [ProbeService],
})
class ProbeModule {}

describe('correlation id propagation (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useLogger(app.get(require('nestjs-pino').Logger));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('generates a request id, makes it visible to application code via CLS, and echoes it on the response', async () => {
    const res = await request(app.getHttpServer()).get('/probe');

    expect(res.status).toBe(200);
    expect(res.body.requestId).toEqual(expect.any(String));
    expect(res.body.requestId.length).toBeGreaterThan(0);
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('honors a caller-supplied x-request-id instead of generating a new one', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe')
      .set('x-request-id', 'caller-supplied-trace-id');

    expect(res.body.requestId).toBe('caller-supplied-trace-id');
    expect(res.headers['x-request-id']).toBe('caller-supplied-trace-id');
  });
});
