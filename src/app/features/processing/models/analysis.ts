export interface AnalysisQuery {
  from?: string; to?: string; issuer?: string; document_query?: string; product_query?: string;
  issuer_sort?: 'value' | 'count'; document_sort?: 'date' | 'number' | 'value' | 'status'; direction?: 'asc' | 'desc';
  per_page?: number; document_page?: number; product_page?: number; issuer_page?: number; issue_page?: number;
}
export interface AnalysisPage<T> { readonly data: readonly T[]; readonly total: number; readonly page: number; readonly last_page: number; readonly per_page: number; }
export interface AnalysisSummary {
  readonly documents_count: number; readonly total_value: string | null; readonly average_value: string | null;
  readonly documents_with_total: number; readonly documents_without_total: number; readonly issuers_count: number;
  readonly untrusted_issuer_groups: number; readonly products_count: number; readonly items_count: number;
  readonly period_start: string | null; readonly period_end: string | null;
}
export interface AnalysisAudit { readonly uploaded_files: number; readonly analyzed_files: number; readonly considered_documents: number; readonly duplicates_ignored: number; readonly conflict_files: number; readonly conflicting_keys: number; readonly invalid_files: number; }
export interface AnalysisIssuer { readonly id: string; readonly name: string; readonly document: string | null; readonly trusted: boolean; readonly documents_count: number; readonly total_value: string | null; readonly percentage: string | null; readonly last_issue_date: string; readonly documents_without_total: number; }
export interface AnalysisProduct { readonly code: string | null; readonly product: string; readonly ncm: string; readonly unit: string; readonly total_quantity: string; readonly total_value: string; readonly invoice_count: number; readonly issuer_name: string; readonly issuer_document: string | null; readonly issuer_id: string; }
export interface AnalysisDocument { readonly file_id: string; readonly file_name: string; readonly analysis_status: 'included' | 'duplicate' | 'conflict' | 'invalid'; readonly included: boolean; readonly number?: string; readonly series?: string; readonly access_key?: string; readonly issued_at?: string; readonly issuer_name?: string; readonly recipient_name?: string | null; readonly total_value?: string | null; readonly error_message?: string | null; readonly notes?: readonly string[]; }
export interface AnalysisView {
  readonly notice: string; readonly filters: AnalysisQuery; readonly summary: AnalysisSummary; readonly audit: AnalysisAudit;
  readonly monthly: readonly { month: string; documents_count: number; total_value: string | null; documents_without_total: number; value_bar: string; count_bar: string; }[];
  readonly issuer_options: readonly Pick<AnalysisIssuer, 'id' | 'name' | 'document' | 'trusted'>[];
  readonly issuers: AnalysisPage<AnalysisIssuer>; readonly products: AnalysisPage<AnalysisProduct>; readonly documents: AnalysisPage<AnalysisDocument>;
  readonly inconsistencies: AnalysisPage<{ file_name: string; access_key: string | null; status: string; message: string }>;
  readonly taxes: Readonly<Record<string, { total: string | null; documents_with_field: number; documents_without_field: number; source: string }>>;
}
