import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AuthController } from '../src/auth/auth.controller';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const controller = app.get(AuthController);
  
  try {
    console.log('Testing controller.login...');
    const mockRes = {
      cookie: (name: string, val: string, options: any) => {
        console.log(`Cookie set: ${name} = ${val.substring(0, 15)}...`, options);
      }
    } as any;
    
    const result = await controller.login(
      { email: 'superadmin@odiseo.com', password: 'superadmin123', subdomain: 'odiseo' },
      mockRes
    );
    console.log('Result:', result);
  } catch (error) {
    console.error('Error during login endpoint:', error);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
