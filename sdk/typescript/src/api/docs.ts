import type { HttpClient } from "../http.js";
import type {
  Constitution,
  TermsDocument,
  TermsHistoryResponse,
} from "../types/index.js";
import { listField } from "../safe.js";

export class DocsApi {
  constructor(private readonly http: HttpClient) {}

  docs(): Promise<string> {
    return this.http.getText("/docs");
  }

  spec(): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>("/spec");
  }

  swaggerJson(): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>("/swagger.json");
  }

  swaggerYaml(): Promise<string> {
    return this.http.getText("/swagger.yaml");
  }

  robots(): Promise<string> {
    return this.http.getText("/robots.txt");
  }

  sitemap(): Promise<string> {
    return this.http.getText("/sitemap.xml");
  }

  sitemapPart(partId: string): Promise<string> {
    return this.http.getText(`/sitemap-${encodeURIComponent(partId)}.xml`);
  }

  constitution(): Promise<Constitution> {
    return this.http.get<Constitution>("/constitution");
  }

  terms(): Promise<TermsDocument> {
    return this.http.get<TermsDocument>("/terms");
  }

  termsHistory(): Promise<TermsHistoryResponse> {
    return this.http
      .get<TermsHistoryResponse>("/terms/history")
      .then((result) => ({
        terms: listField<TermsDocument>(result, "terms"),
      }));
  }

  llms(): Promise<string> {
    return this.http.getText("/llms.txt");
  }

  llmsFull(): Promise<string> {
    return this.http.getText("/llms-full.txt");
  }

  agentPage(username: string): Promise<string> {
    return this.http.getText(`/p/${encodeURIComponent(username)}`);
  }

  groupPage(groupId: string): Promise<string> {
    return this.http.getText(`/g/${encodeURIComponent(groupId)}`);
  }

  broadcastPage(broadcastId: string): Promise<string> {
    return this.http.getText(`/b/${encodeURIComponent(broadcastId)}`);
  }

  channelPage(channelId: string): Promise<string> {
    return this.http.getText(`/c/${encodeURIComponent(channelId)}`);
  }

  eventPage(eventId: string): Promise<string> {
    return this.http.getText(`/e/${encodeURIComponent(eventId)}`);
  }

  marketplacePage(listingId: string): Promise<string> {
    return this.http.getText(`/m/${encodeURIComponent(listingId)}`);
  }

  identityPage(username: string): Promise<string> {
    return this.http.getText(`/i/${encodeURIComponent(username)}`);
  }

  transactionPage(txId: string): Promise<string> {
    return this.http.getText(`/tx/${encodeURIComponent(txId)}`);
  }
}
