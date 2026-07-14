import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, from, throwError, timer } from 'rxjs';
import { catchError, mergeMap, retry } from 'rxjs/operators';
import { AiGenerationRequest, AiModelConfig } from './ai-image.types';

export class AiApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AiApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class AiImageApiService {
  constructor(private readonly http: HttpClient) {}

  generate(request: AiGenerationRequest, model: AiModelConfig, apiToken: string): Observable<Blob> {
    return this.http.post('/api/ai/generate', {
      token: apiToken,
      model: model.endpoint,
      mode: request.mode,
      prompt: request.prompt,
      sourceImageDataUrl: request.sourceImageDataUrl,
      parameters: {
        width: request.width,
        height: request.height,
        steps: request.steps,
        guidanceScale: request.guidanceScale,
        strength: request.strength,
      },
    }, { responseType: 'blob' }).pipe(
      retry({
        count: 3,
        delay: (error, retryIndex) => this.retryDelay(error, retryIndex),
      }),
      catchError((error) => from(this.normalizeError(error)).pipe(
        mergeMap((normalizedError) => throwError(() => normalizedError))
      ))
    );
  }

  private retryDelay(error: unknown, retryIndex: number): Observable<number> {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const retryable = status === 0 || status === 429 || status >= 500;
    return retryable
      ? timer(Math.min(800 * 2 ** (retryIndex - 1), 6400))
      : throwError(() => error);
  }

  private async normalizeError(error: unknown): Promise<AiApiError> {
    if (error instanceof HttpErrorResponse) {
      const detail = await this.readErrorDetail(error.error);
      return new AiApiError(this.messageForStatus(error.status, detail), error.status);
    }
    return new AiApiError('AI request failed unexpectedly.', 0);
  }

  private messageForStatus(status: number, detail: string): string {
    if (status === 400 || status === 422) return detail || 'The image or generation parameters are invalid.';
    if (status === 401 || status === 403) {
      return detail || 'Add a valid Hugging Face token or configure HF_TOKEN on the server.';
    }
    if (status === 402) return 'The Hugging Face inference credit is exhausted.';
    if (status === 413) return 'The source image is too large. Use a smaller canvas and try again.';
    if (status === 429) return 'Too many AI requests. Wait a moment before trying again.';
    if (status === 503) return detail || 'Qwen Image Edit is temporarily unavailable or has no active inference route.';
    if (status === 0) return 'The local AI gateway could not be reached. Check that the development server is running.';
    return detail ? `AI provider error (${status}): ${detail}` : `AI request failed (${status}).`;
  }

  private async readErrorDetail(errorBody: unknown): Promise<string> {
    try {
      const raw = errorBody instanceof Blob ? await errorBody.text() : errorBody;
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw) as { message?: unknown };
        return typeof parsed.message === 'string' ? parsed.message.slice(0, 300) : '';
      }
      if (raw && typeof raw === 'object' && 'message' in raw) {
        const message = (raw as { message?: unknown }).message;
        return typeof message === 'string' ? message.slice(0, 300) : '';
      }
    } catch {
      return '';
    }
    return '';
  }
}
