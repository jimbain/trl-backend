import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  StreamableFile,
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
import { Readable } from 'stream';
import { QueryUserDto } from './dto/query-user.dto';
import { paginate } from 'src/common/helpers/pagination.helper';

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
    query: QueryUserDto,
    relations: string[] = [],
  ): Promise<
    | {
        data: UserListDto[];
        meta: PaginationMeta;
      }
    | { id: string; name: string }[]
  > {
    const {
      page,
      per_page,
      company_id,
      company_ids,
      name,
      email,
      status,
      sort_order,
      sort_column,
      is_basic,
    } = query;

    const queryBuilder = this.userRepository.createQueryBuilder('user');

    if (company_ids?.length) {
      queryBuilder.andWhere('user.company_id IN (:...company_ids)', {
        company_ids,
      });
    }

    if (is_basic) {
      const users = await queryBuilder
        .leftJoin('user.company', 'company')
        .select([
          'user.id AS id',
          `user.first_name || ' ' || user.last_name AS name`,
        ])
        .orderBy('company.name', 'ASC')
        .getRawMany();

      return users;
    }

    relations.forEach((relation) => {
      queryBuilder.leftJoinAndSelect(`user.${relation}`, relation);
    });

    if (company_id) {
      queryBuilder.andWhere('user.company_id = :companyId', {
        companyId: company_id,
      });
    }

    if (name) {
      queryBuilder.andWhere(
        '(user.first_name ILIKE :name OR user.last_name ILIKE :name)',
        {
          name: `%${name}%`,
        },
      );
    }

    if (email) {
      queryBuilder.andWhere('user.email ILIKE :email', {
        email: `%${email}%`,
      });
    }

    if (status === 'active') {
      queryBuilder.andWhere('user.is_active = :status', { status: true });
    } else if (status === 'inactive') {
      queryBuilder.andWhere('user.is_active = :status', { status: false });
    }

    queryBuilder.orderBy(`user.${sort_column}`, sort_order);

    return paginate(queryBuilder, page, per_page, UserListDto);
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
    const [company, totalActiveUsersBeforeUpload] = await Promise.all([
      this.companyService.findById(companyId),
      this.getTotalActiveUsersByStatusOfCompany(companyId),
    ]);

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
        const userUpdateObject: any = {
          id: existingUser.id,
          first_name: user.first_name,
          last_name: user.last_name,
          is_active: true,
        };

        if (user.password) {
          userUpdateObject.password = user.password;
        }

        usersToUpdate.push(userUpdateObject);
      } else {
        usersToInsert.push({
          first_name: user.first_name ?? null,
          last_name: user.last_name ?? null,
          email: user.email ?? null,
          password: user.password,
          company_id: company.id,
        });
      }
    }

    // Update Existing Users
    if (usersToUpdate.length) {
      const userToUpdateChunks = chunk(usersToUpdate, 100);

      for (const userUpdateBatch of userToUpdateChunks) {
        await Promise.all(
          userUpdateBatch.map((userData: any) => {
            const updateFields: any = {
              first_name: userData.first_name,
              last_name: userData.last_name,
              is_active: true,
            };

            if (userData.password) {
              updateFields.password = userData.password;
            }

            return this.userRepository.update(userData.id, updateFields);
          }),
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

  async exportUsers(companyId: string): Promise<StreamableFile> {
    const users = await this.userRepository.find({
      where: { company_id: companyId },
      select: ['first_name', 'last_name', 'email', 'is_active'],
    });

    if (users.length === 0) {
      throw new NotFoundException('No users found for this company.');
    }

    const header = 'First Name,Last Name,Email,Status\n';
    const csvData = users
      .map(
        (user) =>
          `${user.first_name},${user.last_name},${user.email},${user.is_active ? 'Active' : 'Inactive'}`,
      )
      .join('\n');

    const stream = new Readable();
    stream.push(header + csvData);
    stream.push(null); // End of stream

    return new StreamableFile(stream, {
      type: 'text/csv',
      disposition: `attachment; filename="company_${companyId}_users.csv"`,
    });
  }

  async createUserRegistrationLog(payload: CreateUserRegistrationLogDto) {
    const log = this.userRegistrationLogRepository.create(payload);
    return this.userRegistrationLogRepository.save(log);
  }
}
