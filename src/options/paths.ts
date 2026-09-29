/** Reads/writes nested values by dotted path, e.g. "education.0.institution". */

export function getPath(obj: unknown, path: string): unknown {
  let node: unknown = obj;
  for (const part of path.split('.')) {
    if (node === null || node === undefined) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

export function setPath(obj: unknown, path: string, value: unknown): void {
  const parts = path.split('.');
  let node = obj as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) node = node[part] as Record<string, unknown>;
  node[parts[parts.length - 1]!] = value;
}

/** "education.2.cgpa" → "education.*.cgpa" for looking up validators by pattern. */
export function pathPattern(path: string): string {
  return path.replace(/\.\d+(?=\.|$)/g, '.*');
}
