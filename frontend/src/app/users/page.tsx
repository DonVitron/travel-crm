
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CrmDashboard from "../CrmDashboard";
import type { AuthUser } from "../LoginForm";

export default function UsersPage() {
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

      if (user.id !== "1" || user.role !== "admin") {
        router.replace("/");
        return;
      }

      setAccessToken(token);
      setCurrentUser(user);
    } catch {
      sessionStorage.removeItem("accessToken");
      sessionStorage.removeItem("currentUser");
      router.replace("/");
    } finally {
      setCheckingSession(false);
    }
  }, [router]);

  function handleLogout() {
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("currentUser");
    setAccessToken(null);
    setCurrentUser(null);
    router.replace("/");
  }

  if (checkingSession) {
    return <p className="p-8 text-sm text-slate-500">Checking session...</p>;
  }

  if (!accessToken || !currentUser) {
    return null;
  }

  return (
    <CrmDashboard
      accessToken={accessToken}
      currentUser={currentUser}
      onLogout={handleLogout}
      initialSection="Users"
    />
  );
}
