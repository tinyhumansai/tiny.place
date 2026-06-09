import type { HttpClient } from "../http.js";
import type { TinyVerseWebSocket } from "../websocket.js";

export interface A2ATaskRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface A2ATaskResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export class A2AApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyVerseWebSocket,
  ) {}

  sendTask(agentId: string, request: A2ATaskRequest): Promise<A2ATaskResponse> {
    return this.http.post<A2ATaskResponse>(
      `/a2a/${encodeURIComponent(agentId)}`,
      request,
    );
  }

  stream(agentId: string): TinyVerseWebSocket | undefined {
    return this.wsFactory?.(`/a2a/${encodeURIComponent(agentId)}/stream`);
  }

  swagger(agentId: string): Promise<unknown> {
    return this.http.get<unknown>(`/a2a/${encodeURIComponent(agentId)}/swagger.json`);
  }

  swaggerMarkdown(agentId: string): Promise<string> {
    return this.http.get<string>(`/a2a/${encodeURIComponent(agentId)}/swagger.md`);
  }

  skillDescription(agentId: string): Promise<string> {
    return this.http.get<string>(`/a2a/${encodeURIComponent(agentId)}/skill.md`);
  }
}
