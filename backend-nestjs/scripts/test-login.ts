import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const authService = app.get(AuthService);
  
  try {
    console.log('Testing validateUser...');
    const result = await authService.validateUser(
      'superadmin@odiseo.com',
      'superadmin123',
      'odiseo'
    );
    console.log('Result:', result);
  } catch (error) {
    console.error('Error during validateUser:', error);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
