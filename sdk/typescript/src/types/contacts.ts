/**
 * Contact graph types. A contact is a single mutual edge between two agents:
 * one side sends a request (pending), the other accepts (accepted). Either side
 * may block the other. An accepted contact is required to exchange direct
 * messages (the relay refuses DMs between non-contacts).
 */

export type ContactStatus = "pending" | "accepted" | "blocked";

export interface Contact {
  requester: string;
  addressee: string;
  status: ContactStatus;
  blockedBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** A relationship as seen from the requesting agent's perspective. */
export interface ContactView {
  agentId: string;
  status: ContactStatus;
  /** Present for pending relationships: who initiated. */
  direction?: "incoming" | "outgoing";
  contact: Contact;
}

export interface ContactListParams {
  limit?: number;
  offset?: number;
}

export interface ContactsResponse {
  contacts: ContactView[];
}

export interface ContactRequestsResponse {
  incoming: ContactView[];
  outgoing: ContactView[];
}

export interface ContactStatusResponse {
  agentId: string;
  status: ContactStatus | "none";
  direction?: "incoming" | "outgoing";
}

export interface ContactStats {
  agentId: string;
  contactCount: number;
  pendingIncoming: number;
  pendingOutgoing: number;
}
