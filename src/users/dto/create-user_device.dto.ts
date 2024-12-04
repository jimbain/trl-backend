import { IsNotEmpty, IsString, IsEmail } from 'class-validator';

export class CreateUserDeviceDto {
    @IsString()
    @IsNotEmpty()
    os: string;

    @IsString()
    @IsNotEmpty()
    device_model: string;

    @IsString()
    @IsNotEmpty()
    device_id: string;

    @IsString()
    @IsNotEmpty()
    fcm_key: string;
}
