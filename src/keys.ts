export const keys = {
  ready: "wh:ready",
  processing: "wh:processing",
  workerHeartbeat: "wh:worker:heartbeat",
  rateLimit: (endpointId: string) => `wh:rl:${endpointId}`,
  metric: (bucket: number) => `wh:metrics:${bucket}`,
};
