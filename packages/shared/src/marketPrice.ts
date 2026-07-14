import { Currency } from "./currency";

const MARKET_WRITE_PRICE_SCALE: Partial<Record<Currency, number>> = {
  [Currency.USD]: 1000,
  [Currency.EUR]: 1000,
};

export function normalizePrice(price: number, currency: Currency): number {
  const scale = MARKET_WRITE_PRICE_SCALE[currency];
  return scale ? Math.round(price * scale) / scale : price;
}

export function toMarketWritePrice(price: number, currency: Currency): number {
  const scale = MARKET_WRITE_PRICE_SCALE[currency];
  return scale ? Math.round(price * scale) : price;
}

export function marketPriceStep(currency: Currency): number {
  const scale = MARKET_WRITE_PRICE_SCALE[currency];
  return scale ? 1 / scale : 1;
}
