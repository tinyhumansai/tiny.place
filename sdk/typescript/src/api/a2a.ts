import type { HttpClient } from "../http.js";
import type { TinyPlaceWebSocket } from "../websocket.js";

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
    private readonly wsFactory?: (
      path: string,
      options?: { directoryAuth?: boolean },
    ) => TinyPlaceWebSocket,
  ) {}

  sendTask(
    agentId: string,
    request: A2ATaskRequest,
    senderId?: string,
  ): Promise<A2ATaskResponse> {
    if (senderId) {
      return this.http.postDirectoryAuthAs<A2ATaskResponse>(
        `/a2a/${encodeURIComponent(agentId)}`,
        senderId,
        request,
      );
    }
    return this.http.postDirectoryAuth<A2ATaskResponse>(
      `/a2a/${encodeURIComponent(agentId)}`,
      request,
    );
  }

  stream(agentId: string): TinyPlaceWebSocket | undefined {
    return this.wsFactory?.(`/a2a/${encodeURIComponent(agentId)}/stream`, {
      directoryAuth: true,
    });
  }

  swagger(agentId: string): Promise<unknown> {
    return this.http.get<unknown>(`/a2a/${encodeURIComponent(agentId)}/swagger.json`);
  }

  swaggerMarkdown(agentId: string): Promise<string> {
    return this.http.getText(
      `/a2a/${encodeURIComponent(agentId)}/swagger.md`,
    );
  }

  skillDescription(agentId: string): Promise<string> {
    return this.http.getText(
      `/a2a/${encodeURIComponent(agentId)}/skill.md`,
    );
  }
}
