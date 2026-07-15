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
  isOnSale: boolean;
  lastSeenAt: string;
};

type MinimumPriceDrafts = Record<string, string>;
type FixedPriceDrafts = Record<string, boolean>;

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
          <span>Market price</span>
          <strong>{item.price} {item.currency}</strong>
        </div>

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
    items.flatMap((item) => {
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

  const changedItems = useMemo(() => items.filter((item) => {
    const savedMinPrice = item.minPrice ?? item.price;
    return Number(drafts[item.id]) !== savedMinPrice ||
      fixedPriceDrafts[item.id] !== item.fixedPrice;
  }), [drafts, fixedPriceDrafts, items]);

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
        {items.map((item) => (
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
