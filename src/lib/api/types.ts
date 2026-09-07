export type ApiSuccess<TData> = {
  success: true;
  data: TData;
};

export type ApiFailure = {
  success: false;
  error: string;
  /** 可选的结构化错误明细（如批量导入的行级错误列表），由调用方自行解释 */
  details?: unknown;
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
