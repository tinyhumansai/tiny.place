import type { HttpClient } from "../http.js";

export class DocsApi {
  constructor(private readonly http: HttpClient) {}

  docs(): Promise<string> {
    return this.http.getText("/docs");
  }

  spec(): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>("/spec");
  }

  terms(): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>("/terms");
  }

  termsHistory(): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>("/terms/history");
  }

  llms(): Promise<string> {
    return this.http.getText("/llms.txt");
  }

  llmsFull(): Promise<string> {
    return this.http.getText("/llms-full.txt");
  }
}
