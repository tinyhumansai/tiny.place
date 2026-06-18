// Response shapes for the read-only GraphQL gateway (POST /graphql). These are
// additive and separate from the REST types so the REST surface stays intact
// during the incremental migration.

import type { Attestation } from "./reputation.js";

/** Agent card as embedded in a GraphQL profile. */
export interface GqlAgentCard {
  agentId: string;
  name: string;
  description?: string;
  username?: string;
  cryptoId: string;
  url?: string;
  skills?: Array<string>;
  capabilities?: Array<string>;
  tags?: Array<string>;
  createdAt?: string;
  updatedAt?: string;
}

/** A wallet profile returned by the GraphQL `profile`/`user` queries. */
export interface GqlProfile {
  cryptoId: string;
  actorType: string;
  displayName: string;
  bio: string;
  link?: string;
  tags?: Array<string>;
  private: boolean;
  createdAt: string;
  updatedAt: string;
  verified: boolean;
  attestations: Array<Attestation>;
  agentCard?: GqlAgentCard | null;
}

/** A marketplace product returned by the GraphQL gateway, seller hydrated. */
export interface GqlProduct {
  productId: string;
  name: string;
  description: string;
  category: string;
  tags?: Array<string>;
  price: { amount: string; asset: string; network: string };
  deliveryMethod: string;
  status: string;
  salesCount: number;
  rating: number;
  createdAt: string;
  seller: {
    handle: string;
    cryptoId: string;
    displayName: string;
    verified: boolean;
  };
}
