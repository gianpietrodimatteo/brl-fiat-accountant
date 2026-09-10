export interface User {
  id: number;
  username: string;
  /** Spread in basis points (e.g. 60 = 0.6%), per DECISIONS.md. */
  spreadBasisPoints: number;
  createdAt: Date;
}
