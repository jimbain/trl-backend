import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IsUniqueConstraint } from './validators/is-unique.validator';
import { IsExistConstraint } from './validators/is-exist.validator';

@Module({
  imports: [TypeOrmModule.forFeature()],
  providers: [
    IsExistConstraint,
    IsUniqueConstraint
  ],
  exports: [
    IsExistConstraint,
    IsUniqueConstraint
  ],
})
export class ValidationModule {}
