
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CrmDashboard from "../CrmDashboard";
import BackendStatus from "../BackendStatus";
import type { AuthUser } from "../LoginForm";

export default function LeadsPage() {
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
      const user = JSON.parse(storedUser) as AuthUser;

      if (
        typeof user.id !== "string" ||
        (user.role !== "admin" && user.role !== "agent")
      ) {
        throw new Error("Invalid user session");
      }

      setCurrentUser(user);
      setAccessToken(token);
      setCheckingSession(false);
    } catch {
      sessionStorage.removeItem("currentUser");
      router.replace("/");
    }
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
        currentUser={currentUser}
        onLogout={handleLogout}
        initialSection="Leads"
      />

      <div className="fixed bottom-4 right-4 z-50">
        <BackendStatus />
      </div>
    </>
  );
}
