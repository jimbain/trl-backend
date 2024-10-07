import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { CompanySeeder } from 'src/database/seeders/company.seeder';
import { UserSeeder } from 'src/database/seeders/user.seeder';
import { AudioCategorySeeder } from 'src/database/seeders/audio_category.seeder';
import { CompanyAudioCategorySeeder } from 'src/database/seeders/company_audio_category.seeder';
import { AudioSeeder } from 'src/database/seeders/audio.seeder';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  console.info('Database seeding start!🤫');

  const seeders = [
    app.get(CompanySeeder),
    app.get(UserSeeder),
    app.get(AudioCategorySeeder),
    app.get(CompanyAudioCategorySeeder),
    app.get(AudioSeeder),
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
