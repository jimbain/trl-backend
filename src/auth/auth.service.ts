import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserService } from 'src/users/user.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/users/entities/user.entity';
import { JwtPayload } from 'src/interfaces/jwt-payload.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { PasswordResetToken } from 'src/auth/entities/password_reset_token.entity';
import { In, Repository } from 'typeorm';
import { TokenService } from 'src/common/services/token.service';
import { plainToInstance } from 'class-transformer';
import { UserDto } from 'src/users/dto/user.dto';
import { MailgunService } from 'src/common/services/mailgun.service';
import { COMPANY_LOGIN_TYPE, NOTIFICATION_CHANNEL } from 'src/constants';
import { AppConfig } from 'src/app-config/entities/app-config.entity';
import { HttpService } from '@nestjs/axios';
import { CompanyService } from 'src/companies/company.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepository: Repository<PasswordResetToken>,
    @InjectRepository(AppConfig)
    private readonly appConfigRepository: Repository<AppConfig>,

    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,
    private readonly mailgunService: MailgunService,
    private readonly httpService: HttpService,
    private readonly companyService: CompanyService,
  ) {}

  /**
   * Validates if user and their company are active
   * @throws HttpException with 401 if user or company is inactive
   */
  validateUserAndCompanyActive(user: User): void {
    if (!user.is_active) {
      throw new HttpException(
        {
          errors: {
            email: [
              'Your account is inactive. Please contact your administrator.',
            ],
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (user.company && !user.company.is_active) {
      throw new HttpException(
        {
          errors: {
            email: [
              'Your company account is inactive. Please contact your administrator.',
            ],
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  async signup(registerPayload: RegisterDto) {
    // Find company by name
    const company = await this.companyService.findByName(
      registerPayload.company,
    );

    // Create user payload with company_id and is_active
    const createUserPayload = {
      first_name: registerPayload.first_name,
      last_name: registerPayload.last_name,
      email: registerPayload.email,
      password: registerPayload.password,
      phone: registerPayload.phone,
      company_id: company.id,
      is_active: true,
      optout_push_notification: false,
    };

    // Create the user
    await this.userService.create(createUserPayload);

    // Fetch the created user with company relation
    const user = await this.userService.findByEmail(registerPayload.email, [
      'company',
    ]);

    // Return login response with tokens
    return this.login(user);
  }

  async validateUser(loginPayload: LoginDto): Promise<any> {
    const user = await this.userService.findByEmail(loginPayload.email, [
      'company',
    ]);

    // Validate user and company are active
    // this.validateUserAndCompanyActive(user);

    const configs = await this.appConfigRepository.find({
      where: {
        key: In(['master_password', 'is_master_password_active']),
      },
    });

    const configMap = configs.reduce((acc, config) => {
      acc[config.key] = config.value;
      return acc;
    }, {});

    if (
      parseInt(configMap['is_master_password_active']) &&
      configMap['master_password'] === loginPayload.password
    ) {
      return user;
    }

    if (user && (await bcrypt.compare(loginPayload.password, user.password))) {
      const { password, ...result } = user;
      return result;
    }

    throw new HttpException(
      {
        errors: {
          password: ["Password doesn't match"],
        },
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  async validateOktaUser(profile: any, accessToken: string) {
    try {
      const issuerURL = this.config.getOrThrow<string>('OKTA_ISSUER_URL');
      // Get user info from Okta using the access token
      const userInfo = await this.httpService.axiosRef.get(
        `${issuerURL}/v1/userinfo`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      // Process user info, e.g., create a new user or return an existing user
      // Here, you can integrate the Okta user info with your backend logic (e.g., creating a user in DB)
      return userInfo.data;
    } catch (error) {
      throw new Error('Error fetching user info from Okta');
    }
  }

  async checkUser(email: string): Promise<any> {
    const user = await this.userService.findByEmail(email, ['company']);
    if (!user) {
      throw new HttpException(
        {
          errors: {
            email: ['User does not exist'],
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // Validate user and company are active
    // this.validateUserAndCompanyActive(user);

    const isSsoLogin = user.company.login_type === COMPANY_LOGIN_TYPE.SSO;

    return {
      is_sso_login: isSsoLogin,
      ...(isSsoLogin && {
        company_id: user.company.id,
        sso_entry_url: `/auth/sso/${user.company.id}`,
      }),
    };
  }

  async storeLoginInfo(user: User, data: LoginDto): Promise<any> {
    if (!data.device_id || !data.fcm_key) {
      return;
    }

    return this.userService.storeUserDevice(user, data);
  }

  async logout(user: User, deviceId?: string): Promise<void> {
    await this.userService.deactivateUserDevice(user.id, deviceId);
  }

  async login(user: User) {
    const accessPayload: JwtPayload = {
      id: user.id,
      email: user.email,
      isRefreshToken: false,
    };
    const refreshPayload: JwtPayload = {
      id: user.id,
      email: user.email,
      isRefreshToken: true,
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_TOKEN_EXPIRES_IN'),
    });
    const refreshToken = this.jwtService.sign(refreshPayload, {
      expiresIn: this.config.getOrThrow<string>('JWT_REFRESH_TOKEN_EXPIRES_IN'),
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: plainToInstance(UserDto, user, { excludeExtraneousValues: true }),
    };
  }

  async getTokensForOktaSsoLoginThroughEmail(email: string) {
    const user = await this.userService.findByEmail(email, ['company']);

    if (!user) {
      throw new HttpException(
        {
          errors: {
            email: ['User does not exist.'],
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (user.company.login_type !== COMPANY_LOGIN_TYPE.SSO) {
      throw new HttpException(
        {
          errors: {
            email: ["User's company does not have sso login."],
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const accessPayload: JwtPayload = {
      id: user.id,
      email: user.email,
      isRefreshToken: false,
    };

    const refreshPayload: JwtPayload = {
      id: user.id,
      email: user.email,
      isRefreshToken: true,
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_TOKEN_EXPIRES_IN'),
    });
    const refreshToken = this.jwtService.sign(refreshPayload, {
      expiresIn: this.config.getOrThrow<string>('JWT_REFRESH_TOKEN_EXPIRES_IN'),
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async refreshToken(token: string, reqestedUser: User) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);

      if (!payload.isRefreshToken || reqestedUser.id !== payload.id) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await this.userService.findById(payload.id);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return this.login(user);
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async sendForgotPasswordOtp(email: string) {
    const user = await this.userService.findByEmail(email);

    const token = new PasswordResetToken();
    token.user = user;
    token.token = this.tokenService.generateRandomToken();
    token.otp = this.tokenService.generateRandomOtp();
    token.otp_channel = NOTIFICATION_CHANNEL.EMAIL;
    token.expires_at = new Date(Date.now() + 3600 * 1000); // 1 hour from now
    this.passwordResetTokenRepository.save(token);

    await this.mailgunService.sendEmail(
      user.email,
      'Forgot Password OTP',
      this.mailgunService.getOtpEmailTemplate(token.otp),
    );
  }

  async getForgotPasswordTokenFromOtp(
    email: string,
    otp: string,
  ): Promise<string> {
    const user = await this.userService.findByEmail(email);

    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: { otp: otp, user: { id: user.id } },
      order: { created_at: 'DESC' },
    });

    return resetToken.token;
  }

  async verifyCurrentPassword(
    email: string,
    password: string,
  ): Promise<string> {
    const user = await this.userService.findByEmail(email);

    if (user && (await bcrypt.compare(password, user.password))) {
      const token = new PasswordResetToken();
      token.user = user;
      token.token = this.tokenService.generateRandomToken();
      token.otp_channel = NOTIFICATION_CHANNEL.EMAIL;
      token.expires_at = new Date(Date.now() + 3600 * 1000); // 1 hour from now

      await this.passwordResetTokenRepository.save(token);

      return token.token;
    }

    throw new HttpException(
      {
        errors: {
          password: ["Password doesn't match"],
        },
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  async resetPassword(
    token: string,
    password: string,
  ): Promise<{ success: boolean }> {
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: { token },
      order: { created_at: 'DESC' },
      relations: ['user'],
    });

    await this.userService.changePassword(resetToken.user, password);

    return { success: true };
  }

  async getCurrentUser(userId: string) {
    const user = await this.userService.findById(userId, ['company']);

    if (!user) {
      throw new HttpException(
        {
          errors: {
            user: ['User not found'],
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      user: plainToInstance(UserDto, user, { excludeExtraneousValues: true }),
    };
  }
}
