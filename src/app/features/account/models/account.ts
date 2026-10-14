import { ProcessingStatus, ProcessingTool } from '../../processing/models/processing';

export interface HistoryProcessing {
  readonly id: string;
  readonly tool: ProcessingTool;
  readonly status: ProcessingStatus;
  readonly created_at: string;
  readonly expires_at: string | null;
  readonly files_count: number;
  readonly successful_files_count: number;
  readonly failed_files_count: number;
  readonly total_value?: string | null;
  readonly products_summary?: {
    readonly items_count: number;
    readonly products_count: number;
    readonly total_value: string;
  } | null;
  readonly files_deleted: boolean;
  readonly can_delete_files: boolean;
  readonly result: { readonly available: boolean; readonly file_name: string | null };
}

export interface HistoryResponse {
  readonly data: readonly HistoryProcessing[];
  readonly meta: {
    readonly current_page: number;
    readonly last_page: number;
    readonly total: number;
    readonly per_page: number;
  };
}

export interface PasswordPayload {
  readonly current_password: string;
  readonly password: string;
  readonly password_confirmation: string;
}
