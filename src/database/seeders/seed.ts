import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { CompanySeeder } from 'src/database/seeders/company.seeder';
import { UserSeeder } from 'src/database/seeders/user.seeder';
import { CategorySeeder } from 'src/database/seeders/category.seeder';
import { CompanyCategorySeeder } from 'src/database/seeders/company_category.seeder';
import { AudioSeeder } from 'src/database/seeders/audio.seeder';
import { AppConfigSeeder } from 'src/database/seeders/app_config.seeder';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  console.info('Database seeding start!🤫');

  const seeders = [
    app.get(AppConfigSeeder),
    // app.get(CompanySeeder),
    // app.get(UserSeeder),
    // app.get(CategorySeeder),
    // app.get(CompanyCategorySeeder),
    // app.get(AudioSeeder),
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
