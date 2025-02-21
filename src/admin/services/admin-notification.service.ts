import { BadRequestException, Injectable } from '@nestjs/common';
import { NotificationNewBookDto } from '../dto/notification/notification-new-book.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { In, Repository } from 'typeorm';

@Injectable()
export class AdminNotificationService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async handleNewBookNotification(payload: NotificationNewBookDto) {
    const companies = await this.companyRepository
      .createQueryBuilder('company')
      .leftJoinAndSelect(
        'company.users',
        'users',
        'users.is_active = :isActive',
        { isActive: true },
      )
      .where('company.id IN (:...companyIds)', {
        companyIds: payload.company_ids,
      })
      .andWhere('company.is_active = :companyIsActive', {
        companyIsActive: true,
      })
      .getMany();

    const companyLength: number = companies.length;
    const companyIdLength: number = payload.company_ids.length;

    if (companyLength < companyIdLength) {
      throw new BadRequestException(
        `There are ${companyIdLength - companyLength} invalid id in company_ids in the payload.`,
      );
    }

    return companies;
  }
}
