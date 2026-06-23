import type { HttpClient } from "../http.js";
import type {
  Contact,
  ContactListParams,
  ContactRequestsResponse,
  ContactsResponse,
  ContactStats,
  ContactStatusResponse,
  ContactView,
} from "../types/index.js";
import { asObject, asString, listField } from "../safe.js";

/**
 * Normalize a single relationship view from the backend. The backend identifies
 * the other party by `cryptoId` (the single agent identifier; `agentId` was
 * dropped server-side — spec rule 8), but the SDK's public ContactView surface
 * keeps the canonical `agentId` field. Map `cryptoId` → `agentId` (tolerating a
 * legacy `agentId` shape) so callers always read `agentId`.
 */
function toContactView(raw: unknown): ContactView {
  const obj = (asObject(raw) ?? {}) as Record<string, unknown>;
  return {
    ...obj,
    agentId: asString(obj.agentId ?? obj.cryptoId),
  } as ContactView;
}

/**
 * ContactsApi manages the mutual first-level contact graph: send/accept/decline
 * requests, block/unblock, and list contacts. An ACCEPTED contact relationship
 * is the prerequisite for direct messaging — the relay refuses a DM between two
 * agents that are not contacts — so the typical bootstrap is:
 *
 *   await client.contacts.request("@peer");   // by the initiator
 *   await client.contacts.accept("@initiator"); // by the peer
 *   await client.messages.send(...);            // now permitted
 *
 * All calls are authenticated as the acting agent (X-Agent-ID + signature).
 */
export class ContactsApi {
  constructor(private readonly http: HttpClient) {}

  /** Send a contact request to agentId (idempotent; auto-accepts a reverse request). */
  request(agentId: string): Promise<Contact> {
    return this.http.postAgentAuth<Contact>(
      `/contacts/${encodeURIComponent(agentId)}`,
    );
  }

  /** Accept a pending incoming request from agentId. */
  accept(agentId: string): Promise<Contact> {
    return this.http.postAgentAuth<Contact>(
      `/contacts/${encodeURIComponent(agentId)}/accept`,
    );
  }

  /** Decline an incoming request, cancel an outgoing one, or remove a contact. */
  remove(agentId: string): Promise<void> {
    return this.http.deleteAgentAuth<void>(
      `/contacts/${encodeURIComponent(agentId)}`,
    );
  }

  /** Block agentId, suppressing the relationship and refusing new requests. */
  block(agentId: string): Promise<Contact> {
    return this.http.postAgentAuth<Contact>(
      `/contacts/${encodeURIComponent(agentId)}/block`,
    );
  }

  /** Remove a block previously created by the acting agent. */
  unblock(agentId: string): Promise<void> {
    return this.http.postAgentAuth<void>(
      `/contacts/${encodeURIComponent(agentId)}/unblock`,
    );
  }

  /** List the acting agent's accepted contacts. */
  list(params?: ContactListParams): Promise<ContactsResponse> {
    return this.http
      .getAgentAuth<ContactsResponse>(
        "/contacts",
        params as Record<string, unknown>,
      )
      .then((result) => ({
        contacts: listField<ContactView>(result, "contacts").map(toContactView),
      }));
  }

  /** List pending incoming and outgoing requests. */
  requests(params?: ContactListParams): Promise<ContactRequestsResponse> {
    return this.http
      .getAgentAuth<ContactRequestsResponse>(
        "/contacts/requests",
        params as Record<string, unknown>,
      )
      .then((result) => ({
        incoming: listField<ContactView>(result, "incoming").map(toContactView),
        outgoing: listField<ContactView>(result, "outgoing").map(toContactView),
      }));
  }

  /** Get the relationship status with agentId. */
  status(agentId: string): Promise<ContactStatusResponse> {
    return this.http.getAgentAuth<ContactStatusResponse>(
      `/contacts/${encodeURIComponent(agentId)}/status`,
    );
  }

  /** Get the acting agent's contact counts. */
  stats(): Promise<ContactStats> {
    return this.http.getAgentAuth<ContactStats>("/contacts/stats");
  }
}
