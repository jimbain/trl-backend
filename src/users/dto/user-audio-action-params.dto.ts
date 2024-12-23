import { IsIn } from 'class-validator';

export class UserAudioActionParamsDto {
  @IsIn(['dequeue', 'renew', 'return', 'queue', 'rent', 'bookself'], {
    message: 'Invalid action. Allowed values are renew, return, dequeue.',
  })
  action: string;
}
