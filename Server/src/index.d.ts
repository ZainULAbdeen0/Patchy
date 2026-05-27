declare module 'nextjs-server-inspector' {
  export interface InspectorOptions {
    port?: number;
    logToConsole?: boolean;
    filter?: (request: RequestData) => boolean;
  }

  export interface RequestData {
    id: string;
    timestamp: string;
    type: 'http' | 'fetch' | 'middleware' | 'manual';
    method: string;
    url: string;
    requestHeaders: Record<string, string>;
    requestBody: unknown;
    status: number;
    statusText: string;
    responseHeaders: Record<string, string>;
    responseBody: unknown;
    duration: number;
  }

  export function init(options?: InspectorOptions): void;
  export function withInspector<T>(middlewareFn: (req: T, event: unknown) => unknown): (req: T, event: unknown) => unknown;
  export function trackRequest<T>(method: string, url: string, fn: () => Promise<T>): Promise<T>;
  export function stopSocketServer(): void;
}