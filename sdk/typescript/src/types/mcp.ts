export type McpJsonRpcId = string | number | null;

export interface McpJsonRpcRequest {
  jsonrpc: "2.0";
  id?: McpJsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface McpJsonRpcResponse<Result = unknown> {
  jsonrpc: "2.0";
  id?: McpJsonRpcId;
  result?: Result;
  error?: McpJsonRpcError;
}

export interface McpResponse<Result = unknown> {
  body: McpJsonRpcResponse<Result>;
  sessionId: string | null;
}

export interface McpRequestOptions {
  sessionId?: string;
}

export interface McpStreamOptions extends McpRequestOptions {
  resource?: string;
}

export interface McpInitializeResult {
  protocolVersion?: string;
  capabilities?: Record<string, unknown>;
  serverInfo?: {
    name?: string;
    version?: string;
  };
}

export interface McpTerminateResponse {
  status?: string;
}
