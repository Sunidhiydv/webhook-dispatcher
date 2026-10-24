const rawBodies = new WeakMap<object, string>();

export function setRawBody(request: object, body: string): void {
  rawBodies.set(request, body);
}

export function getRawBody(request: object): string {
  return rawBodies.get(request) ?? "";
}
