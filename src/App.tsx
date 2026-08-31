import { useEffect, useState } from "react";

type HealthResponse = {
  ok: boolean;
  bindings?: Record<string, boolean>;
};

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch((err: unknown) => setError(String(err)));
  }, []);

  return (
    <main>
      <h1>AI Translate Engine</h1>
      <p>English in, publication-ready Amharic out.</p>
      {error && <p role="alert">API error: {error}</p>}
      {health && <pre>{JSON.stringify(health, null, 2)}</pre>}
    </main>
  );
}
