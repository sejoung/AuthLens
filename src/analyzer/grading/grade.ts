/**
 * Roll up all security signals into a single A/B/C/D/F grade.
 *
 * Inputs:
 *   - `summary.warnings` from inferAuthType (includes OAuth findings since
 *     analyze.ts merges them in)
 *   - `runBaselineChecks(flow)` output
 *
 * Scoring is intentionally simple and transparent:
 *   - start at 100
 *   - each danger:  -20
 *   - each warning: -8
 *   - each info:    -2 (capped at 6 total info deductions to avoid runaway)
 *
 * Grade thresholds:
 *   A: 90+   B: 80-89   C: 70-79   D: 60-69   F: <60
 *
 * We also compute "to-next-grade" actions: the smallest set of remaining
 * findings whose combined impact would lift the score past the next threshold.
 */

import type { SecurityNote } from '@/core';
import type { BaselineCheck } from '../baseline/checks.js';

export type GradeLetter = 'A' | 'B' | 'C' | 'D' | 'F';

export type GradeFinding = {
  code: string;
  level: 'info' | 'warning' | 'danger';
  message: string;
  source: 'security-note' | 'baseline';
  impact: number;
};

export type SecurityGrade = {
  letter: GradeLetter;
  score: number;
  totals: { danger: number; warning: number; info: number };
  findings: GradeFinding[];
  /** Empty for grade A. */
  toNextGrade: {
    target: GradeLetter;
    pointsNeeded: number;
    suggestions: GradeFinding[];
  } | null;
};

const IMPACT_DANGER = 20;
const IMPACT_WARNING = 8;
const IMPACT_INFO = 2;
const INFO_DEDUCTION_CAP = 6;

const THRESHOLDS: Array<{ letter: GradeLetter; min: number }> = [
  { letter: 'A', min: 90 },
  { letter: 'B', min: 80 },
  { letter: 'C', min: 70 },
  { letter: 'D', min: 60 },
  { letter: 'F', min: 0 },
];

export function gradeSecurity(
  notes: SecurityNote[] = [],
  baseline: BaselineCheck[] = [],
): SecurityGrade {
  const findings = collectFindings(notes, baseline);
  let score = 100;
  let infoDeducted = 0;
  let danger = 0;
  let warning = 0;
  let info = 0;
  for (const f of findings) {
    if (f.level === 'danger') {
      score -= IMPACT_DANGER;
      danger += 1;
    } else if (f.level === 'warning') {
      score -= IMPACT_WARNING;
      warning += 1;
    } else {
      info += 1;
      // Cap cumulative info deductions — 20 info-level findings shouldn't
      // tank the grade by themselves.
      if (infoDeducted < INFO_DEDUCTION_CAP) {
        score -= IMPACT_INFO;
        infoDeducted += IMPACT_INFO;
      }
    }
  }
  score = Math.max(0, Math.min(100, score));
  const letter = thresholdFor(score);

  return {
    letter,
    score,
    totals: { danger, warning, info },
    findings,
    toNextGrade: computeToNextGrade(letter, score, findings),
  };
}

function collectFindings(notes: SecurityNote[], baseline: BaselineCheck[]): GradeFinding[] {
  const out: GradeFinding[] = [];
  for (const n of notes) {
    out.push({
      code: n.code ?? `note.${slug(n.message)}`,
      level: n.level,
      message: n.message,
      source: 'security-note',
      impact: levelImpact(n.level),
    });
  }
  for (const b of baseline) {
    out.push({
      code: b.code,
      level: b.level,
      message: b.message,
      source: 'baseline',
      impact: levelImpact(b.level),
    });
  }
  return dedupeByCode(out);
}

function levelImpact(level: GradeFinding['level']): number {
  return level === 'danger' ? IMPACT_DANGER : level === 'warning' ? IMPACT_WARNING : IMPACT_INFO;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32);
}

function dedupeByCode(findings: GradeFinding[]): GradeFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    if (seen.has(f.code)) return false;
    seen.add(f.code);
    return true;
  });
}

function thresholdFor(score: number): GradeLetter {
  for (const t of THRESHOLDS) {
    if (score >= t.min) return t.letter;
  }
  return 'F';
}

function computeToNextGrade(
  current: GradeLetter,
  score: number,
  findings: GradeFinding[],
): SecurityGrade['toNextGrade'] {
  if (current === 'A') return null;
  const idx = THRESHOLDS.findIndex((t) => t.letter === current);
  // Next higher threshold = previous entry in THRESHOLDS (sorted descending).
  const target = THRESHOLDS[idx - 1];
  if (!target) return null;
  const pointsNeeded = target.min - score;
  // Pick the smallest set of fix-able findings (sorted by impact desc) whose
  // combined impact covers pointsNeeded.
  const candidates = [...findings].sort((a, b) => b.impact - a.impact);
  const suggestions: GradeFinding[] = [];
  let accumulated = 0;
  for (const c of candidates) {
    if (accumulated >= pointsNeeded) break;
    suggestions.push(c);
    accumulated += c.impact;
  }
  return { target: target.letter, pointsNeeded, suggestions };
}
