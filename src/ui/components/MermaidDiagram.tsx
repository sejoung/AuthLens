import { useEffect, useId, useState } from 'react';
import type MermaidLib from 'mermaid';

type MermaidApi = typeof MermaidLib;

let mermaidPromise: Promise<MermaidApi> | undefined;
function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const m = mod.default;
      m.initialize({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'strict',
        fontFamily: "'Inter', 'Pretendard', system-ui, sans-serif",
        themeVariables: {
          background: '#0f172a',
          primaryColor: '#1e293b',
          primaryTextColor: '#f8fafc',
          primaryBorderColor: '#06b6d4',
          lineColor: '#38bdf8',
          secondaryColor: '#334155',
          tertiaryColor: '#0f172a',
          actorBkg: '#1e293b',
          actorBorder: '#06b6d4',
          actorTextColor: '#f8fafc',
          actorLineColor: '#334155',
          signalColor: '#cbd5e1',
          signalTextColor: '#cbd5e1',
          labelBoxBkgColor: '#1e293b',
          labelBoxBorderColor: '#06b6d4',
          labelTextColor: '#f8fafc',
          noteBkgColor: '#0f172a',
          noteBorderColor: '#334155',
          noteTextColor: '#cbd5e1',
          activationBkgColor: '#1e293b',
          activationBorderColor: '#06b6d4',
          sequenceNumberColor: '#020617',
        },
      });
      return m;
    });
  }
  return mermaidPromise;
}

export function MermaidDiagram({ code }: { code: string }) {
  const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = `mermaid-${baseId}`;
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const mermaid = await loadMermaid();
        if (cancelled) return;
        const { svg: rendered } = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(rendered);
          setError(undefined);
        }
      } catch (e) {
        if (!cancelled) {
          setSvg('');
          setError((e as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (error) {
    return (
      <div className="mermaid-error" role="alert">
        <strong>Mermaid rendering failed.</strong>
        <pre className="text-xs muted">{error}</pre>
        <details>
          <summary className="text-xs muted">Show source</summary>
          <pre className="mermaid-preview">{code}</pre>
        </details>
      </div>
    );
  }

  if (loading && !svg) {
    return <div className="mermaid-rendered muted text-sm">Rendering diagram…</div>;
  }

  return (
    <div
      className="mermaid-rendered"
      // mermaid.render returns SVG; we control the input.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
