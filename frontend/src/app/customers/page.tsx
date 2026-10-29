
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CrmDashboard from "../CrmDashboard";
import BackendStatus from "../BackendStatus";

export default function CustomersPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem("accessToken");

    if (!token) {
      router.replace("/");
      return;
    }

    setAccessToken(token);
    setCheckingSession(false);
  }, [router]);

  function handleLogout() {
    sessionStorage.removeItem("accessToken");
    setAccessToken(null);
    router.replace("/");
  }

  if (checkingSession || !accessToken) {
    return null;
  }

  return (
    <>
      <CrmDashboard
        accessToken={accessToken}
        onLogout={handleLogout}
        initialSection="Customers"
      />

      <div className="fixed bottom-4 right-4 z-50">
        <BackendStatus />
      </div>
    </>
  );
}
