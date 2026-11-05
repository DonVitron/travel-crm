"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CrmDashboard from "../CrmDashboard";
import type { AuthUser } from "../LoginForm";
import BackendStatus from "../BackendStatus";

export default function CustomersPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem("accessToken");
    const storedUser = sessionStorage.getItem("currentUser");

    if (!token || !storedUser) {
      router.replace("/");
      return;
    }

    try {
      setCurrentUser(JSON.parse(storedUser) as AuthUser);
    } catch {
      sessionStorage.removeItem("currentUser");
      router.replace("/");
      return;
    }

    setAccessToken(token);
    setCheckingSession(false);
  }, [router]);

  function handleLogout() {
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("currentUser");
    setAccessToken(null);
    setCurrentUser(null);
    router.replace("/");
  }

  if (checkingSession || !accessToken || !currentUser) {
    return null;
  }

  return (
    <>
      <CrmDashboard
        accessToken={accessToken}
        currentUser={currentUser!}
        onLogout={handleLogout}
        initialSection="Customers"
      />

      <div className="fixed bottom-4 right-4 z-50">
        <BackendStatus />
      </div>
    </>
  );
}