import { describe, expect, it } from 'vitest';
import { gradeSecurity } from '@/analyzer/grading/grade';
import type { BaselineCheck } from '@/analyzer/baseline/checks';

function bcheck(level: 'info' | 'warning' | 'danger', code: string): BaselineCheck {
  return { code, category: 'cookie', level, message: code };
}

describe('gradeSecurity', () => {
  it('returns A for a clean flow', () => {
    const g = gradeSecurity([], []);
    expect(g.letter).toBe('A');
    expect(g.score).toBe(100);
    expect(g.toNextGrade).toBeNull();
  });

  it('single danger drops to B', () => {
    const g = gradeSecurity([], [bcheck('danger', 'cookie.x')]);
    // 100 - 20 = 80 → B
    expect(g.score).toBe(80);
    expect(g.letter).toBe('B');
  });

  it('multiple dangers stack', () => {
    const g = gradeSecurity([], [
      bcheck('danger', 'a'),
      bcheck('danger', 'b'),
      bcheck('warning', 'c'),
    ]);
    // 100 - 20 - 20 - 8 = 52 → F
    expect(g.score).toBe(52);
    expect(g.letter).toBe('F');
  });

  it('caps cumulative info deductions', () => {
    const checks: BaselineCheck[] = [];
    for (let i = 0; i < 20; i++) checks.push(bcheck('info', `info.${i}`));
    const g = gradeSecurity([], checks);
    // 20 info findings would be -40 without the cap; capped at -6.
    expect(g.score).toBeGreaterThanOrEqual(94);
  });

  it('dedupes findings by code', () => {
    const g = gradeSecurity([], [bcheck('danger', 'dup'), bcheck('danger', 'dup')]);
    expect(g.totals.danger).toBe(1);
  });

  it('suggests fixes to reach next grade', () => {
    const g = gradeSecurity([], [
      bcheck('danger', 'a'),
      bcheck('warning', 'b'),
      bcheck('warning', 'c'),
    ]);
    // 100 - 20 - 8 - 8 = 64 → D, needs +6 to reach C (70)
    expect(g.letter).toBe('D');
    expect(g.toNextGrade?.target).toBe('C');
    // Top-impact suggestion: the danger (impact 20) covers the gap on its own.
    expect(g.toNextGrade?.suggestions[0]?.code).toBe('a');
  });

  it('uses security note codes when present', () => {
    const g = gradeSecurity(
      [{ level: 'warning', message: 'm', code: 'oauth.missing-state' }],
      [],
    );
    expect(g.findings.some((f) => f.code === 'oauth.missing-state')).toBe(true);
  });
});
