import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

type MarketItem = {
  id: string;
  item: {
    market_hash_name: string;
    assetid: string;
    classid: string;
    source: string;
    live_time: number;
  };
  price: number;
  minPrice?: number;
  currency: string;
  fixedPrice: boolean;
  status: string;
  statusCode: string;
  isOnSale: boolean;
  lastSeenAt: string;
};

type MinimumPriceDrafts = Record<string, string>;
type FixedPriceDrafts = Record<string, boolean>;

type SteamGuardCodeResponse = {
  code: string;
  generatedAt: string;
  expiresAt: string;
  validitySeconds: number;
};

type TradeStatusHistoryEntry = {
  status: number;
  oldStatus?: number;
  statusText?: string;
  processingStatus?: "processed" | "failed" | "changed";
  error?: string;
  timestamp: number;
};

type TradeOffer = {
  id: string;
  status: "pending" | "queued" | "sent" | "accepted" | "rejected" | "cancelled" | "failed";
  offerId?: string | number;
  botId?: string;
  nik?: string;
  secret?: string;
  queueMessageId?: string;
  registeredWithPlatform: boolean;
  registeredAt?: number;
  createdAt: string;
  updatedAt: string;
  deadlineAt?: string;
  offerStatusHistory?: TradeStatusHistoryEntry[];
  offerP2P?: { items?: unknown[] };
  marketTrade?: { trade_id?: string | number; market_hash_name?: string };
};

