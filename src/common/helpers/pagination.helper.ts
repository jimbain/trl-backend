import { SelectQueryBuilder } from 'typeorm';
import { plainToInstance } from 'class-transformer';

export async function paginate<T, DTO>(
  queryBuilder: SelectQueryBuilder<T>,
  page: any,
  limit: any,
  dto?: new () => DTO,
) {
  page = isNaN(parseInt(page)) ? 1 : parseInt(page);
  limit = isNaN(parseInt(limit)) ? 20 : parseInt(limit);

  // Check if raw selects (aliases) are used
  const hasRawSelects = queryBuilder.expressionMap.selects.some(
    (select) => !select?.aliasName && select.selection.includes(' AS '),
  );

  let items: any[];
  let total: number;

  if (hasRawSelects) {
    const rawQueryBuilder = queryBuilder.clone();
    total = await rawQueryBuilder.getCount(); // Ensure total count fetches properly

    items = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getRawMany();
  } else {
    [items, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
  }

  const from = total > 0 ? (page - 1) * limit + 1 : null;
  const to = Math.min(page * limit, total);

  return {
    data: dto
      ? plainToInstance(dto, items, { excludeExtraneousValues: true })
      : items,
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
