import {
  Controller,
  Param,
  UseGuards,
  Request,
  Post,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PharmaUserStatusService } from '../services/pharma-user-status.service';
import { PharmaUserActionParamsDto } from '../dto/pharma-user-action-params.dto';

@UseGuards(JwtAuthGuard)
@Controller('user-pharmas')
export class PharmaUserStatusController {
  constructor(
    private readonly pharmaUserStatusService: PharmaUserStatusService,
  ) {}

  @HttpCode(200)
  @Post(':id/actions/:action')
  audioAction(
    @Param('id') id: string,
    @Param() params: PharmaUserActionParamsDto,
    @Request() req,
  ) {
    const { action } = params;

    if (action === 'queue') {
      return this.pharmaUserStatusService.queue(id, req.user);
    } else if (action === 'dequeue') {
      return this.pharmaUserStatusService.dequeue(id, req.user);
    } else if (action === 'rent') {
      return this.pharmaUserStatusService.rent(id, req.user);
    } else if (action === 'renew') {
      return this.pharmaUserStatusService.renew(id, req.user);
    } else if (action === 'return') {
      return this.pharmaUserStatusService.return(id, req.user);
    }
  }
}
