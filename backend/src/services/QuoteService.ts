import { MAX_EXACT_COUNT } from "../domain/money";
import { maxQuantityMinorUnits, priceQuote, type QuotePricing } from "../domain/pricing";
import { expiresAtFrom } from "../domain/quoteLifecycle";
import type { Quote } from "../domain/Quote";
import type { QuoteRepository } from "../repositories/QuoteRepository";
import type { SupportedCurrencyRepository } from "../repositories/SupportedCurrencyRepository";
import type { UserRepository } from "../repositories/UserRepository";
import type { MarketDataService } from "./MarketDataService";

/** Source of the current instant, injected so lifecycle behaviour is testable without waiting. */
export type Clock = () => Date;

export interface CreateQuoteInput {
  userId: number;
  destinationCurrency: string;
  /** Destination-currency minor units, matching `quotes.quantity` — 100 MXN is `10000`. */
  quantity: number;
}

/**
 * Every outcome of a quote request, as data. The HTTP layer in Epic 5 maps these to statuses by
 * reading `status`, so it never has to inspect exceptions to tell a client mistake from an
 * exchange outage.
 */
export type CreateQuoteResult =
  | { status: "created"; quote: Quote }
  | { status: "unknown_user" }
  | { status: "unsupported_currency" }
  | { status: "invalid_quantity" }
  /**
   * A well-formed quantity too large to store exactly. `maxQuantity` is the largest one that
   * would have been quoted, in the same minor units as the request.
   */
  | { status: "quantity_too_large"; maxQuantity: number }
  | { status: "no_quote_capability"; reason: string };

/**
 * Owns what a quote is: who may ask for one, which currencies are quotable, what it costs, and
 * how long it lives.
 *
 * Pricing (`priceQuote`), price composition (`MarketDataService`) and the validity window
 * (`quoteLifecycle`) each stay where they are — this service only decides the order they happen
 * in and what gets persisted.
 */
export class QuoteService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly supportedCurrencyRepository: SupportedCurrencyRepository,
    private readonly quoteRepository: QuoteRepository,
    private readonly marketDataService: MarketDataService,
    private readonly clock: Clock = () => new Date(),
  ) {}

  /**
   * Prices and persists a quote, or explains why it could not. Every rejection path returns a
   * result and writes nothing: a rejected request must leave no row behind.
   */
  async createQuote({
    userId,
    destinationCurrency,
    quantity,
  }: CreateQuoteInput): Promise<CreateQuoteResult> {
    // Cheapest checks first, so a bad request never costs a database read or an exchange lookup.
    if (!isWellFormedQuantity(quantity)) {
      return { status: "invalid_quantity" };
    }
    if (quantity > MAX_EXACT_COUNT) {
      return { status: "quantity_too_large", maxQuantity: MAX_EXACT_COUNT };
    }

    const user = this.userRepository.findById(userId);
    if (!user) {
      return { status: "unknown_user" };
    }

    // [[business]] allows exactly EUR, ARS, COP, MXN and ZAR, and the codes are compared as
    // given: `usd` is not `USD`, and neither is quotable.
    if (!this.supportedCurrencyRepository.isSupported(destinationCurrency)) {
      return { status: "unsupported_currency" };
    }

    const composedPrice = await this.marketDataService.getComposedPrice(destinationCurrency);
    if (composedPrice.status === "no_quote_capability") {
      // [[business]]: Binance down means the system generates no quotes at all. That is an
      // outcome the client is told about, not an error and never a fabricated price.
      return { status: "no_quote_capability", reason: composedPrice.reason };
    }

    // Spread is per-user: a quote only ever carries the spread of the user who asked for it.
    const pricingInput = {
      composedPrice,
      quantityMinorUnits: quantity,
      spreadBasisPoints: user.spreadBasisPoints,
    };

    let pricing: QuotePricing;
    try {
      // How much fits depends on the rate, so this bound can only be checked once it is known.
      const maxQuantity = maxQuantityMinorUnits(pricingInput);
      if (quantity > maxQuantity) {
        return { status: "quantity_too_large", maxQuantity };
      }
      pricing = priceQuote(pricingInput);
    } catch (error) {
      // MarketDataService only hands over positive prices and the quantity is already within the
      // bound above, so the RangeError left is a rate so extreme that its own per-unit figure
      // cannot be stored — a price nothing can be quoted from, not a fault in the request.
      if (error instanceof RangeError) {
        return { status: "no_quote_capability", reason: error.message };
      }
      throw error;
    }
    const { unitPrice, totalPrice } = pricing;

    // One reading of the clock backs both timestamps, so the window is exactly QUOTE_TTL_MS
    // wide rather than however long the pricing above happened to take.
    const createdAt = this.clock();

    const quote = this.quoteRepository.create({
      userId: user.id,
      destinationCurrency,
      quantity,
      unitPrice,
      totalPrice,
      createdAt,
      expiresAt: expiresAtFrom(createdAt),
    });

    return { status: "created", quote };
  }
}

/**
 * A quantity is a count of the destination currency's minor units, so anything fractional or
 * non-positive is a malformed request rather than a cheap or empty order. Size is a separate
 * question with its own result: a huge whole number is well-formed, just not quotable.
 */
function isWellFormedQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity > 0;
}
