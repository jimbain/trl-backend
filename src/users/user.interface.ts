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

export interface UserActivityMeta {
  credit_used?: number;
  start_time?: Date;
  end_time?: Date;
  keep_at?: Date;
  start_part_number?: number;
  start_chapter_number?: number;
  start_position?: number;
  end_part_number?: number;
  end_chapter_number?: number;
  end_position?: number;
  total_time_played?: number;
}
