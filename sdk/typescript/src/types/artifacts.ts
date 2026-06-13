export interface Artifact {
  id: string;
  owner?: string;
  name?: string;
  contentType?: string;
  size?: number;
  recipients?: Array<string>;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ArtifactCreateRequest {
  name?: string;
  contentType?: string;
  body?: string;
  recipients?: Array<string>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ArtifactRecipientUpdate {
  recipients: Array<string>;
  [key: string]: unknown;
}
