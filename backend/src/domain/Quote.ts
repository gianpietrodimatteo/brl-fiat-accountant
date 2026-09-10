export interface Quote {
  id: number;
  userId: number;
  destinationCurrency: string;
  /** Integer BRL centavos, per DECISIONS.md. */
  quantity: number;
  /** Integer BRL centavos, per DECISIONS.md. */
  unitPrice: number;
  /** Integer BRL centavos, per DECISIONS.md. */
  totalPrice: number;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
}
