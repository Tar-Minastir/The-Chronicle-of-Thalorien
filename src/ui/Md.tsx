import type { ReactNode } from 'react';
import type { SourceRef } from '../domain/types';

/** Render the documents' inline emphasis (**bold**, *italic*, ~~struck~~) without changing a word. */
export function Md({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|~~(.+?)~~|\*([^*\s][^*]*?)\*/g;
  let last = 0;
  let key = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={key++}><em>{m[1]}</em></strong>);
    else if (m[2] !== undefined) out.push(<strong key={key++}><Md text={m[2]} /></strong>);
    else if (m[3] !== undefined) out.push(<del key={key++}><Md text={m[3]} /></del>);
    else out.push(<em key={key++}>{m[4]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

export const cite = (r: SourceRef) => `${r.docId}:${r.line}`;

/** A verbatim passage with its source citation. */
export function Quote({ text, refTo, note }: { text: string; refTo: SourceRef; note?: string }) {
  return (
    <li className="quote">
      <span className="cite" title={refTo.headingPath.join(' › ')}>{cite(refTo)}{note ? ` · ${note}` : ''}</span>
      <Md text={text} />
    </li>
  );
}
