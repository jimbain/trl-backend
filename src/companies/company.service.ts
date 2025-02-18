import { Injectable, NotFoundException } from '@nestjs/common';
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
import { PaginationMeta } from 'src/common/interfaces';
import { FileManagerService } from 'src/common/services/file-manager.service';

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

  async findAll(query: CompanySearchInterface): Promise<{
    data: CompanyListDto[];
    meta: PaginationMeta;
  }> {
    const parsedPage = parseInt(query.page, 10) || 1;
    const parsedPerPage = parseInt(query.per_page, 10) || 10;

    const qb = this.companyRepository
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.users', 'user')
      .loadRelationCountAndMap('company.userCount', 'company.users')
      .orderBy('company.created_at', 'DESC');

    if (query.name) {
      qb.andWhere('LOWER(company.name) LIKE LOWER(:name)', {
        name: `%${query.name}%`,
      });
    }

    if (query.status === 'active') {
      qb.andWhere('company.is_active = :status', { status: true });
    } else if (query.status === 'inactive') {
      qb.andWhere('company.is_active = :status', { status: false });
    }

    const [companies, total] = await qb
      .skip((parsedPage - 1) * parsedPerPage)
      .take(parsedPerPage)
      .getManyAndCount();

    const from = total > 0 ? (parsedPage - 1) * parsedPerPage + 1 : null;
    const to = Math.min(parsedPage * parsedPerPage, total);

    return {
      data: plainToInstance(CompanyListDto, companies, {
        excludeExtraneousValues: true,
      }),
      meta: {
        current_page: parsedPage,
        per_page: parsedPerPage,
        total,
        last_page: Math.ceil(total / parsedPerPage),
        from,
        to,
      },
    };
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
    const company = await this.companyRepository.findOne({ where: { id } });

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

  async update(
    id: string,
    logo: Express.Multer.File,
    updateCompanyDto: UpdateCompanyDto,
  ) {
    const company = await this.findById(id);
    updateCompanyDto.available_credits =
      updateCompanyDto.available_credits + company.available_credits;

    // Update only the provided fields
    Object.assign(company, updateCompanyDto);

    if (logo) {
      const logoPath = await this.fileManagerService.uploadFile(
        logo,
        'company_logos',
      );
      company.logo_url = logoPath;
    }

    await this.companyRepository.save(company);

    return this.findOne(company.id);
  }

  remove(id: number) {
    return `This action removes a #${id} company`;
  }

  async findAllCreditLogs(id: string) {
    return this.companyCreditLogRepository.find({
      where: {
        company_id: id,
      },
    });
  }
}
