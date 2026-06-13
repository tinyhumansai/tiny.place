import type { HttpClient } from "../http.js";
import type {
  McpInitializeResult,
  McpJsonRpcRequest,
  McpRequestOptions,
  McpResponse,
  McpStreamOptions,
  McpTerminateResponse,
} from "../types/index.js";

export class McpApi {
  constructor(private readonly http: HttpClient) {}

  async request<Result = unknown>(
    message: McpJsonRpcRequest,
    options?: McpRequestOptions,
  ): Promise<McpResponse<Result>> {
    const response = await this.http.postPublicRaw(
      "/mcp",
      message,
      mcpHeaders(options),
    );
    return {
      body: (await response.json()) as McpResponse<Result>["body"],
      sessionId: response.headers.get("Mcp-Session-Id"),
    };
  }

  initialize(
    params?: Record<string, unknown>,
    options?: McpRequestOptions,
  ): Promise<McpResponse<McpInitializeResult>> {
    return this.request<McpInitializeResult>(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        ...(params ? { params } : {}),
      },
      options,
    );
  }

  listTools(options?: McpRequestOptions): Promise<McpResponse> {
    return this.request(
      { jsonrpc: "2.0", id: "tools", method: "tools/list" },
      options,
    );
  }

  listResources(options?: McpRequestOptions): Promise<McpResponse> {
    return this.request(
      { jsonrpc: "2.0", id: "resources", method: "resources/list" },
      options,
    );
  }

  listPrompts(options?: McpRequestOptions): Promise<McpResponse> {
    return this.request(
      { jsonrpc: "2.0", id: "prompts", method: "prompts/list" },
      options,
    );
  }

  stream(options?: McpStreamOptions): Promise<Response> {
    return this.http.getRaw(
      "/mcp",
      options?.resource ? { resource: options.resource } : undefined,
      mcpHeaders(options),
    );
  }

  async terminate(
    options?: McpRequestOptions,
  ): Promise<McpTerminateResponse> {
    const response = await this.http.deletePublicRaw(
      "/mcp",
      mcpHeaders(options),
    );
    return response.json() as Promise<McpTerminateResponse>;
  }
}

function mcpHeaders(
  options: McpRequestOptions | undefined,
): Record<string, string> | undefined {
  return options?.sessionId
    ? { "Mcp-Session-Id": options.sessionId }
    : undefined;
}
