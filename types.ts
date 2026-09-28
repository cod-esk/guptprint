export type AgentConfig = {
  cloudBaseUrl: string;
  shopId: string;
  agentId: string;
  printer: string;
  pollIntervalMs: number;
  /** Optional during local prototype; required when the cloud API enables auth. */
  agentKey?: string;
  dataDir: string;
};

export type RemotePrintJob = {
  id: string;
  /** Short-lived, one-use URL to the encrypted-at-rest PDF object. */
  downloadUrl: string;
  pages: number;
  copies: number;
  color: boolean;
  duplex: boolean;
};

export type AgentQueueResponse = { jobs: RemotePrintJob[] };
