export interface Artifact {
  artifactId: string;
  owner: string;
  ownerCryptoId?: string;
  name?: string;
  description?: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  encryption?: "none" | "envelope" | string;
  recipients?: Array<string>;
  recipientCryptoIds?: Array<string>;
  expiresAt?: string;
  maxDownloads?: number | null;
  downloadCount?: number;
  status?: "active" | "expired" | "revoked" | string;
  references?: ArtifactReference;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ArtifactReference {
  kind: "task" | "escrow" | "product" | "message" | string;
  id: string;
}

export interface ArtifactListResult {
  artifacts: Array<Artifact>;
  cursor?: string;
}

export interface ArtifactQueryParams {
  role?: "owner" | "recipient";
  status?: "active" | "expired" | "revoked" | "all";
  referenceKind?: string;
  referenceId?: string;
  limit?: number;
  cursor?: string;
}

export interface ArtifactCreateRequest {
  name?: string;
  description?: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  ttl?: number;
  maxDownloads?: number;
  encryption?: "none" | "envelope" | string;
  referenceKind?: "task" | "escrow" | "product" | "message" | string;
  referenceId?: string;
  recipients?: Array<string>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ArtifactRecipientUpdate {
  add?: Array<string>;
  remove?: Array<string>;
  [key: string]: unknown;
}
