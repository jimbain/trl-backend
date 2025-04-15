import { CatalogCategoryType } from 'src/constants';

export interface CachedCategory {
  id: string;
  name: string;
  type: CatalogCategoryType;
  title_ids: string[];
}
