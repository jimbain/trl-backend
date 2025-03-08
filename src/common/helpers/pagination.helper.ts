import { SelectQueryBuilder } from 'typeorm';
import { plainToInstance } from 'class-transformer';

export async function paginate<T, DTO>(
  queryBuilder: SelectQueryBuilder<T>,
  page: any,
  limit: any,
  dto: new () => DTO,
) {
  page = isNaN(parseInt(page)) ? 1 : parseInt(page);
  limit = isNaN(parseInt(limit)) ? 20 : parseInt(limit);

  const [items, total] = await queryBuilder
    .skip((page - 1) * limit)
    .take(limit)
    .getManyAndCount();

  const from = total > 0 ? (page - 1) * limit + 1 : null;
  const to = Math.min(page * limit, total);

  return {
    data: plainToInstance(dto, items, { excludeExtraneousValues: true }),
    meta: {
      current_page: page,
      per_page: limit,
      total,
      last_page: Math.ceil(total / limit),
      from,
      to,
    },
  };
}
