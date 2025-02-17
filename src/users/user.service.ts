import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from 'src/users/entities/user.entity';
import { plainToInstance } from 'class-transformer';
import { UserDto, UserListDto } from './dto/user.dto';
import { UserDevice } from './entities/user_device.entity';
import { CreateUserDeviceDto } from './dto/create-user_device.dto';
import { PaginationMeta } from 'src/common/interfaces';
import * as xlsx from 'xlsx';
import { AppConfigService } from 'src/app-config/app-config.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(UserDevice)
    private readonly userDeviceRepository: Repository<UserDevice>,

    private readonly appConfigService: AppConfigService,
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

  async importUsers(file: Express.Multer.File, companyId: string) {
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const users = xlsx.utils.sheet_to_json(worksheet);

    const appConfigs = await this.appConfigService.getAppConfigs([
      'new_user_default_password',
    ]);

    const newUserDefaultPassword =
      appConfigs['new_user_default_password'] ?? '12345';

    for (const user of users) {
      const processedUser = this.userRepository.create({
        first_name: user['First Name'] || '',
        last_name: user['Last Name'] || '',
        title: user['Title'] || '',
        email: user['Email'] || '',
        password: newUserDefaultPassword,
        company_id: companyId,
      });

      await this.userRepository.save(processedUser);
    }
  }

  async exportUsers(companyId: string) {
    const users = await this.userRepository.find({
      where: { company_id: companyId },
      select: ['first_name', 'last_name', 'title', 'email'],
    });

    if (users.length === 0) {
      throw new Error('No users found for this company.');
    }

    const formattedUsers = users.map((user) => ({
      'First Name': user.first_name,
      'Last Name': user.last_name,
      Title: user.title,
      Email: user.email,
    }));

    // Create worksheet and workbook
    const worksheet = xlsx.utils.json_to_sheet(formattedUsers);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Users');

    // Write to buffer
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return buffer;
  }
}
