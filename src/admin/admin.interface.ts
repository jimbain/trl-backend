export interface CompanySearchInterface {
  page?: string;
  per_page?: string;
  name?: string;
  status?: 'active' | 'inactive' | 'all' | null;
}
