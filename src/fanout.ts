export type EndpointTarget = {
  id: string;
  active: boolean;
  eventTypes: string[];
};

export function endpointSubscribes(endpoint: EndpointTarget, eventType: string): boolean {
  if (endpoint.eventTypes.length === 0 || endpoint.eventTypes.includes("*")) return true;
  return endpoint.eventTypes.includes(eventType);
}

export function selectTargets(
  endpoints: EndpointTarget[],
  eventType: string,
  endpointIds?: readonly string[],
): EndpointTarget[] {
  const explicit = endpointIds ? new Set(endpointIds) : null;
  return endpoints.filter((endpoint) => {
    if (!endpoint.active) return false;
    if (explicit) return explicit.has(endpoint.id);
    return endpointSubscribes(endpoint, eventType);
  });
}
