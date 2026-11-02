import { memo, useMemo } from 'react';
import { splitSegments, mdToHtml } from '../lib/markdown';
import { resolveQ } from '../lib/data';
import { CircuitBlock, TimingBlock, PlotBlock, BodeBlock, MermaidBlock, SvgBlock, SimBlock } from './Blocks';

function Markdown({ src, className = 'prose' }: { src: string; className?: string }) {
  const segs = useMemo(() => splitSegments(src || ''), [src]);
  return <div className={className}>
    {segs.map((s, i) => {
      switch (s.kind) {
        case 'md': return <div key={i} className="md-seg" dangerouslySetInnerHTML={{ __html: mdToHtml(s.text, resolveQ) }} />;
        case 'circuit': return <CircuitBlock key={i} code={s.code} caption={s.caption} />;
        case 'timing': return <TimingBlock key={i} code={s.code} caption={s.caption} />;
        case 'plot': return <PlotBlock key={i} code={s.code} caption={s.caption} />;
        case 'bode': return <BodeBlock key={i} code={s.code} caption={s.caption} />;
        case 'mermaid': return <MermaidBlock key={i} code={s.code} caption={s.caption} />;
        case 'svg': return <SvgBlock key={i} code={s.code} caption={s.caption} />;
        case 'sim': return <SimBlock key={i} code={s.code} caption={s.caption} />;
      }
    })}
  </div>;
}
export default memo(Markdown);