function formatTimestamp(value?: string | number) {
  if (!value) return "—";
  const numericValue = typeof value === "number" && value < 10_000_000_000
    ? value * 1000
    : value;
  const date = new Date(numericValue);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function TradeHistory() {
  const [trades, setTrades] = useState<TradeOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTrades = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/trades?limit=100", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load trade history");
      setTrades(Array.isArray(data.trades) ? data.trades : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load trade history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadTrades(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadTrades]);

  return (
    <section className="trade-panel" aria-labelledby="trade-history-heading">
      <div className="trade-panel__header">
        <div>
          <p className="eyebrow">Trading activity</p>
          <h2 id="trade-history-heading">Trade offer history</h2>
          <p>Review Market trades, Steam offer state changes, and platform registration.</p>
        </div>
        <button className="secondary-button" onClick={() => void loadTrades()} disabled={loading}>
          {loading ? "Loading…" : "Refresh trades"}
        </button>
      </div>

      {error && <p className="error trade-panel__feedback" role="alert">{error}</p>}
      {!loading && !error && trades.length === 0 && (
        <div className="empty-state trade-panel__empty">No trade offers have been recorded yet.</div>
      )}

      {trades.length > 0 && (
        <div className="trade-list">
          {trades.map((trade) => {
            const history = [...(trade.offerStatusHistory ?? [])].sort(
              (left, right) => right.timestamp - left.timestamp
            );
            return (
              <details className="trade-card" key={trade.id}>
                <summary>
                  <div className="trade-card__identity">
                    <span className={`trade-status trade-status--${trade.status}`}>{trade.status}</span>
                    <div>
                      <strong>{trade.marketTrade?.market_hash_name || `Trade ${trade.id}`}</strong>
                      <span>{trade.id}</span>
                    </div>
                  </div>
                  <div className="trade-card__summary-meta">
                    <span>{trade.offerP2P?.items?.length ?? 0} items</span>
                    <time>{formatTimestamp(trade.updatedAt || trade.createdAt)}</time>
                  </div>
                </summary>

                <div className="trade-card__body">
                  <dl className="trade-metadata">
                    <div><dt>Steam offer</dt><dd>{trade.offerId ?? "—"}</dd></div>
                    <div><dt>Market trade</dt><dd>{trade.marketTrade?.trade_id ?? "—"}</dd></div>
                    <div><dt>Bot</dt><dd>{trade.nik || trade.botId || "—"}</dd></div>
                    <div><dt>Platform</dt><dd>{trade.registeredWithPlatform ? "Registered" : "Not registered"}</dd></div>
                    <div><dt>Created</dt><dd>{formatTimestamp(trade.createdAt)}</dd></div>
                    <div><dt>Deadline</dt><dd>{formatTimestamp(trade.deadlineAt)}</dd></div>
                    <div><dt>Queue message</dt><dd>{trade.queueMessageId ?? "—"}</dd></div>
                    <div><dt>Secret</dt><dd>{trade.secret ?? "—"}</dd></div>
                  </dl>

                  <div className="trade-timeline">
                    <h3>Status history</h3>
                    {history.length === 0 ? (
                      <p className="trade-timeline__empty">No Steam status updates recorded.</p>
                    ) : (
                      <ol>
                        {history.map((entry, index) => (
                          <li key={`${entry.timestamp}-${entry.status}-${index}`}>
                            <span className="trade-timeline__dot" />
                            <div>
                              <strong>{entry.statusText || `Steam status ${entry.status}`}</strong>
                              <span>
                                {entry.processingStatus || "status update"} · {formatTimestamp(entry.timestamp)}
                              </span>
                              {entry.error && <em>{entry.error}</em>}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SteamGuardGenerator() {
  const [result, setResult] = useState<SteamGuardCodeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!result) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(intervalId);
  }, [result]);

  const expiresAt = result ? new Date(result.expiresAt).getTime() : 0;
  const generatedAt = result ? new Date(result.generatedAt).getTime() : 0;
  const remainingMs = Math.max(0, expiresAt - now);
  const windowMs = Math.max(1, expiresAt - generatedAt);
  const availability = Math.min(100, (remainingMs / windowMs) * 100);
  const secondsRemaining = Math.ceil(remainingMs / 1000);

  async function generateCode() {
    setLoading(true);
    setError("");
    setCopied(false);

    try {
      const response = await fetch("/api/steam-guard-code", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate Steam Guard code");
      setResult(data);
      setNow(Date.now());
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Could not generate Steam Guard code");
    } finally {
      setLoading(false);
    }
  }

  async function copyCode() {
    if (!result || remainingMs === 0) return;
    await navigator.clipboard.writeText(result.code);
    setCopied(true);
  }

  return (
    <section className="guard-panel" aria-labelledby="steam-guard-heading">
      <div className="guard-panel__intro">
        <div>
          <p className="eyebrow">Steam security</p>
          <h2 id="steam-guard-heading">Steam Guard code</h2>
          <p>Generate a time-limited login code for the configured account.</p>
        </div>
        <button className="save-button" onClick={() => void generateCode()} disabled={loading}>
          {loading ? "Generating…" : result ? "Generate again" : "Generate code"}
        </button>
      </div>

      {error && <p className="error guard-panel__error" role="alert">{error}</p>}

      {result && (
        <div className={`guard-result ${remainingMs === 0 ? "guard-result--expired" : ""}`}>
          <button
            className="guard-code"
            onClick={() => void copyCode()}
            disabled={remainingMs === 0}
            aria-label="Copy Steam Guard code"
          >
            {result.code}
          </button>
          <div className="guard-validity">
            <div className="guard-validity__label">
              <span>{remainingMs > 0 ? `${secondsRemaining}s remaining` : "Code expired"}</span>
              <span>
                {copied ? "Copied" : `Expires ${new Date(result.expiresAt).toLocaleTimeString()}`}
              </span>
            </div>
            <div
              className="guard-progress"
              role="progressbar"
              aria-label="Code availability"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(availability)}
            >
              <span style={{ width: `${availability}%` }} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

type ItemEditorProps = {
  item: MarketItem;
  minPrice: string;
  fixedPrice: boolean;
  disabled: boolean;
  error?: string;
  onMinPriceChange: (value: string) => void;
  onFixedPriceChange: (value: boolean) => void;
};

function ItemEditor({
  item,
  minPrice,
  fixedPrice,
  disabled,
  error,
  onMinPriceChange,
  onFixedPriceChange,
}: ItemEditorProps) {
  const isSoldAwaitingTradeProtection = item.statusCode === "7";
  const priceStep = item.currency === "USD" || item.currency === "EUR" ? "0.001" : "1";

  return (
    <article className="item-card">
      <div className="item-card__topline">
        <span className={`status ${item.isOnSale ? "status--live" : ""}`}>
          {item.status.replaceAll("-", " ")}
        </span>
        <span className="currency">{item.currency}</span>
      </div>

      <div>
        <p className="eyebrow">Market item</p>
        <h2>{item.item.market_hash_name}</h2>
        <p className="item-id">ID {item.id}</p>
      </div>

      <dl className="metadata">
        <div><dt>Asset</dt><dd>{item.item.assetid}</dd></div>
        <div><dt>Source</dt><dd>{item.item.source || "—"}</dd></div>
        <div><dt>Last seen</dt><dd>{new Date(item.lastSeenAt).toLocaleString()}</dd></div>
      </dl>

      <div className="editor">
        <div className="price-label">
          <span>{isSoldAwaitingTradeProtection ? "Price sold" : "Market price"}</span>
          <strong>{item.price} {item.currency}</strong>
        </div>

        {!isSoldAwaitingTradeProtection && (
          <>
            <label>
              <span>Minimum price ({item.currency})</span>
              <input
                type="number"
                min="0"
                max={item.price}
                step={priceStep}
                value={minPrice}
                disabled={disabled}
                aria-invalid={Boolean(error)}
                onChange={(event) => onMinPriceChange(event.target.value)}
              />
              {error && <span className="field-error">{error}</span>}
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={fixedPrice}
                disabled={disabled}
                onChange={(event) => onFixedPriceChange(event.target.checked)}
              />
              <span>Keep market price fixed</span>
            </label>
          </>
        )}
      </div>
    </article>
  );
}

function createDrafts(items: MarketItem[]): MinimumPriceDrafts {
  return Object.fromEntries(
    items.map((item) => [item.id, String(item.minPrice ?? item.price)])
  );
}

function createFixedPriceDrafts(items: MarketItem[]): FixedPriceDrafts {
  return Object.fromEntries(items.map((item) => [item.id, item.fixedPrice]));
}

export default function App() {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [drafts, setDrafts] = useState<MinimumPriceDrafts>({});
  const [fixedPriceDrafts, setFixedPriceDrafts] = useState<FixedPriceDrafts>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/market-items", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load market items");
      }

      setItems(data.items);
      setDrafts(createDrafts(data.items));
      setFixedPriceDrafts(createFixedPriceDrafts(data.items));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load market items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadItems(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadItems]);

  const validationErrors = useMemo(() => Object.fromEntries(
    items.filter((item) => item.statusCode !== "7").flatMap((item) => {
      const minPrice = Number(drafts[item.id]);
      if (drafts[item.id]?.trim() === "" || !Number.isFinite(minPrice) || minPrice < 0) {
        return [[item.id, "Enter a non-negative price"]];
      }
      if (minPrice > item.price) {
        return [[item.id, "Cannot exceed market price"]];
      }
      return [];
    })
  ), [drafts, items]);

  const changedItems = useMemo(() => items.filter((item) => item.statusCode !== "7").filter((item) => {
    const savedMinPrice = item.minPrice ?? item.price;
    return Number(drafts[item.id]) !== savedMinPrice ||
      fixedPriceDrafts[item.id] !== item.fixedPrice;
  }), [drafts, fixedPriceDrafts, items]);

  const sortedItems = useMemo(() => [...items].sort((left, right) => {
    const soldOrder = Number(left.statusCode === "7") - Number(right.statusCode === "7");
    if (soldOrder !== 0) {
      return soldOrder;
    }

    return left.item.market_hash_name.localeCompare(right.item.market_hash_name);
  }), [items]);

  async function saveAll() {
    if (changedItems.length === 0 || Object.keys(validationErrors).length > 0) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/market-items", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: changedItems.map((item) => ({
            id: item.id,
            minPrice: Number(drafts[item.id]),
            fixedPrice: fixedPriceDrafts[item.id],
          })),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save minimum prices");
      }

      const updatedItemsById = new Map<string, MarketItem>(
        data.items.map((item: MarketItem) => [item.id, item])
      );
      const nextItems = items.map((item) => updatedItemsById.get(item.id) ?? item);
      setItems(nextItems);
      setDrafts(createDrafts(nextItems));
      setFixedPriceDrafts(createFixedPriceDrafts(nextItems));
      setMessage(`Saved ${data.items.length} ${data.items.length === 1 ? "change" : "changes"}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save minimum prices");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Market Bot Admin</p>
          <h1>Market inventory</h1>
          <p className="subtitle">Review current Market prices and set the minimum price for automatic repricing.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={() => void loadItems()} disabled={loading || saving}>
            Refresh
          </button>
          <button
            className="save-button"
            onClick={() => void saveAll()}
            disabled={saving || changedItems.length === 0 || Object.keys(validationErrors).length > 0}
          >
            {saving ? "Saving…" : `Save all${changedItems.length ? ` (${changedItems.length})` : ""}`}
          </button>
          <a className="logout-link" href="/.auth/logout">Logout</a>
        </div>
      </header>

      <SteamGuardGenerator />

      <TradeHistory />

      <section className="summary" aria-label="Inventory summary">
        <strong>{items.length}</strong>
        <span>{items.length === 1 ? "listed item" : "listed items"}</span>
        {changedItems.length > 0 && <span className="pending-count">{changedItems.length} unsaved</span>}
      </section>

      <div className="feedback page-feedback" aria-live="polite">
        {error && <span className="error">{error}</span>}
        {message && <span className="success">{message}</span>}
      </div>
      {loading && items.length === 0 && <div className="empty-state">Loading market items…</div>}
      {!loading && !error && items.length === 0 && (
        <div className="empty-state">The Market API currently has no listed items.</div>
      )}

      <section className="item-grid">
        {sortedItems.map((item) => (
          <ItemEditor
            key={item.id}
            item={item}
            minPrice={drafts[item.id] ?? ""}
            fixedPrice={fixedPriceDrafts[item.id] ?? item.fixedPrice}
            disabled={saving}
            error={validationErrors[item.id]}
            onMinPriceChange={(value) => {
              setMessage("");
              setDrafts((current) => ({ ...current, [item.id]: value }));
            }}
            onFixedPriceChange={(value) => {
              setMessage("");
              setFixedPriceDrafts((current) => ({ ...current, [item.id]: value }));
            }}
          />
        ))}
      </section>
    </main>
  );
}
