export interface Quote {
  id: number;
  userId: number;
  destinationCurrency: string;
  /** Integer destination-currency minor units (100 MXN is 10000), per DECISIONS.md. */
  quantity: number;
  /** Integer BRL sub-units at 10^8 per real, per DECISIONS.md. */
  unitPrice: number;
  /** Integer BRL centavos, per DECISIONS.md. */
  totalPrice: number;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
}
