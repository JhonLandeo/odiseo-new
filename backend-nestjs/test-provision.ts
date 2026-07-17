import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { SchemaService } from './src/database/schema.service';
import { v4 as uuidv4 } from 'uuid';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const schemaService = app.get(SchemaService);
  try {
    const id = uuidv4();
    const schema = `tenant_${id}`;
    await schemaService.createTenantSchema(schema);
    await schemaService.seedTenantSchema(schema, id);
    console.log('Success provisioning');
  } catch(e) {
    console.error('PROVISION ERROR: ', e.message);
  } finally {
    await app.close();
  }
}
bootstrap();
