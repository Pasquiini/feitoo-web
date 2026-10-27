import { HttpClient, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AnalysisQuery, AnalysisView } from '../models/analysis';
import {
  ProcessingFilesResponse,
  ProcessingResponse,
  ProcessingTool,
  XmlToExcelConfig,
  OrganizerOptions,
} from '../models/processing';

@Injectable({ providedIn: 'root' })
export class ProcessingService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/processings`;

  configuration(
    tool: ProcessingTool = 'xml-to-excel',
  ): Observable<{ readonly data: XmlToExcelConfig }> {
    return this.http.get<{ readonly data: XmlToExcelConfig }>(
      `${environment.apiUrl}/tools/${tool}/config`,
      { timeout: 15000 },
    );
  }

  create(tool: ProcessingTool, organizer?: OrganizerOptions): Observable<ProcessingResponse> {
    return this.http.post<ProcessingResponse>(
      this.baseUrl,
      organizer ? { tool, organizer } : { tool },
    );
  }

  get(id: string): Observable<ProcessingResponse> {
    return this.http.get<ProcessingResponse>(this.urlFor(id), { timeout: 15000 });
  }

  start(
    id: string,
    freeFilesCount?: number,
    freeFileIds?: readonly string[],
  ): Observable<ProcessingResponse> {
    return this.http.post<ProcessingResponse>(
      `${this.urlFor(id)}/start`,
      freeFileIds
        ? { free_file_ids: freeFileIds }
        : freeFilesCount === undefined
          ? {}
          : { free_files_count: freeFilesCount },
    );
  }

  listFiles(id: string): Observable<ProcessingFilesResponse> {
    return this.http.get<ProcessingFilesResponse>(`${this.urlFor(id)}/files`, { timeout: 15000 });
  }

  download(id: string): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.urlFor(id)}/result`, {
      responseType: 'blob',
      observe: 'response',
    });
  }

  pdf(id: string, input: string): Observable<Blob> {
    return this.http.get(`${this.urlFor(id)}/pdf/${encodeURIComponent(input)}`, {
      responseType: 'blob',
      timeout: 30000,
    });
  }

  analysis(id: string, query: AnalysisQuery): Observable<{ data: AnalysisView }> {
    return this.http.get<{ data: AnalysisView }>(`${this.urlFor(id)}/analysis`, {
      params: this.analysisParams(query),
      timeout: 30000,
    });
  }
  exportAnalysis(id: string, query: AnalysisQuery): Observable<Blob> {
    return this.http.get(`${this.urlFor(id)}/analysis/export`, {
      params: this.analysisParams(query),
      responseType: 'blob',
      timeout: 60000,
    });
  }
  private analysisParams(query: AnalysisQuery): Record<string, string | number> {
    return Object.fromEntries(
      Object.entries(query).filter(([, value]) => value !== '' && value != null),
    );
  }

  upload(id: string, files: readonly File[]): Observable<ProcessingResponse> {
    const body = new FormData();
    files.forEach((file) => body.append('files[]', file, file.name));
    return this.http.post<ProcessingResponse>(`${this.urlFor(id)}/files`, body);
  }

  deleteFiles(id: string): Observable<ProcessingResponse> {
    return this.http.delete<ProcessingResponse>(`${this.urlFor(id)}/files`);
  }

  private urlFor(id: string): string {
    return `${this.baseUrl}/${encodeURIComponent(id)}`;
  }
}
