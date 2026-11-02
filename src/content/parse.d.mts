export type SectionKey = 'testing' | 'why' | 'concepts' | 'answer' | 'technical' | 'short' | 'long' | 'terms' | 'exceptional' | 'mistakes' | 'deep' | 'applications' | 'assumptions' | 'followups' | 'interpretations' | 'references' | 'rubric' | 'quiz';
export const SECTION_DEFS: { key: SectionKey; title: string; required: boolean }[];
export const SECTION_KEYS: SectionKey[];
export const DIFFICULTIES: string[];
export const KINDS: string[];
export type Parsed = {
  meta: Record<string, any>;
  sections: Partial<Record<SectionKey, string>> & Record<string, string>;
  followups: { q: string; a: string }[];
  rubric: { point: string; why: string }[];
  quiz: any[];
  errors: string[];
};
export function parseQuestion(src: string): Parsed;
export function validateQuestion(p: Parsed, ctx?: { simIds?: Set<string>; questionIds?: Set<string> }): { errors: string[]; warnings: string[]; words: number };
