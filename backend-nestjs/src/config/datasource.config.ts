import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

// Cargar variables de entorno (para cuando se ejecute desde CLI)
config({ path: join(__dirname, '../../.env') });

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'odiseo',
  // Importante: Solo incluimos las entidades públicas del sistema (SaaS) y Catálogos para que no genere tablas tenant_ en public
  entities: [
    join(__dirname, '../tenants/entities/tenant.entity{.ts,.js}'),
    join(
      __dirname,
      '../admin/subscriptions/entities/subscription-plan.entity{.ts,.js}',
    ),
    join(__dirname, '../catalogs/entities/course.entity{.ts,.js}'),
    join(__dirname, '../catalogs/entities/topic.entity{.ts,.js}'),
    join(__dirname, '../catalogs/entities/subtopic.entity{.ts,.js}'),
  ],
  // Directorio para crear migraciones
  migrations: [join(__dirname, '../database/migrations/*{.ts,.js}')],
  synchronize: false,
};

export default new DataSource(dataSourceOptions);
