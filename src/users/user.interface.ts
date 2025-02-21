export interface ImportUser {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
}

export interface ExportUser {
  first_name: string;
  last_name: string;
  email: string;
  status: 'Active' | 'Inactive';
}
