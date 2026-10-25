import 'dotenv/config';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  migrations: [join(currentDirectory, 'migrations', '*.js')],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: false,
});

export default dataSource;
