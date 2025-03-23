import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { Catalog } from 'src/catalog/entities/catalog.entity';
import { plainToInstance } from 'class-transformer';
import { CompanyDto, CompanyListDto } from './dto/company.dto';
import { CatalogService } from 'src/catalog/catalog.service';
import { CompanyCreditLog } from './entities/company_credit_log.entity';
import { CompanySearchInterface } from 'src/admin/admin.interface';
import { FileManagerService } from 'src/common/services/file-manager.service';
import { CreateCompanyCreditLogDto } from './dto/create-company-credit-log.dto';
import { CompanyCreditLogDto } from './dto/company-credit-log.dto';
import { paginate } from 'src/common/helpers/pagination.helper';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(Catalog)
    private readonly catalogRepository: Repository<Catalog>,

    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    @InjectRepository(CompanyCreditLog)
    private readonly companyCreditLogRepository: Repository<CompanyCreditLog>,

    private readonly catalogService: CatalogService,
    private readonly fileManagerService: FileManagerService,
  ) {}

  async findAll(query: CompanySearchInterface) {
    const sortOrder = ['asc', 'desc'].includes(query.sort_order?.toLowerCase())
      ? query.sort_order.toUpperCase()
      : 'ASC';

    const sortColumn = query.sort_column ? query.sort_column : 'created_at';

    const qb = this.companyRepository
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.users', 'user')
      .select([
        'company.id AS id',
        'company.name AS name',
        'company.logo_url AS logo_url',
        'company.available_medias AS available_medias',
        'company.available_credits AS available_credits',
        'company.available_credits AS available_credits',
        'company.is_active AS is_active',
        "TO_CHAR(company.created_at, 'MM/DD/YYYY') AS created_at",
        'COUNT(user.id) AS active_user_count',
      ])
      .andWhere('user.is_active = :userActive', { userActive: true })
      .groupBy('company.id')
      .orderBy(
        sortColumn === 'active_user_count'
          ? 'active_user_count'
          : `company.${sortColumn}`,
        sortOrder as 'ASC' | 'DESC',
      );

    if (query.name) {
      qb.andWhere('company.name ILIKE :name', {
        name: `%${query.name}%`,
      });
    }

    if (query.status === 'active') {
      qb.andWhere('company.is_active = :status', { status: true });
    } else if (query.status === 'inactive') {
      qb.andWhere('company.is_active = :status', { status: false });
    }

    return paginate(qb, query.page, query.per_page, CompanyListDto);
  }

  async create(
    payload: CreateCompanyDto,
    logo?: Express.Multer.File,
  ): Promise<CompanyDto | undefined> {
    const company = this.companyRepository.create(payload);

    if (logo) {
      const logoPath = await this.fileManagerService.uploadFile(
        logo,
        'company_logos',
      );
      company.logo_url = logoPath;
    }

    if (payload.available_medias.length) {
      const catalogs = await this.catalogService.findByMedia(
        payload.available_medias,
      );
      company.catalogs = catalogs.map((catalog) => catalog.id) ?? [];
    }

    await this.companyRepository.save(company);

    await this.createCreditLog({
      company_id: company.id,
      purchased_credit: payload.available_credits,
    });

    return this.findOne(company.id);
  }

  async findById(id: string): Promise<Company | undefined> {
    const company = await this.companyRepository.findOne({ where: { id } });

    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }

    return company;
  }

  async findOne(id: string) {
    const company = await this.companyRepository
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.users', 'users')
      .loadRelationCountAndMap(
        'company.userCount',
        'company.users',
        'activeUsers',
        (qb) =>
          qb.where('activeUsers.is_active = :isActive', { isActive: true }),
      )
      .where('company.id = :id', { id })
      .getOne();

    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }

    const catalogs = await this.catalogService.findByIds(company.catalogs);

    return plainToInstance(
      CompanyDto,
      { ...company, catalogs },
      { excludeExtraneousValues: true },
    );
  }

  async validateBeforeUpdate(id: string, updateCompanyDto: UpdateCompanyDto) {
    const [isNameExists, isDomainExists] = await Promise.all([
      this.companyRepository
        .createQueryBuilder('company')
        .andWhere('LOWER(company.name) = LOWER(:name)', {
          name: updateCompanyDto.name.toLowerCase(),
        })
        .andWhere('company.id != :id', { id })
        .getExists(),
      this.companyRepository
        .createQueryBuilder('company')
        .andWhere('LOWER(company.domain) = LOWER(:domain)', {
          domain: updateCompanyDto.domain.toLowerCase(),
        })
        .andWhere('company.id != :id', { id })
        .getExists(),
    ]);

    if (isNameExists || isDomainExists) {
      throw new HttpException(
        {
          errors: {
            ...(isNameExists && {
              name: ['Name is already taken.'],
            }),
            ...(isDomainExists && {
              domain: ['Domain is already taken.'],
            }),
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  async update(
    id: string,
    logo: Express.Multer.File,
    updateCompanyDto: UpdateCompanyDto,
  ) {
    await this.validateBeforeUpdate(id, updateCompanyDto);
    const company = await this.findById(id);

    updateCompanyDto.available_credits =
      updateCompanyDto.available_credits + company.available_credits;

    Object.assign(company, updateCompanyDto);

    if (logo) {
      const logoPath = await this.fileManagerService.uploadFile(
        logo,
        'company_logos',
      );
      company.logo_url = logoPath;
    }

    await Promise.all([
      this.companyRepository.save(company),
      this.createCreditLog({
        company_id: company.id,
        purchased_credit: updateCompanyDto.available_credits,
      }),
    ]);

    return this.findOne(company.id);
  }

  save(company: Company) {
    return this.companyRepository.save(company);
  }

  remove(id: number) {
    return `This action removes a #${id} company`;
  }

  async createCreditLog(createCompanyCreditLogDto: CreateCompanyCreditLogDto) {
    const log = this.companyCreditLogRepository.create(
      createCompanyCreditLogDto,
    );
    return this.companyCreditLogRepository.save(log);
  }

  async findAllCreditLogs(id: string): Promise<CompanyCreditLogDto[]> {
    const logs = await this.companyCreditLogRepository.find({
      where: {
        company_id: id,
      },
    });

    return plainToInstance(CompanyCreditLogDto, logs, {
      excludeExtraneousValues: true,
    });
  }
}
