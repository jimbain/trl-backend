import { IsIn } from 'class-validator';

export class PharmaUserActionParamsDto {
  @IsIn(['queue', 'dequeue', 'rent', 'renew', 'return'], {
    message:
      'Invalid action. Allowed values are queue, dequeue, rent, renew, return.',
  })
  action: string;
}
