
"use client";

import { useEffect, useState } from "react";

type ConnectionStatus = "checking" | "connected" | "unavailable";

export default function BackendStatus() {
  const [status, setStatus] = useState<ConnectionStatus>("checking");

  useEffect(() => {
    const controller = new AbortController();

    async function checkBackend() {
      try {
        const response = await fetch(
          "http://localhost:3001/health",
          { signal: controller.signal, cache: "no-store" }
        );

        if (!response.ok) {
          setStatus("unavailable");
          return;
        }

        const data = await response.json();

        setStatus(data.status === "ok" ? "connected" : "unavailable");
      } catch {
        if (!controller.signal.aborted) {
          setStatus("unavailable");
        }
      }
    }

    void checkBackend();

    return () => controller.abort();
  }, []);

  const message = {
    checking: "Checking backend connection...",
    connected: "Backend connected",
    unavailable: "Backend unavailable",
  }[status];

  return (
    <div
      role="status"
      className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700"
    >
      <span
        className={`mr-2 inline-block h-2 w-2 rounded-full ${
          status === "connected"
            ? "bg-green-500"
            : status === "unavailable"
              ? "bg-red-500"
              : "bg-yellow-500"
        }`}
      />
      {message}
    </div>
  );
}
