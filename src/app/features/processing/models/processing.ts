export type ProcessingStatus =
  'pending' | 'uploading' | 'queued' | 'processing' | 'completed' | 'failed' | 'expired';

export type ProcessingTool = keyof typeof import('../tools').processingTools;

export interface XmlToExcelConfig {
  readonly max_request_size_kb?: number;
  readonly max_processing_files?: number;
  readonly max_processing_items?: number;
  readonly max_total_size_kb?: number;
  readonly free?: { per_processing: number; daily: number };
  readonly packages?: readonly import('../services/billing.service').PurchasePackage[];
  readonly checkout_available?: boolean;
  readonly max_files: number;
  readonly max_file_size_kb: number;
  readonly ttl_minutes: number;
}
export type ProcessingFileKind = 'input' | 'output';

export interface Processing {
  readonly analyzer?: { readonly summary: import('./analysis').AnalysisSummary | null; readonly audit: import('./analysis').AnalysisAudit | null };
  readonly organizer?: {
    readonly options: OrganizerOptions;
    readonly summary: OrganizerSummary | null;
  };
  readonly preview?: ProcessingPreview | null;
  readonly id: string;
  readonly tool: ProcessingTool;
  readonly status: ProcessingStatus;
  readonly files_count: number;
  readonly processed_files_count: number;
  readonly successful_files_count: number;
  readonly failed_files_count: number;
  readonly total_size: number;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly expires_at: string | null;
  readonly created_at: string;
  readonly result: {
    readonly available: boolean;
    readonly file_name: string | null;
    readonly size: number | null;
    readonly error_message: string | null;
  };
}

export interface ProcessingPreview {
  readonly summary: {
    readonly successful_documents_count: number;
    readonly failed_documents_count: number;
    readonly items_count: number;
    readonly total_value: string;
    readonly documents_without_total_count: number;
    readonly products_count?: number;
  };
  readonly products_preview?: readonly ConsolidatedProduct[];
  readonly notes_preview: readonly {
    readonly number: string;
    readonly series: string;
    readonly issued_at: string;
    readonly issuer_name: string | null;
    readonly recipient_name: string | null;
    readonly items_count: number;
    readonly total_value: string | null;
  }[];
  readonly items_preview: readonly {
    readonly note_reference?: string;
    readonly issuer_name?: string | null;
    readonly note_number: string;
    readonly series: string;
    readonly code: string | null;
    readonly product: string | null;
    readonly quantity: string;
    readonly unit_value: string | null;
    readonly total_value: string;
    readonly ncm?: string;
    readonly cfop?: string;
    readonly unit?: string;
    readonly issued_at?: string;
    readonly issuer_document?: string;
  }[];
}

export interface ConsolidatedProduct {
  readonly code: string | null;
  readonly product: string;
  readonly issuer_document: string;
  readonly issuer_name: string;
  readonly ncm: string;
  readonly unit: string;
  readonly total_quantity: string;
  readonly invoice_count: number;
  readonly minimum_unit_value: string | null;
  readonly maximum_unit_value: string | null;
  readonly average_unit_value: string | null;
  readonly total_value: string;
}

export interface ProcessingResponse {
  readonly data: Processing;
}

export type ProcessingFileStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'removed';
export type ProcessingFileError =
  | 'analysis_capacity'
  | 'invalid_protocol'
  | 'duplicate_document'
  | 'pdf_error'
  | 'invalid_xml'
  | 'unsupported_document'
  | 'missing_required_field'
  | 'parse_error'
  | 'storage_error';

export interface ProcessingFile {
  readonly organization?: {
    readonly archive_path: string | null;
    readonly final_name: string | null;
    readonly folder: string | null;
    readonly duplicate_kind: string | null;
    readonly key_conflict: boolean;
    readonly notes: readonly string[];
  } | null;
  readonly document?: {
    access_key: string;
    number: string;
    series: string;
    issuer_name: string | null;
    recipient_name: string | null;
    total_value: string | null;
    notice: string;
  } | null;
  readonly id: string;
  readonly original_name: string | null;
  readonly status: ProcessingFileStatus;
  readonly size: number;
  readonly processed_at: string | null;
  readonly error_code: ProcessingFileError | null;
  readonly error_message: string | null;
}

export interface ProcessingFilesResponse {
  readonly data: readonly ProcessingFile[];
}

export interface OrganizerOptions {
  criterion: 'year_month' | 'supplier' | 'issuer_document' | 'year_month_supplier' | 'model';
  detect_duplicates: boolean;
  duplicate_action: 'keep' | 'separate';
  report: boolean;
  standardize_names: boolean;
}
export const defaultOrganizerOptions: OrganizerOptions = {
  criterion: 'year_month',
  detect_duplicates: true,
  duplicate_action: 'separate',
  report: true,
  standardize_names: true,
};
export interface OrganizerSummary {
  readonly total_files: number;
  readonly organized_count: number;
  readonly duplicates_count: number;
  readonly invalid_count: number;
  readonly suppliers_count: number;
  readonly preserved_count: number;
  readonly conflicting_keys_count: number;
  readonly warnings_count: number;
  readonly duplicate_detection: boolean;
  readonly documents_by_month: Readonly<Record<string, number>>;
  readonly notice: string;
}
