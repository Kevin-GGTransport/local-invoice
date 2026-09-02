export type ApiSuccess<TData> = {
  success: true;
  data: TData;
};

export type ApiFailure = {
  success: false;
  error: string;
};

export type ApiResponse<TData> = ApiSuccess<TData> | ApiFailure;

export type Pagination = {
  total: number;
  page: number;
  pageSize: number;
};

export type PaginatedData<TItem> = {
  rows: TItem[];
  pagination: Pagination;
};
