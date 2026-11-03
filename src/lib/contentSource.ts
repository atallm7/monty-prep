// Dev / normal build: question markdown bundled via Vite glob (lazy chunks).
const loaders = import.meta.glob('/content/questions/*.md', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
export async function getRaw(id: string): Promise<string | null> {
  const l = loaders[`/content/questions/${id}.md`];
  return l ? await l() : null;
}
