import { useMemo, type MouseEventHandler } from 'react';
import { marked, type Tokens } from 'marked';
import { MermaidDiagram } from './MermaidDiagram.js';

/**
 * Markdown을 HTML로 렌더링하되, ```mermaid 블록은 별도로 추출해
 * `<MermaidDiagram>`으로 실제 SVG 렌더링한다.
 *
 * 우리가 생성한 신뢰 가능한 markdown(@/reporter 출력)이므로 sanitize는 생략.
 */
export function MarkdownPreview({ source }: { source: string }) {
  const fragments = useMemo(() => parseFragments(source), [source]);

  /**
   * Final safety net: even if an <a> sneaks past the HTML stripper, swallow the
   * click before the browser/Tauri webview can navigate. Captured URLs are data,
   * not destinations.
   */
  const blockLinkClicks: MouseEventHandler<HTMLDivElement> = (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('a')) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div className="markdown-body" onClickCapture={blockLinkClicks}>
      {fragments.map((f, i) =>
        f.kind === 'mermaid' ? (
          <MermaidDiagram key={`m-${i}`} code={f.code} />
        ) : (
          <div
            key={`h-${i}`}
            // marked output of our own reporter is trusted
            dangerouslySetInnerHTML={{ __html: f.html }}
          />
        ),
      )}
    </div>
  );
}

type Fragment = { kind: 'html'; html: string } | { kind: 'mermaid'; code: string };

function parseFragments(source: string): Fragment[] {
  const tokens = marked.lexer(source);
  const fragments: Fragment[] = [];
  let buffer: Tokens.Generic[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const html = marked.parser(buffer as Parameters<typeof marked.parser>[0]);
    // Strip <a> tags entirely — captured URLs are observation data, not navigation.
    // Clicking them in a Tauri webview could navigate the app away, and re-issuing
    // captured OAuth/auth URLs may have unintended side effects on the target.
    // Keep the inner text so users can still select and copy.
    const inert = html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');
    fragments.push({ kind: 'html', html: inert });
    buffer = [];
  };

  for (const token of tokens) {
    if (token.type === 'code' && (token as Tokens.Code).lang === 'mermaid') {
      flush();
      fragments.push({ kind: 'mermaid', code: (token as Tokens.Code).text });
    } else {
      buffer.push(token);
    }
  }
  flush();
  return fragments;
}
