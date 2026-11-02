import { lazy, ComponentType, LazyExoticComponent } from 'react';
import catalog from './catalog.json';
import type { SimProps } from './kit';

export type SimMeta = { id: string; title: string; category: string; description: string; params?: Record<string, string>; presets?: Record<string, string> };
const modules = import.meta.glob('./impl/*.tsx');
const cache = new Map<string, LazyExoticComponent<ComponentType<SimProps>>>();

export const SIM_CATALOG = catalog as unknown as SimMeta[];
export function simImplemented(id: string) { return !!modules[`./impl/${id}.tsx`]; }
export function getSim(id: string): (SimMeta & { component: LazyExoticComponent<ComponentType<SimProps>> }) | undefined {
  const meta = SIM_CATALOG.find(s => s.id === id);
  const loader = modules[`./impl/${id}.tsx`];
  if (!meta || !loader) return undefined;
  if (!cache.has(id)) cache.set(id, lazy(loader as () => Promise<{ default: ComponentType<SimProps> }>));
  return { ...meta, component: cache.get(id)! };
}
