import { useCallback, useEffect, useState } from "react";
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

type ItemEditorProps = {
  item: MarketItem;
  onSaved: (item: MarketItem) => void;
};

function ItemEditor({ item, onSaved }: ItemEditorProps) {
  const priceStep = item.currency === "USD" || item.currency === "EUR" ? "0.001" : "1";
  const [price, setPrice] = useState(String(item.price));
  const [minPrice, setMinPrice] = useState(String(item.minPrice ?? item.price));
  const [fixedPrice, setFixedPrice] = useState(item.fixedPrice);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/market-items/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          price: Number(price),
          minPrice: Number(minPrice),
          fixedPrice,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save item");
      }

      onSaved(data.item);
      setMessage("Saved");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save item");
    } finally {
      setSaving(false);
    }
  }

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
        <label>
          <span>Price ({item.currency})</span>
          <input
            type="number"
            min="0"
            step={priceStep}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>

        <label>
          <span>Minimum price ({item.currency})</span>
          <input
            type="number"
            min="0"
            step={priceStep}
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
          />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={fixedPrice}
            onChange={(event) => setFixedPrice(event.target.checked)}
          />
          <span>Keep this price fixed</span>
        </label>
      </div>

      <div className="item-card__footer">
        <div className="feedback" aria-live="polite">
          {error && <span className="error">{error}</span>}
          {message && <span className="success">{message}</span>}
        </div>
        <button className="save-button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </article>
  );
}

export default function App() {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");

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

  function replaceItem(updatedItem: MarketItem) {
    setItems((current) =>
      current.map((item) => item.id === updatedItem.id ? updatedItem : item)
    );
  }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Market Bot Admin</p>
          <h1>Market inventory</h1>
          <p className="subtitle">Set prices and pricing limits for items currently listed by the Market API.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={() => void loadItems()} disabled={loading}>
            Refresh
          </button>
          <a className="logout-link" href="/.auth/logout">Logout</a>
        </div>
      </header>

      <section className="summary" aria-label="Inventory summary">
        <strong>{items.length}</strong>
        <span>{items.length === 1 ? "listed item" : "listed items"}</span>
      </section>

      {error && <div className="page-error">{error}</div>}
      {loading && items.length === 0 && <div className="empty-state">Loading market items…</div>}
      {!loading && !error && items.length === 0 && (
        <div className="empty-state">The Market API currently has no listed items.</div>
      )}

      <section className="item-grid">
        {items.map((item) => (
          <ItemEditor key={item.id} item={item} onSaved={replaceItem} />
        ))}
      </section>
    </main>
  );
}
