export interface CompanySearchInterface {
  page?: string;
  per_page?: string;
  name?: string;
  status?: 'active' | 'inactive' | 'all' | null;
  sort_order?: 'ASC' | 'DESC';
  sort_column?: string;
}
