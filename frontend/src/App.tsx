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
  data?: Record<string, unknown>;
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
  timestamp: number;
  createdAt: string;
  updatedAt: string;
  deadlineAt?: string;
  offerStatusHistory?: TradeStatusHistoryEntry[];
  offerP2P?: { items?: unknown[] };
  marketTrade?: { trade_id?: string | number; market_hash_name?: string; [key: string]: unknown };
  source?: "market-p2p";
  data?: Record<string, unknown>;
};

type AppSection = "inventory" | "guard" | "history";

function formatTimestamp(value?: string | number) {
  if (!value) return "—";
  const numericValue = typeof value === "number" && value < 10_000_000_000
    ? value * 1000
    : value;
  const date = new Date(numericValue);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function FieldValue({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === "") return <span className="empty-value">—</span>;
  if (typeof value === "boolean") return <>{value ? "true" : "false"}</>;
  if (typeof value === "object") return <pre>{JSON.stringify(value, null, 2)}</pre>;
  return <>{String(value)}</>;
}

function TradeField({ label, value, date = false }: { label: string; value: unknown; date?: boolean }) {
  return <div><dt>{label}</dt><dd>{date ? formatTimestamp(value as string | number | undefined) : <FieldValue value={value} />}</dd></div>;
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
                    <TradeField label="id" value={trade.id} />
                    <TradeField label="status" value={trade.status} />
                    <TradeField label="offerId" value={trade.offerId} />
                    <TradeField label="botId" value={trade.botId} />
                    <TradeField label="nik" value={trade.nik} />
                    <TradeField label="secret" value={trade.secret} />
                    <TradeField label="queueMessageId" value={trade.queueMessageId} />
                    <TradeField label="registeredWithPlatform" value={trade.registeredWithPlatform} />
                    <TradeField label="registeredAt" value={trade.registeredAt} date />
                    <TradeField label="timestamp" value={trade.timestamp} date />
                    <TradeField label="createdAt" value={trade.createdAt} date />
                    <TradeField label="updatedAt" value={trade.updatedAt} date />
                    <TradeField label="deadlineAt" value={trade.deadlineAt} date />
                    <TradeField label="source" value={trade.source} />
                    <TradeField label="offerP2P" value={trade.offerP2P} />
                    <TradeField label="marketTrade" value={trade.marketTrade} />
                    <TradeField label="data" value={trade.data} />
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
                            <div className="trade-timeline__entry">
                              <strong>{entry.statusText || `Steam status ${entry.status}`}</strong>
                              <dl className="history-fields">
                                <TradeField label="status" value={entry.status} />
                                <TradeField label="oldStatus" value={entry.oldStatus} />
                                <TradeField label="statusText" value={entry.statusText} />
                                <TradeField label="processingStatus" value={entry.processingStatus} />
                                <TradeField label="error" value={entry.error} />
                                <TradeField label="timestamp" value={entry.timestamp} date />
                                <TradeField label="data" value={entry.data} />
                              </dl>
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
  const [now, setNow] = useState(0);
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

type ItemGroupEditorProps = {
  items: MarketItem[];
  drafts: MinimumPriceDrafts;
  fixedPriceDrafts: FixedPriceDrafts;
  disabled: boolean;
  errors: Record<string, string>;
  onMinPriceChange: (value: string) => void;
  onFixedPriceChange: (value: boolean) => void;
};

function ItemGroupEditor({
  items,
  drafts,
  fixedPriceDrafts,
  disabled,
  errors,
  onMinPriceChange,
  onFixedPriceChange,
}: ItemGroupEditorProps) {
  const firstItem = items[0];
  const draftValues = items.map((item) => drafts[item.id] ?? "");
  const sharedDraft = draftValues.every((value) => value === draftValues[0]) ? draftValues[0] : "";
  const fixedValues = items.map((item) => fixedPriceDrafts[item.id] ?? item.fixedPrice);
  const allFixed = fixedValues.every(Boolean);
  const mixedFixed = !allFixed && fixedValues.some(Boolean);
  const groupErrors = [...new Set(items.map((item) => errors[item.id]).filter(Boolean))];
  const prices = items.map((item) => item.price);
  const minMarketPrice = Math.min(...prices);
  const maxMarketPrice = Math.max(...prices);
  const priceStep = firstItem.currency === "USD" || firstItem.currency === "EUR" ? "0.001" : "1";

  return (
    <article className="item-card item-card--group">
      <div className="item-card__topline">
        <span className="status status--live">On sale · {items.length} items</span>
        <span className="currency">{firstItem.currency}</span>
      </div>

      <div>
        <p className="eyebrow">Grouped by market hash name</p>
        <h2>{firstItem.item.market_hash_name}</h2>
        <p className="item-id">{items.length} active listings</p>
      </div>

      <details className="group-assets">
        <summary>View listing IDs and assets</summary>
        <ul>
          {items.map((item) => <li key={item.id}><span>{item.id}</span><span>Asset {item.item.assetid}</span></li>)}
        </ul>
      </details>

      <div className="editor">
        <div className="price-label">
          <span>Market price range</span>
          <strong>{minMarketPrice === maxMarketPrice ? minMarketPrice : `${minMarketPrice}–${maxMarketPrice}`} {firstItem.currency}</strong>
        </div>

        <label>
          <span>Minimum price for all ({firstItem.currency})</span>
          <input
            type="number"
            min="0"
            max={minMarketPrice}
            step={priceStep}
            value={sharedDraft}
            placeholder={sharedDraft === "" ? "Mixed values" : undefined}
            disabled={disabled}
            aria-invalid={groupErrors.length > 0}
            onChange={(event) => onMinPriceChange(event.target.value)}
          />
          {groupErrors.map((error) => <span className="field-error" key={error}>{error}</span>)}
        </label>

        <label className="checkbox-row">
          <input type="checkbox" checked={allFixed} disabled={disabled} onChange={(event) => onFixedPriceChange(event.target.checked)} />
          <span>Keep market price fixed for all{mixedFixed ? " (currently mixed)" : ""}</span>
        </label>
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
  const [activeSection, setActiveSection] = useState<AppSection>("inventory");
  const [groupActiveItems, setGroupActiveItems] = useState(true);
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

  const displayedItemGroups = useMemo(() => {
    if (!groupActiveItems) return sortedItems.map((item) => [item]);

    const activeGroups = new Map<string, MarketItem[]>();
    const ungroupedItems: MarketItem[][] = [];
    for (const item of sortedItems) {
      if (!item.isOnSale) {
        ungroupedItems.push([item]);
        continue;
      }
      const key = `${item.item.market_hash_name}\u0000${item.currency}`;
      activeGroups.set(key, [...(activeGroups.get(key) ?? []), item]);
    }
    return [...activeGroups.values(), ...ungroupedItems];
  }, [groupActiveItems, sortedItems]);

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
      <nav className="main-nav" aria-label="Admin sections">
        <button className="main-nav__brand" onClick={() => setActiveSection("inventory")}>Market Bot Admin</button>
        <div className="main-nav__tabs">
          {(["inventory", "guard", "history"] as const).map((section) => (
            <button key={section} className={activeSection === section ? "main-nav__tab main-nav__tab--active" : "main-nav__tab"} onClick={() => setActiveSection(section)} aria-current={activeSection === section ? "page" : undefined}>
              {section === "guard" ? "Steam Guard" : section === "history" ? "Trade history" : "Inventory"}
            </button>
          ))}
        </div>
        <a className="logout-link" href="/.auth/logout">Logout</a>
      </nav>

      {activeSection === "inventory" && <>
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
        </div>
      </header>

      <div className="inventory-toolbar">
        <section className="summary" aria-label="Inventory summary">
          <strong>{items.length}</strong>
          <span>{items.length === 1 ? "listed item" : "listed items"}</span>
          {changedItems.length > 0 && <span className="pending-count">{changedItems.length} unsaved</span>}
        </section>
        <label className="group-toggle">
          <input type="checkbox" checked={groupActiveItems} onChange={(event) => setGroupActiveItems(event.target.checked)} />
          <span>Group active items by name</span>
        </label>
      </div>

      <div className="feedback page-feedback" aria-live="polite">
        {error && <span className="error">{error}</span>}
        {message && <span className="success">{message}</span>}
      </div>
      {loading && items.length === 0 && <div className="empty-state">Loading market items…</div>}
      {!loading && !error && items.length === 0 && (
        <div className="empty-state">The Market API currently has no listed items.</div>
      )}

      <section className="item-grid">
        {displayedItemGroups.map((group) => group.length > 1 ? (
          <ItemGroupEditor
            key={`group-${group[0].item.market_hash_name}-${group[0].currency}`}
            items={group}
            drafts={drafts}
            fixedPriceDrafts={fixedPriceDrafts}
            disabled={saving}
            errors={validationErrors}
            onMinPriceChange={(value) => {
              setMessage("");
              setDrafts((current) => ({ ...current, ...Object.fromEntries(group.map((item) => [item.id, value])) }));
            }}
            onFixedPriceChange={(value) => {
              setMessage("");
              setFixedPriceDrafts((current) => ({ ...current, ...Object.fromEntries(group.map((item) => [item.id, value])) }));
            }}
          />
        ) : (
          <ItemEditor
            key={group[0].id}
            item={group[0]}
            minPrice={drafts[group[0].id] ?? ""}
            fixedPrice={fixedPriceDrafts[group[0].id] ?? group[0].fixedPrice}
            disabled={saving}
            error={validationErrors[group[0].id]}
            onMinPriceChange={(value) => {
              setMessage("");
              setDrafts((current) => ({ ...current, [group[0].id]: value }));
            }}
            onFixedPriceChange={(value) => {
              setMessage("");
              setFixedPriceDrafts((current) => ({ ...current, [group[0].id]: value }));
            }}
          />
        ))}
      </section>
      </>}

      {activeSection === "guard" && <SteamGuardGenerator />}
      {activeSection === "history" && <TradeHistory />}
    </main>
  );
}
