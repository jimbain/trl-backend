import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { CompanySeeder } from 'src/database/seeders/company.seeder';
import { UserSeeder } from 'src/database/seeders/user.seeder';
import { CategorySeeder } from 'src/database/seeders/category.seeder';
import { AudioSeeder } from 'src/database/seeders/audio.seeder';
import { AppConfigSeeder } from 'src/database/seeders/app_config.seeder';
import { AdminUserSeeder } from './admin_user.seeder';
import { CatalogSeeder } from './catalog.seeder';
import { NotificationSeeder } from './notification.seeder';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  console.info('Database seeding start!🤫');

  const seeders = [
    // app.get(AdminUserSeeder),
    // app.get(AppConfigSeeder),
    // app.get(CategorySeeder),
    // app.get(CatalogSeeder),
    // app.get(CompanySeeder),
    // app.get(UserSeeder),
    // app.get(AudioSeeder),
    app.get(NotificationSeeder),
  ];

  // Execute seed method for each seeder
  for (const seeder of seeders) {
    await seeder.seed();
  }

  console.info('Database seeding end!💪');

  await app.close();
}

bootstrap().catch((err) => {
  console.error('Error during seeding:', err);
  process.exit(1);
});
