"use client";

import { useEffect, useState } from "react";
import CrmDashboard from "./CrmDashboard";
import BackendStatus from "./BackendStatus";
import LoginForm, { type AuthUser } from "./LoginForm";

export default function Home() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const storedToken = sessionStorage.getItem("accessToken");
    const storedUser = sessionStorage.getItem("currentUser");

    setAccessToken(storedToken);

    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser) as AuthUser;

        if (
          typeof parsed.id === "string" &&
          (parsed.role === "admin" || parsed.role === "agent")
        ) {
          setCurrentUser(parsed);
        }
      } catch {
        sessionStorage.removeItem("currentUser");
      }
    }

    setCheckingSession(false);
  }, []);

  function handleLogin(token: string, user: AuthUser) {
    sessionStorage.setItem("accessToken", token);
    sessionStorage.setItem("currentUser", JSON.stringify(user));

    setAccessToken(token);
    setCurrentUser(user);
  }

  function handleLogout() {
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("currentUser");

    setAccessToken(null);
    setCurrentUser(null);
  }

  return (
    <>
      {checkingSession ? null : accessToken && currentUser ? (
        <CrmDashboard
          accessToken={accessToken}
          currentUser={currentUser}
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