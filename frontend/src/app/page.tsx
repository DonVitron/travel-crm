
"use client";

import { useState } from "react";
import CrmDashboard from "./CrmDashboard";
import BackendStatus from "./BackendStatus";
import LoginForm from "./LoginForm";

export default function Home() {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  function handleLogout() {
    setAccessToken(null);
  }

  return (
    <>
      {accessToken ? (
        <CrmDashboard
          accessToken={accessToken}
          onLogout={handleLogout}
        />
      ) : (
        <LoginForm onLogin={setAccessToken} />
      )}

      <div className="fixed bottom-4 right-4 z-50">
        <BackendStatus />
      </div>
    </>
  );
}
