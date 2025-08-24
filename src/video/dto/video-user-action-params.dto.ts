import { IsIn } from 'class-validator';

export class VideoUserActionParamsDto {
  @IsIn(['queue', 'dequeue', 'rent', 'renew', 'return'], {
    message:
      'Invalid action. Allowed values are queue, dequeue, rent, renew, return.',
  })
  action: string;
}
