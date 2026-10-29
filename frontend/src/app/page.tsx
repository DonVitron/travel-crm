
"use client";

import { useEffect, useState } from "react";
import CrmDashboard from "./CrmDashboard";
import BackendStatus from "./BackendStatus";
import LoginForm from "./LoginForm";

export default function Home() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    setAccessToken(sessionStorage.getItem("accessToken"));
    setCheckingSession(false);
  }, []);

  function handleLogin(token: string) {
    sessionStorage.setItem("accessToken", token);
    setAccessToken(token);
  }

  function handleLogout() {
    sessionStorage.removeItem("accessToken");
    setAccessToken(null);
  }

  return (
    <>
      {checkingSession ? null : accessToken ? (
        <CrmDashboard
          accessToken={accessToken}
          onLogout={handleLogout}
        />
      ) : (
        <LoginForm onLogin={handleLogin} />
      )}

      <div className="fixed bottom-4 right-4 z-50">
        <BackendStatus />
      </div>
    </>
  );
}
