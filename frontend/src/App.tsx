import { useEffect, useState } from "react";
import "./App.css";

export default function App() {
  const [user, setUser] = useState(null as any);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");

  function login() {
    window.location.href = "/.auth/login/aad";
  }

  function logout() {
    window.location.href = "/.auth/logout";
  }

  async function loadUser() {
    const response = await fetch("/.auth/me", {
      credentials: "include",
      cache: "no-store"
    });

    if (!response.ok) {
      setUser(null);
      return;
    }

    const data = await response.json();
    setUser(data.clientPrincipal || null);
  }

  async function loadStatus() {
    setError("");

    const response = await fetch("/api/me", {
      credentials: "include",
      cache: "no-store"
    });

    if (!response.ok) {
      setError(await response.text());
      return;
    }

    const data = await response.json();
    setStatus(data);
  }

  async function stopBot() {
    setError("");

    const response = await fetch("/api/stopBot", {
      method: "POST",
      credentials: "include"
    });

    if (!response.ok) {
      setError(await response.text());
      return;
    }

    await loadStatus();
  }

  async function resumeBot() {
    setError("");

    const response = await fetch("/api/resumeBot", {
      method: "POST"
    });

    if (!response.ok) {
      setError(await response.text());
      return;
    }

    await loadStatus();
  }

  useEffect(() => {
    loadUser();
    loadStatus();
  }, []);

  if (!user) {
    return (
      <main className="page">
        <section className="card">
          <h1>Market Bot Admin</h1>
          <p>Sign in with Microsoft to control the bot.</p>
          <button onClick={login}>Login with Microsoft</button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="card">
        <h1>Market Bot Admin</h1>
        <p>
          Signed in as <strong>{user.userDetails}</strong>
        </p>
        <button onClick={logout}>Logout</button>
      </section>

      <section className="card">
        <h2>Bot Controls</h2>

        <div className="buttons">
          <button onClick={loadStatus}>Refresh Status</button>
          <button onClick={stopBot}>Stop Bot</button>
          <button onClick={resumeBot}>Resume Bot</button>
        </div>

        {error && <pre className="error">{error}</pre>}

        <h3>Status</h3>
        <pre>{JSON.stringify(status, null, 2)}</pre>
      </section>
    </main>
  );
}