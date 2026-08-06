import { Currency } from "./currency";

const MARKET_WRITE_PRICE_SCALE: Partial<Record<Currency, number>> = {
  [Currency.USD]: 1000,
  [Currency.EUR]: 1000,
};

/**
 * Rounds a local decimal price to the precision supported by the currency.
 * For example, USD 11.6967 becomes 11.697. Currencies without a configured
 * scale are returned unchanged.
 */
export function normalizePrice(price: number, currency: Currency): number {
  const scale = MARKET_WRITE_PRICE_SCALE[currency];
  return scale ? Math.round(price * scale) / scale : price;
}

/**
 * Converts a raw price received from a Market API endpoint into a local
 * decimal price. Market returns USD and EUR in thousandths, so 11697 becomes
 * 11.697. Currencies without a configured scale are returned unchanged.
 */
export function fromMarketReadPrice(price: number, currency: Currency): number {
  const scale = MARKET_WRITE_PRICE_SCALE[currency];
  return scale ? Math.round(price) / scale : price;
}

/**
 * Converts a local decimal price into the integer units expected by Market
 * write endpoints. For example, USD 11.697 becomes 11697. Currencies without
 * a configured scale are returned unchanged.
 */
export function toMarketWritePrice(price: number, currency: Currency): number {
  const scale = MARKET_WRITE_PRICE_SCALE[currency];
  return scale ? Math.round(price * scale) : price;
}

/**
 * Returns the smallest supported price change for a currency. The step is
 * 0.001 for USD and EUR and defaults to 1 for currencies without a scale.
 */
export function marketPriceStep(currency: Currency): number {
  const scale = MARKET_WRITE_PRICE_SCALE[currency];
  return scale ? 1 / scale : 1;
}
