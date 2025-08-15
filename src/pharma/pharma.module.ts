import { forwardRef, Module } from '@nestjs/common';
import { PharmaService } from './services/pharma.service';
import { PharmaController } from './controllers/pharma.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pharma } from './entities/pharma.entity';
import { PharmaUserStatus } from './entities/pharma-user-status.entity';
import { PharmaReview } from './entities/pharma-review.entity';
import { StorageModule } from 'src/storage/storage.module';
import { CompanyModule } from 'src/companies/company.module';
import { CategoryModule } from 'src/categories/category.module';
import { AppConfigModule } from 'src/app-config/app-config.module';
import { PharmaReviewService } from './services/pharma-review.service';
import { PharmaReviewController } from './controllers/pharma-review.controller';
import { PharmaUserStatusService } from './services/pharma-user-status.service';
import { PharmaUserStatusController } from './controllers/pharma-user-status.controller';
import { UserModule } from 'src/users/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pharma, PharmaUserStatus, PharmaReview]),
    forwardRef(() => AppConfigModule),
    forwardRef(() => CompanyModule),
    forwardRef(() => CategoryModule),
    forwardRef(() => StorageModule),
    forwardRef(() => UserModule),
  ],
  controllers: [
    PharmaController,
    PharmaReviewController,
    PharmaUserStatusController,
  ],
  providers: [PharmaService, PharmaReviewService, PharmaUserStatusService],
  exports: [PharmaService, PharmaUserStatusService],
})
export class PharmaModule {}
