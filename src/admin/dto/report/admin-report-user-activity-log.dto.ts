import { Expose, Type, Transform } from 'class-transformer';
import { StringHelper } from 'src/common/helpers/string.helper';
import { DateTimeHelper } from 'src/common/helpers/datetime.helper';
import { USER_ACTIVITY } from 'src/constants';

class AudioDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  sku: string;

  @Expose()
  runtime: number;

  @Expose()
  trl_cost: number;
}

class PharmaDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  sku: string;

  @Expose()
  runtime: number;
}

class VideoDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  sku: string;

  @Expose()
  runtime: string;
}

class CompanyDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  logo: string | null;
}

class UserDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  email: string;
}

export class AdminReportUserActivityLogDto {
  @Expose({ name: 'item_type' })
  @Transform(({ value }) => StringHelper.capitalize(value))
  item_type: string;

  @Expose({ name: 'action' })
  @Transform(({ value }) =>
    ['rent', 'renew'].includes(value) ? 'Rent' : 'Purchase',
  )
  action: 'Rent' | 'Purchase';

  @Expose()
  @Transform(({ obj }) => obj.meta?.credit_used)
  trl_credit: number;

  @Expose()
  @Transform(({ obj }) =>
    obj?.action === USER_ACTIVITY.KEEP
      ? DateTimeHelper.format(obj.meta?.keep_at, 'MM/DD/YYYY')
      : DateTimeHelper.format(obj.meta?.start_time, 'MM/DD/YYYY'),
  )
  start_date: string;

  @Expose()
  @Transform(({ obj }) =>
    obj?.action === USER_ACTIVITY.KEEP
      ? null
      : DateTimeHelper.format(obj.meta?.end_time, 'MM/DD/YYYY'),
  )
  end_date: string;

  @Expose()
  @Transform(({ obj }) => obj.action === 'renew')
  is_renewed: boolean;

  @Expose()
  @Type(() => AudioDto)
  @Transform(({ obj }) =>
    obj.item_type === 'audio'
      ? {
          id: obj.audio_id,
          title: obj.audio_display_title,
          sku: obj.audio_sku,
          runtime: obj.metadata_runtime,
          trl_cost: obj.audio_bookshelf_credit_cost,
        }
      : null,
  )
  audio: AudioDto | null;

  @Expose()
  @Type(() => PharmaDto)
  @Transform(({ obj }) =>
    obj.item_type === 'pharma'
      ? {
          id: obj.pharma_id,
          title: obj.pharma_title,
          sku: obj.pharma_sku,
          runtime: obj.pharma_runtime,
        }
      : null,
  )
  pharma: PharmaDto | null;

  @Expose()
  @Type(() => VideoDto)
  @Transform(({ obj }) =>
    obj.item_type === 'video'
      ? {
          id: obj.video_id,
          title: obj.video_title,
          sku: obj.video_sku,
          runtime: obj.video_runtime,
        }
      : null,
  )
  video: VideoDto | null;

  @Expose()
  @Type(() => CompanyDto)
  @Transform(({ obj }) => {
    return {
      id: obj?.company_id,
      name: obj?.company_name,
      logo: obj?.company_logo_url
        ? `${process.env.DO_BUCKET_FRONTEND_ENDPOINT}/${obj?.company_logo_url}`
        : null,
    };
  })
  company: CompanyDto;

  @Expose()
  @Type(() => UserDto)
  @Transform(({ obj }) => {
    return {
      id: obj?.user_id,
      name: `${obj?.user_first_name ?? ''} ${obj?.user_last_name ?? ''}`,
      email: obj?.user_email,
    };
  })
  user: UserDto;

  @Expose()
  @Transform(({ obj }) => {
    let ms = Number(obj?.listened_time_ms || 0);

    // Get runtime in milliseconds for comparison
    const runtime = obj?.metadata_runtime || '00:00:00';
    const [hours, minutes, seconds] = runtime.split(':').map(Number);
    const runtimeMs = (hours * 3600 + minutes * 60 + seconds) * 1000;

    // If listened time is greater than runtime, divide by 10
    if (ms > runtimeMs && runtimeMs > 0) {
      ms = ms / 10;
    }

    const hoursResult = Math.floor(ms / 3600000);
    const minutesResult = Math.floor((ms % 3600000) / 60000);
    const secondsResult = Math.floor((ms % 60000) / 1000);
    return `${hoursResult.toString().padStart(2, '0')}:${minutesResult
      .toString()
      .padStart(2, '0')}:${secondsResult.toString().padStart(2, '0')}`;
  })
  listened_time: string;

  @Expose()
  @Transform(({ obj }) => {
    let listenedMs = Number(obj?.listened_time_ms || 0);
    const runtime = obj?.metadata_runtime || '00:00:00';
    const [hours, minutes, seconds] = runtime.split(':').map(Number);
    const runtimeMs = (hours * 3600 + minutes * 60 + seconds) * 1000;

    if (runtimeMs === 0) return '0.00%';

    // If listened time is greater than runtime, divide by 10
    if (listenedMs > runtimeMs) {
      listenedMs = listenedMs / 10;
    }

    const percentage = (listenedMs / runtimeMs) * 100;
    return `${Math.round(percentage)}%`;
  })
  listening_percentage: string;

  @Expose()
  @Transform(({ obj }) =>
    DateTimeHelper.format(obj.created_at, 'M/D/YYYY h:mm:ss A'),
  )
  created_at: string;
}
