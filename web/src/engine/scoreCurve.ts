export interface ScorePoint {
  x: number;
  y: number;
}

/**
 * A piecewise-linear function mapping a raw metric value to a 0-1
 * desirability score for a given wellness state. Expressing scoring as
 * data (control points) rather than branching if/else logic is what makes
 * the engine tunable without touching code — see `config.ts`.
 */
export class ScoreCurve {
  private readonly points: ScorePoint[];

  constructor(points: ScorePoint[]) {
    if (points.length < 2) throw new Error('ScoreCurve needs at least two points');
    this.points = [...points].sort((a, b) => a.x - b.x);
  }

  score(rawValue: number): number {
    const first = this.points[0];
    const last = this.points[this.points.length - 1];
    if (rawValue <= first.x) return first.y;
    if (rawValue >= last.x) return last.y;

    for (let i = 0; i < this.points.length - 1; i++) {
      const lower = this.points[i];
      const upper = this.points[i + 1];
      if (rawValue >= lower.x && rawValue <= upper.x) {
        const span = upper.x - lower.x;
        if (span === 0) return lower.y;
        const t = (rawValue - lower.x) / span;
        return lower.y + t * (upper.y - lower.y);
      }
    }
    return last.y;
  }
}
