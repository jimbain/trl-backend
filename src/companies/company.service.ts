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
  ) {}

  async findAll(): Promise<CompanyListDto[]> {
    const companies = await this.companyRepository.find();

    return plainToInstance(CompanyListDto, companies, {
      excludeExtraneousValues: true,
    });
  }

  async create(payload: CreateCompanyDto, logo?: Express.Multer.File) {
    console.log(payload);
    console.log(logo);

    const company = this.companyRepository.create(payload);

    if (logo) {
      company.logo_url = logo.path;
    }
  }

  async findById(id: string): Promise<CompanyDto | undefined> {
    const company = await this.companyRepository.findOne({ where: { id } });

    return plainToInstance(CompanyDto, company, {
      excludeExtraneousValues: true,
    });
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
    const company = await this.companyRepository.findOne({ where: { id } });

    // Update only the provided fields
    Object.assign(company, updateCompanyDto);

    if (logo) {
      company.logo_url = logo.path;
    }

    // Save the updated company
    return await this.companyRepository.save(company);
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
