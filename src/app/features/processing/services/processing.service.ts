import { HttpClient, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  ProcessingFilesResponse,
  ProcessingResponse,
  ProcessingTool,
  XmlToExcelConfig,
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

  create(tool: ProcessingTool): Observable<ProcessingResponse> {
    return this.http.post<ProcessingResponse>(this.baseUrl, { tool });
  }

  get(id: string): Observable<ProcessingResponse> {
    return this.http.get<ProcessingResponse>(this.urlFor(id), { timeout: 15000 });
  }

  start(id: string, freeFilesCount?: number): Observable<ProcessingResponse> {
    return this.http.post<ProcessingResponse>(
      `${this.urlFor(id)}/start`,
      freeFilesCount === undefined ? {} : { free_files_count: freeFilesCount },
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
