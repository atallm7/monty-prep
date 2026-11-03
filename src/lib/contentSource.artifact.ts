// Artifact build: the claude.ai artifact frame only runs inline scripts, so question markdown ships as
// JSON bundles published next to the page (content/qNN.json, 50 questions each) and is fetched on demand.
const bundles = new Map<string, Promise<Record<string, string>>>();
export async function getRaw(id: string): Promise<string | null> {
  const n = parseInt(id.slice(1), 10);
  const key = 'q' + String(Math.floor(n / 50)).padStart(2, '0');
  if (!bundles.has(key)) bundles.set(key, fetch(`content/${key}.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({})));
  const b = await bundles.get(key)!;
  return b[id] ?? null;
}
