import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from 'src/users/entities/user.entity';
import { plainToInstance } from 'class-transformer';
import { UserDto, UserListDto } from './dto/user.dto';
import { UserDevice } from './entities/user_device.entity';
import { CreateUserDeviceDto } from './dto/create-user_device.dto';
import { PaginationMeta } from 'src/common/interfaces';
import { AppConfigService } from 'src/app-config/app-config.service';
import { CompanyService } from 'src/companies/company.service';
import { CsvService } from 'src/common/services/csv.service';
import { chunk } from 'lodash';
import { CreateUserRegistrationLogDto } from './dto/create-user-registration-log.dto';
import { UserRegistrationLog } from './entities/user_registration_log.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(UserRegistrationLog)
    private readonly userRegistrationLogRepository: Repository<UserRegistrationLog>,

    @InjectRepository(UserDevice)
    private readonly userDeviceRepository: Repository<UserDevice>,

    private readonly appConfigService: AppConfigService,
    private readonly companyService: CompanyService,
    private readonly csvService: CsvService,
  ) {}

  async create(createUserPayload: CreateUserDto): Promise<any> {
    const user = this.userRepository.create(createUserPayload);
    await this.userRepository.save(user);
    return plainToInstance(UserDto, user, { excludeExtraneousValues: true });
  }

  async findByEmail(
    email: string,
    relations: string[] = [],
  ): Promise<User | undefined> {
    return this.userRepository.findOne({
      where: { email },
      relations: relations.length ? relations : undefined,
    });
  }

  async findById(
    id: string,
    relations: string[] = ['company'],
  ): Promise<User | undefined> {
    return this.userRepository.findOne({
      where: { id },
      relations: relations.length ? relations : undefined,
    });
  }

  async findAll(
    query: any = {},
    relations: string[] = [],
  ): Promise<{
    data: UserListDto[];
    meta: PaginationMeta;
  }> {
    const parsedPage = parseInt(query.page, 10) || 1;
    const parsedPerPage = parseInt(query.per_page, 10) || 10;

    const qb = this.userRepository.createQueryBuilder('user');

    relations.forEach((relation) => {
      qb.leftJoinAndSelect(`user.${relation}`, relation);
    });

    if (query.company_id) {
      qb.andWhere('user.company_id = :companyId', {
        companyId: query.company_id,
      });
    }

    if (query.email) {
      qb.andWhere('LOWER(user.email) LIKE LOWER(:email)', {
        email: `%${query.email}%`,
      });
    }

    if (query.status === 'active') {
      qb.andWhere('user.is_active = :status', { status: true });
    } else if (query.status === 'inactive') {
      qb.andWhere('user.is_active = :status', { status: false });
    }

    qb.orderBy('user.created_at', 'DESC');

    const [users, total] = await qb
      .skip((parsedPage - 1) * parsedPerPage)
      .take(parsedPerPage)
      .getManyAndCount();

    const from = total > 0 ? (parsedPage - 1) * parsedPerPage + 1 : null;
    const to = Math.min(parsedPage * parsedPerPage, total);

    return {
      data: plainToInstance(UserListDto, users, {
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

  findOne(id: string) {
    const user = this.findById(id);

    return plainToInstance(UserDto, user, {
      excludeExtraneousValues: true,
    });
  }

  async store(payload: CreateUserDto): Promise<UserDto> {
    const user = this.userRepository.create(payload);
    await this.userRepository.save(user);

    return this.findOne(user.id);
  }

  async findUserByCompany(id: string, companyId: string) {
    const user = await this.userRepository.findOne({
      where: {
        id: id,
        company_id: companyId,
      },
      relations: ['company'],
    });

    return plainToInstance(UserDto, user, {
      excludeExtraneousValues: true,
    });
  }

  async update(id: string, payload: any) {
    const isEmailExist = await this.userRepository.count({
      where: {
        email: payload.email,
        id: Not(id),
      },
    });

    if (isEmailExist) {
      throw new HttpException(
        {
          errors: {
            email: ['The email has already taken'],
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const user = await this.userRepository.findOne({
      where: {
        id: id,
        company_id: payload.company_id,
      },
    });

    if (!user) {
      throw new NotFoundException(
        `User with ID ${id} not found for the company.`,
      );
    }

    Object.assign(user, payload);

    await this.userRepository.save(user);

    return this.findOne(id);
  }

  async removeUserByCompany(id: string, companyId: string) {
    const user = await this.userRepository.findOne({
      where: {
        id: id,
        company_id: companyId,
      },
    });

    if (!user) {
      throw new NotFoundException(
        `User with ID ${id} not found for the company.`,
      );
    }

    await this.userRepository.delete(id);
  }

  async changePassword(user: User, password: string): Promise<User> {
    user.password = password;
    await this.userRepository.save(user);
    return user;
  }

  async storeUserDevice(
    user: User,
    data: CreateUserDeviceDto,
  ): Promise<UserDevice> {
    data.device_os = data.os;

    const existingUserDevice = await this.userDeviceRepository.findOne({
      where: {
        user_id: user.id,
        device_id: data.device_id,
      },
    });

    let userDevice: UserDevice;

    if (existingUserDevice) {
      userDevice = existingUserDevice;
      this.userDeviceRepository.merge(userDevice, data);
    } else {
      userDevice = this.userDeviceRepository.create({
        user_id: user.id,
        ...data,
      });
    }

    return this.userDeviceRepository.save(userDevice);
  }

  getTotalActiveUsersByStatusOfCompany(
    companyId: string,
    status: boolean = true,
  ) {
    return this.userRepository.count({
      where: { company_id: companyId, is_active: status },
    });
  }

  async importUsers(file: Express.Multer.File, companyId: string) {
    if (!file.mimetype.includes('csv')) {
      throw new BadRequestException(
        'Invalid file format. Only CSV file is allowed.',
      );
    }

    // Fetch company and config in parallel
    const [company, appConfigs, totalActiveUsersBeforeUpload] =
      await Promise.all([
        this.companyService.findById(companyId),
        this.appConfigService.getAppConfigs(['new_user_default_password']),
        this.getTotalActiveUsersByStatusOfCompany(companyId),
      ]);

    const newUserDefaultPassword =
      appConfigs['new_user_default_password'] ?? '12345';
    const requiredColumns = ['first_name', 'last_name', 'email', 'password'];
    const parsedData: any = this.csvService.parse(file, requiredColumns);

    if (!parsedData.length) {
      throw new BadRequestException('CSV file is empty or has invalid data.');
    }

    const emails = parsedData
      .map((user) => user.email)
      .filter((email) => email);

    // Mark all users as inactive in a single query
    await this.userRepository.update(
      { company_id: company.id },
      { is_active: false },
    );

    // Fetch existing users in one query
    const existingUsers = await this.userRepository.find({
      where: { company_id: company.id, email: In(emails) },
    });

    const existingUserMap = new Map(
      existingUsers.map((user) => [user.email, user]),
    );

    const usersToUpdate = [];
    const usersToInsert = [];

    for (const user of parsedData) {
      if (!user.email) continue;

      const existingUser = existingUserMap.get(user.email);

      if (existingUser) {
        usersToUpdate.push({
          id: existingUser.id,
          first_name: user.first_name,
          last_name: user.last_name,
          is_active: true,
        });
      } else {
        usersToInsert.push({
          first_name: user.first_name ?? null,
          last_name: user.last_name ?? null,
          email: user.email ?? null,
          password: newUserDefaultPassword,
          company_id: company.id,
        });
      }
    }

    // Update Existing Users
    if (usersToUpdate.length) {
      const userToUpdateChunks = chunk(usersToUpdate, 100);

      for (const userUpdateBatch of userToUpdateChunks) {
        await Promise.all(
          userUpdateBatch.map((userData: any) =>
            this.userRepository.update(userData.id, {
              first_name: userData.first_name,
              last_name: userData.last_name,
              is_active: true,
            }),
          ),
        );
      }
    }

    // Insert New Users
    if (usersToInsert.length) {
      const userChunks = chunk(usersToInsert, 100);

      for (const userBatch of userChunks) {
        await Promise.all(
          userBatch.map(async (userData: any) => {
            const user = this.userRepository.create(userData);
            await this.userRepository.save(user);
          }),
        );
      }
    }

    return this.createUserRegistrationLog({
      company_id: company.id,
      csv_content: parsedData,
      meta: {
        total_active_users_before_upload: totalActiveUsersBeforeUpload,
        total_active_users_after_upload:
          await this.getTotalActiveUsersByStatusOfCompany(companyId),
      },
    });
  }

  async exportUsers(companyId: string) {
    const users = await this.userRepository.find({
      where: { company_id: companyId },
      select: ['first_name', 'last_name', 'email', 'is_active'],
    });

    if (users.length === 0) {
      throw new Error('No users found for this company.');
    }

    let csvContent = 'First Name,Last Name,Email,Status\n';

    csvContent += users
      .map(
        (user) =>
          `"${user.first_name}","${user.last_name}","${user.email}","${user.is_active ? 'Active' : 'Inactive'}"`,
      )
      .join('\n');

    return csvContent;
  }

  async createUserRegistrationLog(payload: CreateUserRegistrationLogDto) {
    const log = this.userRegistrationLogRepository.create(payload);
    return this.userRegistrationLogRepository.save(log);
  }
}
