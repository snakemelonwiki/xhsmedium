export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
  [key: string]: string | number | boolean | null | undefined;
}
