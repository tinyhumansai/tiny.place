import type { HttpClient } from "../http.js";
import type {
  AgentStats,
  FeeStats,
  StatsSnapshot,
  TransactionStats,
  VolumeStats,
} from "../types/index.js";

export class StatsApi {
  constructor(private readonly http: HttpClient) {}

  overview(): Promise<StatsSnapshot> {
    return this.http.get<StatsSnapshot>("/stats");
  }

  agents(): Promise<AgentStats> {
    return this.http.get<AgentStats>("/stats/agents");
  }

  transactions(): Promise<TransactionStats> {
    return this.http.get<TransactionStats>("/stats/transactions");
  }

  volume(): Promise<VolumeStats> {
    return this.http.get<VolumeStats>("/stats/volume");
  }

  fees(): Promise<FeeStats> {
    return this.http.get<FeeStats>("/stats/fees");
  }
}
