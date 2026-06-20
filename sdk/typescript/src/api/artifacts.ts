import type { HttpClient } from "../http.js";
import type {
  Artifact,
  ArtifactListResult,
  ArtifactCreateRequest,
  ArtifactQueryParams,
  ArtifactRecipientUpdate,
} from "../types/index.js";
import { asString, listField } from "../safe.js";

export class ArtifactsApi {
  constructor(private readonly http: HttpClient) {}

  list(
    params?: ArtifactQueryParams,
    actorId?: string,
  ): Promise<ArtifactListResult> {
    const request = actorId
      ? this.http.getDirectoryAuthAs<ArtifactListResult>(
          "/artifacts",
          actorId,
          params as Record<string, unknown>,
        )
      : this.http.getDirectoryAuth<ArtifactListResult>(
          "/artifacts",
          params as Record<string, unknown>,
        );
    return request.then((result) => ({
      artifacts: listField<Artifact>(result, "artifacts"),
      cursor: asString((result as { cursor?: unknown })?.cursor) || undefined,
    }));
  }

  create(request: ArtifactCreateRequest, ownerId?: string): Promise<Artifact> {
    if (ownerId) {
      return this.http.postDirectoryAuthAs<Artifact>(
        "/artifacts",
        ownerId,
        request,
      );
    }
    return this.http.postDirectoryAuth<Artifact>("/artifacts", request);
  }

  get(artifactId: string, actorId?: string): Promise<Artifact> {
    if (actorId) {
      return this.http.getDirectoryAuthAs<Artifact>(
        `/artifacts/${encodeURIComponent(artifactId)}`,
        actorId,
      );
    }
    return this.http.getDirectoryAuth<Artifact>(
      `/artifacts/${encodeURIComponent(artifactId)}`,
    );
  }

  remove(artifactId: string, ownerId?: string): Promise<void> {
    if (ownerId) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/artifacts/${encodeURIComponent(artifactId)}`,
        ownerId,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/artifacts/${encodeURIComponent(artifactId)}`,
    );
  }

  download(artifactId: string, actorId?: string): Promise<Response> {
    if (actorId) {
      return this.http.getDirectoryAuthRawAs(
        `/artifacts/${encodeURIComponent(artifactId)}/download`,
        actorId,
      );
    }
    return this.http.getDirectoryAuthRaw(
      `/artifacts/${encodeURIComponent(artifactId)}/download`,
    );
  }

  updateRecipients(
    artifactId: string,
    request: ArtifactRecipientUpdate,
    ownerId?: string,
  ): Promise<Artifact> {
    if (ownerId) {
      return this.http.putDirectoryAuthAs<Artifact>(
        `/artifacts/${encodeURIComponent(artifactId)}/recipients`,
        ownerId,
        request,
      );
    }
    return this.http.putDirectoryAuth<Artifact>(
      `/artifacts/${encodeURIComponent(artifactId)}/recipients`,
      request,
    );
  }
}
