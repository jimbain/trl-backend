import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { CsvImportException } from 'src/common/exceptions/validation.exception';
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
import * as bcrypt from 'bcryptjs';
import { CreateUserRegistrationLogDto } from './dto/create-user-registration-log.dto';
import { UserRegistrationLog } from './entities/user_registration_log.entity';
import { QueryUserDto } from './dto/query-user.dto';
import { paginate } from 'src/common/helpers/pagination.helper';
import pLimit from 'p-limit';
import { format } from '@fast-csv/format';
import { ulid } from 'ulidx';

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
    const queryBuilder = this.userRepository.createQueryBuilder('user');

    // Load relations if provided
    relations.forEach((relation) => {
      queryBuilder.leftJoinAndSelect(`user.${relation}`, relation);
    });

    // Case-insensitive email comparison using LOWER()
    queryBuilder.where('LOWER(user.email) = LOWER(:email)', { email });

    return queryBuilder.getOne();
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

    if (sort_column === 'is_active') {
      // Handle boolean field sorting: CASE expression to convert boolean to sortable values
      queryBuilder.orderBy(
        `CASE WHEN user.${sort_column} = true THEN 1 ELSE 0 END`,
        sort_order,
      );
    } else {
      queryBuilder.orderBy(`user.${sort_column}`, sort_order);
    }

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
    // Validate file extension and MIME type (Windows may send different MIME types)
    const validMimeTypes = [
      'text/csv',
      'application/csv',
      'text/x-csv',
      'application/vnd.ms-excel',
      'text/plain',
    ];
    const isValidExtension = file.originalname.toLowerCase().endsWith('.csv');
    const isValidMimeType = validMimeTypes.some((type) =>
      file.mimetype.includes(type),
    );

    if (!isValidExtension || !isValidMimeType) {
      throw new CsvImportException(
        'Invalid file format',
        'Invalid file format. Only CSV file is allowed.',
      );
    }

    // Fetch company and config in parallel
    const [company, totalActiveUsersBeforeUpload] = await Promise.all([
      this.companyService.findByIdWithCache(companyId),
      this.getTotalActiveUsersByStatusOfCompany(companyId),
    ]);

    // Get company-specific config with default password
    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );
    const defaultPassword = appConfigs.new_user_default_password || null;

    const requiredColumns = ['first_name', 'last_name', 'email'];
    const parsedData: any = this.csvService.parse(file, requiredColumns);

    if (!parsedData.length) {
      throw new CsvImportException(
        'Empty or invalid CSV',
        'CSV file is empty or has invalid data. Ensure it has required columns: first_name, last_name, email',
      );
    }

    const emails = parsedData
      .map((user: any) => user.email)
      .filter((email: any) => email);

    // VALIDATION: Check for duplicates within CSV file itself
    const emailCounts = new Map<string, number>();
    for (const email of emails) {
      emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
    }

    const csvDuplicates = Array.from(emailCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([email, count]) => ({ email, occurrences: count }));

    if (csvDuplicates.length > 0) {
      throw new CsvImportException(
        'Duplicate entries found in CSV file',
        `${csvDuplicates.length} email(s) appear multiple times in your CSV file. Please remove duplicates and try again.`,
        {
          duplicate_count: csvDuplicates.length,
          duplicates: csvDuplicates,
        },
      );
    }

    // Mark all users as inactive in a single query
    await this.userRepository.update(
      { company_id: company.id },
      { is_active: false },
    );

    // Fetch existing users in this company in one query
    const existingUsers = await this.userRepository.find({
      where: { company_id: company.id, email: In(emails) },
      select: ['id', 'email', 'first_name', 'last_name'],
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
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          is_active: true,
        };

        // Only include password if it's provided and not null/empty
        if (user.password) {
          userUpdateObject.password = user.password;
        }

        usersToUpdate.push(userUpdateObject);
      } else {
        usersToInsert.push({
          first_name: user.first_name ?? null,
          last_name: user.last_name ?? null,
          email: user.email ?? null,
          password: user.password || defaultPassword || null,
          company_id: company.id,
          is_active: true,
        });
      }
    }

    // Parallel bcrypt hashing with concurrency limit (use CPU core count)
    const limit = pLimit(8); // Limit to 8 concurrent bcrypt operations
    const salt = await bcrypt.genSalt(10); // Generate salt once

    // Update Existing Users
    if (usersToUpdate.length) {
      // Hash passwords in parallel with concurrency limit
      const hashedUpdates = await Promise.all(
        usersToUpdate.map((userData: any) =>
          limit(async () => {
            const updateFields: any = {
              first_name: userData.first_name,
              last_name: userData.last_name,
              is_active: true,
            };

            // Only hash password if provided
            if (userData.password) {
              updateFields.password = await bcrypt.hash(
                userData.password,
                salt,
              );
            }

            return { id: userData.id, updateFields };
          }),
        ),
      );

      // Bulk update in chunks using query builder for better performance
      const updateChunks = chunk(hashedUpdates, 500);

      for (const updateBatch of updateChunks) {
        await Promise.all(
          updateBatch.map(({ id, updateFields }) =>
            this.userRepository.update(id, updateFields),
          ),
        );
      }
    }

    // Insert New Users
    if (usersToInsert.length) {
      // Validate that all new users have passwords
      const usersWithoutPasswords = usersToInsert.filter(
        (user) => !user.password || user.password.trim() === '',
      );

      if (usersWithoutPasswords.length > 0) {
        const missingPasswordEmails = usersWithoutPasswords
          .map((user) => user.email)
          .slice(0, 5) // Show first 5 emails
          .join(', ');

        const additionalCount =
          usersWithoutPasswords.length > 5
            ? ` and ${usersWithoutPasswords.length - 5} more`
            : '';

        throw new CsvImportException(
          'Missing passwords for new users',
          `${usersWithoutPasswords.length} new user(s) are missing passwords. New users must have a password in CSV or a default password configured for the company. Users without passwords: ${missingPasswordEmails}${additionalCount}`,
          {
            missing_password_count: usersWithoutPasswords.length,
            missing_password_emails: usersWithoutPasswords.map(
              (user) => user.email,
            ),
          },
        );
      }

      // Check if any emails exist in other companies
      const emailsToInsert = usersToInsert.map((user) => user.email);
      const existingEmailsInOtherCompanies = await this.userRepository.find({
        where: {
          email: In(emailsToInsert),
          company_id: Not(company.id),
        },
        select: ['email'],
      });

      if (existingEmailsInOtherCompanies.length > 0) {
        const duplicateEmails = existingEmailsInOtherCompanies.map(
          (user) => user.email,
        );
        throw new CsvImportException(
          'Duplicate emails in other companies',
          `${duplicateEmails.length} email address(es) already exist in another company. Please use different email addresses or contact support.`,
          {
            duplicate_count: duplicateEmails.length,
            duplicates: duplicateEmails,
          },
        );
      }

      // Hash passwords and generate IDs in parallel with concurrency limit
      const hashedUsers = await Promise.all(
        usersToInsert.map((userData: any) =>
          limit(async () => {
            const userWithId = {
              ...userData,
              id: 'user_' + ulid(), // Generate ULID manually since @BeforeInsert hooks don't run with query builder
            };

            // Only hash if password exists
            if (userData.password) {
              return {
                ...userWithId,
                password: await bcrypt.hash(userData.password, salt),
              };
            }
            return userWithId;
          }),
        ),
      );

      // Bulk insert in chunks of 500 for better performance
      const insertChunks = chunk(hashedUsers, 500);

      for (const userBatch of insertChunks) {
        await this.userRepository
          .createQueryBuilder()
          .insert()
          .into(User)
          .values(userBatch)
          .execute();
      }
    }

    const totalActiveUsersAfterUpload =
      await this.getTotalActiveUsersByStatusOfCompany(companyId);

    // Prepare detailed info about updated entries
    const updatedEntries = usersToUpdate.map((user) => ({
      email: user.email || 'unknown',
      name: `${user.first_name} ${user.last_name}`.trim(),
    }));

    const registrationLog = await this.createUserRegistrationLog({
      company_id: company.id,
      csv_content: [], // Store empty array instead of full CSV content to save database space
      meta: {
        total_active_users_before_upload: totalActiveUsersBeforeUpload,
        total_active_users_after_upload: totalActiveUsersAfterUpload,
        total_users_processed: parsedData.length,
        total_users_updated: usersToUpdate.length,
        total_users_inserted: usersToInsert.length,
        import_timestamp: new Date().toISOString(),
      },
    });

    return {
      ...registrationLog,
      summary: {
        total_processed: parsedData.length,
        total_updated: usersToUpdate.length,
        total_inserted: usersToInsert.length,
        updated_entries: updatedEntries,
      },
    };
  }

  async exportUsers(companyId: string): Promise<StreamableFile> {
    // Stream users from database to avoid loading all into memory
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.first_name',
        'user.last_name',
        'user.email',
        'user.is_active',
      ])
      .where('user.company_id = :companyId', { companyId });

    // Check if any users exist
    const count = await queryBuilder.getCount();
    if (count === 0) {
      throw new NotFoundException('No users found for this company.');
    }

    // Create CSV formatter stream
    const csvStream = format({
      headers: ['First Name', 'Last Name', 'Email', 'Status', 'Password'],
      writeHeaders: true,
    });

    // Stream database results directly to CSV
    const userStream = await queryBuilder.stream();

    userStream.on('data', (user: any) => {
      csvStream.write({
        'First Name': user.user_first_name || '',
        'Last Name': user.user_last_name || '',
        Email: user.user_email || '',
        Status: user.user_is_active ? 'Active' : 'Inactive',
        Password: '', // Empty password field for export
      });
    });

    userStream.on('end', () => {
      csvStream.end();
    });

    userStream.on('error', (error) => {
      csvStream.destroy(error);
    });

    return new StreamableFile(csvStream, {
      type: 'text/csv',
      disposition: `attachment; filename="company_${companyId}_users.csv"`,
    });
  }

  async createUserRegistrationLog(payload: CreateUserRegistrationLogDto) {
    const log = this.userRegistrationLogRepository.create(payload);
    return this.userRegistrationLogRepository.save(log);
  }
}
