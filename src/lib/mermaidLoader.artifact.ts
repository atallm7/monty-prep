// Artifact build: load the mermaid UMD build from the CDN allowlist instead of bundling it.
let p: Promise<any> | null = null;
export function loadMermaid(): Promise<any> {
  if ((window as any).mermaid) return Promise.resolve((window as any).mermaid);
  return (p ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';
    s.onload = () => res((window as any).mermaid); s.onerror = () => rej(new Error('Could not load the diagram library'));
    document.head.appendChild(s);
  }));
}
