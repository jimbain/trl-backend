import {
  BadRequestException,
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
import {
  instanceToPlain,
  plainToClass,
  plainToInstance,
} from 'class-transformer';
import { CompanyBasicDto, CompanyDto, CompanyListDto } from './dto/company.dto';
import { CatalogService } from 'src/catalog/catalog.service';
import { CompanyCreditLog } from './entities/company_credit_log.entity';
import { FileManagerService } from 'src/common/services/file-manager.service';
import { CreateCompanyCreditLogDto } from './dto/create-company-credit-log.dto';
import { CompanyCreditLogDto } from './dto/company-credit-log.dto';
import { paginate } from 'src/common/helpers/pagination.helper';
import { UpdateCompanyAppConfigDto } from 'src/admin/dto/company/update-company-app-config.dto';
import { CacheService } from 'src/common/services/cache.service';
import { CachedCompany } from './company.interface';
import { AdminCompanySearchQueryDto } from 'src/admin/dto/company/admin-company-query.dto';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    @InjectRepository(CompanyCreditLog)
    private readonly companyCreditLogRepository: Repository<CompanyCreditLog>,

    private readonly catalogService: CatalogService,
    private readonly fileManagerService: FileManagerService,
    private readonly cacheService: CacheService,
  ) {}

  async findAll(query: AdminCompanySearchQueryDto) {
    const { page, per_page, name, status, sort_order, sort_column, is_basic } =
      query;

    let selections = [
      'company.id AS id',
      'company.name AS name',
      'company.logo_url AS logo_url',
    ];

    const queryBuilder = this.companyRepository.createQueryBuilder('company');

    if (is_basic) {
      const users = queryBuilder
        .select(selections)
        .orderBy('company.name', 'ASC')
        .getRawMany();

      return plainToClass(CompanyBasicDto, users);
    }

    selections = [
      ...new Set([
        ...selections,
        ...[
          'company.available_medias AS available_medias',
          'company.available_credits AS available_credits',
          'company.available_credits AS available_credits',
          'company.is_active AS is_active',
          "TO_CHAR(company.created_at, 'MM/DD/YYYY') AS created_at",
          'COALESCE(COUNT(user.id), 0) AS active_user_count',
        ],
      ]),
    ];

    queryBuilder
      .leftJoinAndSelect(
        'company.users',
        'user',
        'user.is_active = :userActive',
        { userActive: true },
      )
      .select(selections)
      .groupBy('company.id')
      .orderBy(
        sort_column === 'active_user_count'
          ? 'active_user_count'
          : `company.${sort_column}`,
        sort_order as 'ASC' | 'DESC',
      );

    if (name) {
      queryBuilder.andWhere('company.name ILIKE :name', {
        name: `%${query.name}%`,
      });
    }

    if (status === 'active') {
      queryBuilder.andWhere('company.is_active = :status', { status: true });
    } else if (query.status === 'inactive') {
      queryBuilder.andWhere('company.is_active = :status', { status: false });
    }

    return paginate(queryBuilder, page, per_page, CompanyListDto);
  }

  async create(payload: CreateCompanyDto, logo?: Express.Multer.File) {
    const company = this.companyRepository.create(payload);

    if (logo) {
      const logoPath = await this.fileManagerService.uploadFile(
        logo,
        'company_logos',
      );
      company.logo_url = logoPath;
    }

    if (payload.available_medias && payload.available_medias.length) {
      const catalogs = await this.catalogService.findByMedia(
        payload.available_medias,
      );
      company.catalogs = catalogs.map((catalog) => catalog.id) ?? [];
    }

    // Handle created_at if provided (expects Y-m-d format)
    if (payload.created_at) {
      company.created_at = new Date(payload.created_at);
    }

    await this.companyRepository.save(company);

    if (payload.available_credits && payload.available_credits > 0) {
      await this.createCreditLog({
        company_id: company.id,
        purchased_credit: payload.available_credits,
      });
    }
  }

  async findById(id: string): Promise<Company | undefined> {
    const company = await this.companyRepository.findOne({ where: { id } });

    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }

    return company;
  }

  async findByName(name: string): Promise<Company | undefined> {
    const company = await this.companyRepository.findOne({
      where: { name },
    });

    if (!company) {
      throw new NotFoundException(`Company with name "${name}" not found`);
    }

    return company;
  }

  async findByIdWithCache(id: string) {
    const cachedCompany = await this.cacheService.get(id);

    if (cachedCompany) return cachedCompany;

    const company = await this.findById(id);
    const logoUrl = this.fileManagerService.getFileUrl(company.logo_url);

    const data: CachedCompany = {
      id: company.id,
      name: company.name,
      logo_url: logoUrl,
      domain: company.domain,
      description: company.description,
      login_type: company.login_type,
      available_medias: company.available_medias,
      sso_config: company.sso_config as any,
      available_credits: company.available_credits,
      phone: company.phone,
      address1: company.address1,
      address2: company.address2,
      city: company.city,
      country: company.country,
      zip: company.zip,
      state: company.state,
      category_ids: {
        audio: [],
        video: [],
        pharma: [],
      },
      app_configs: company.app_configs,
    };

    const catalogs = await this.catalogService.findEntitiesByIds(
      company.catalogs,
    );

    for (const catalog of catalogs) {
      if (catalog.media_type in data.category_ids) {
        data.category_ids[catalog.media_type] = catalog.categories ?? [];
      }
    }

    await this.cacheService.set(id, data);

    return data;
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
    const isNameExists = await this.companyRepository
      .createQueryBuilder('company')
      .andWhere('LOWER(company.name) = LOWER(:name)', {
        name: updateCompanyDto.name.toLowerCase(),
      })
      .andWhere('company.id != :id', { id })
      .getExists();

    if (isNameExists) {
      throw new HttpException(
        {
          errors: {
            name: ['Name is already taken.'],
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

    const newAvailableCredit =
      updateCompanyDto.available_credits &&
      updateCompanyDto.available_credits > 0
        ? updateCompanyDto.available_credits + company.available_credits
        : company.available_credits;

    Object.assign(company, updateCompanyDto);

    if (logo) {
      const logoPath = await this.fileManagerService.uploadFile(
        logo,
        'company_logos',
      );
      company.logo_url = logoPath;
    }

    if (
      updateCompanyDto.available_medias &&
      updateCompanyDto.available_medias.length
    ) {
      const catalogs = await this.catalogService.findByMedia(
        updateCompanyDto.available_medias,
      );
      company.catalogs = catalogs.map((catalog) => catalog.id) ?? [];
    }

    // Handle created_at if provided (expects Y-m-d format)
    if (updateCompanyDto.created_at) {
      company.created_at = new Date(updateCompanyDto.created_at);
    }

    company.available_credits = newAvailableCredit;

    await Promise.all([
      this.companyRepository.save(company),
      this.cacheService.delete(id),
    ]);

    if (
      updateCompanyDto.available_credits &&
      updateCompanyDto.available_credits > 0
    ) {
      await this.createCreditLog({
        company_id: id,
        purchased_credit: updateCompanyDto.available_credits,
      });
    }
  }

  save(company: Company) {
    return this.companyRepository.save(company);
  }

  remove(id: number) {
    return `This action removes a #${id} company`;
  }

  removeFromCacheById(id: string) {
    return this.cacheService.delete(id);
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

  async updateAppConfigurations(
    id: string,
    payload: UpdateCompanyAppConfigDto,
  ) {
    const company = await this.findById(id);

    company.app_configs = Object.keys(payload || {}).length
      ? Object.fromEntries(
          Object.entries(instanceToPlain(payload)).map(([k, v]) => [
            k,
            String(v),
          ]),
        )
      : null;

    await Promise.all([
      this.companyRepository.save(company),
      this.cacheService.delete(id),
    ]);

    return company.app_configs;
  }

  async decreaseAvailableCredit(id: string, credit: number) {
    const company = await this.findById(id);

    if (company.available_credits >= credit) {
      await this.companyRepository.decrement(
        { id },
        'available_credits',
        credit,
      );
    } else {
      throw new BadRequestException(
        `Insufficient credits. Available credits: ${company.available_credits}`,
      );
    }
  }
}
