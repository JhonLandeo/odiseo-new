import { ConfigService } from '@nestjs/config';
import { jwtModuleOptionsFactory } from './auth.module';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

// JWT_EXPIRATION is validated at boot, so an operator setting it reasonably
// expects it to govern token lifetime. Signing used to hardcode '24h' and
// silently ignore it.
describe('jwtModuleOptionsFactory', () => {
  it('signs with the configured JWT_EXPIRATION', () => {
    const options = jwtModuleOptionsFactory(
      configWith({ JWT_SECRET: 'secret', JWT_EXPIRATION: '15m' }),
    );

    expect(options.signOptions?.expiresIn).toBe('15m');
    expect(options.secret).toBe('secret');
  });

  it('defaults to 24h when JWT_EXPIRATION is unset', () => {
    const options = jwtModuleOptionsFactory(
      configWith({ JWT_SECRET: 'secret' }),
    );

    expect(options.signOptions?.expiresIn).toBe('24h');
  });

  it('refuses to build options without JWT_SECRET', () => {
    expect(() => jwtModuleOptionsFactory(configWith({}))).toThrow(
      /JWT_SECRET is not set/,
    );
  });
});
