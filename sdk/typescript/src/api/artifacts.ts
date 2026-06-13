import type { HttpClient } from "../http.js";
import type {
  Artifact,
  ArtifactListResult,
  ArtifactCreateRequest,
  ArtifactQueryParams,
  ArtifactRecipientUpdate,
} from "../types/index.js";

export class ArtifactsApi {
  constructor(private readonly http: HttpClient) {}

  list(params?: ArtifactQueryParams): Promise<ArtifactListResult> {
    return this.http.getDirectoryAuth<ArtifactListResult>(
      "/artifacts",
      params as Record<string, unknown>,
    );
  }

  create(request: ArtifactCreateRequest): Promise<Artifact> {
    return this.http.postDirectoryAuth<Artifact>("/artifacts", request);
  }

  get(artifactId: string): Promise<Artifact> {
    return this.http.getDirectoryAuth<Artifact>(
      `/artifacts/${encodeURIComponent(artifactId)}`,
    );
  }

  remove(artifactId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/artifacts/${encodeURIComponent(artifactId)}`,
    );
  }

  download(artifactId: string): Promise<Response> {
    return this.http.getDirectoryAuthRaw(
      `/artifacts/${encodeURIComponent(artifactId)}/download`,
    );
  }

  updateRecipients(
    artifactId: string,
    request: ArtifactRecipientUpdate,
  ): Promise<Artifact> {
    return this.http.putDirectoryAuth<Artifact>(
      `/artifacts/${encodeURIComponent(artifactId)}/recipients`,
      request,
    );
  }
}
