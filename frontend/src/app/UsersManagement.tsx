
"use client";

import { useEffect, useState, type FormEvent } from "react";

const API_URL = "http://localhost:3001";

type Agent = {
  id: string | number;
  email: string;
  fullName: string;
  role: "admin" | "agent";
  status: "active" | "suspended";
  department: string | null;
  isManager: boolean | number;
  createdAt: string;
};

type UsersManagementProps = {
  accessToken: string;
};

function getErrorMessage(data: unknown): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "message" in data
  ) {
    const message = (data as { message: unknown }).message;

    if (Array.isArray(message)) {
      return message.join(", ");
    }

    if (typeof message === "string") {
      return message;
    }
  }

  return "Something went wrong.";
}

export default function UsersManagement({
  accessToken,
}: UsersManagementProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [department, setDepartment] = useState("");
  const [isManager, setIsManager] = useState(false);

  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState("");
  const [createError, setCreateError] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [editError, setEditError] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusError, setStatusError] = useState(false);
  const [resettingAgent, setResettingAgent] = useState<Agent | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAgents() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();

        if (search.trim()) {
          params.set("search", search.trim());
        }

        const response = await fetch(
          `${API_URL}/users?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            signal: controller.signal,
          }
        );

        const data: unknown = await response.json();

        if (!response.ok) {
          throw new Error(getErrorMessage(data));
        }

        if (!Array.isArray(data)) {
          throw new Error("Invalid users response.");
        }

        setAgents(data as Agent[]);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load agents."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadAgents();

    return () => controller.abort();
  }, [accessToken, search, refreshKey]);

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setCreating(true);
    setCreateMessage("");
    setCreateError(false);

    try {
      const response = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName,
          email,
          password,
          department: department || null,
          isManager,
        }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(data));
      }

      setFullName("");
      setEmail("");
      setPassword("");
      setDepartment("");
      setIsManager(false);

      setCreateMessage("Agent account created successfully.");
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setCreateError(true);
      setCreateMessage(
        err instanceof Error
          ? err.message
          : "Could not create agent."
      );
    } finally {
      setCreating(false);
    }
  }

async function updateAgent(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (!editingAgent) return;

  setSavingEdit(true);
  setEditMessage("");
  setEditError(false);

  try {
    const response = await fetch(
      `${API_URL}/users/${editingAgent.id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: editingAgent.fullName,
          email: editingAgent.email,
          department: editingAgent.department,
          isManager:
            editingAgent.isManager === true ||
            Number(editingAgent.isManager) === 1,
        }),
      }
    );

    const data: unknown = await response.json();

    if (!response.ok) {
      throw new Error(getErrorMessage(data));
    }

    setEditMessage("Employee updated successfully.");
    setEditingAgent(null);
    setRefreshKey((key) => key + 1);
  } catch (err) {
    setEditError(true);
    setEditMessage(
      err instanceof Error
        ? err.message
        : "Could not update employee."
    );
  } finally {
    setSavingEdit(false);
  }
}

async function toggleAgentStatus(agent: Agent) {
  const nextStatus =
    agent.status === "active" ? "suspended" : "active";

  setStatusUpdatingId(String(agent.id));
  setStatusMessage("");
  setStatusError(false);

  try {
    const response = await fetch(
      `${API_URL}/users/${agent.id}/status`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      }
    );

    const data: unknown = await response.json();

    if (!response.ok) {
      throw new Error(getErrorMessage(data));
    }

    setStatusMessage(
      nextStatus === "suspended"
        ? "Employee suspended successfully."
        : "Employee reactivated successfully."
    );

    setRefreshKey((key) => key + 1);
  } catch (err) {
    setStatusError(true);
    setStatusMessage(
      err instanceof Error
        ? err.message
        : "Could not update employee status."
    );
  } finally {
    setStatusUpdatingId(null);
  }
}

async function resetAgentPassword(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (!resettingAgent) return;

  setSavingPassword(true);
  setPasswordMessage("");
  setPasswordError(false);

  try {
    const response = await fetch(
      `${API_URL}/users/${resettingAgent.id}/password`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: newPassword }),
      }
    );

    const data: unknown = await response.json();

    if (!response.ok) {
      throw new Error(getErrorMessage(data));
    }

    setPasswordMessage("Password reset successfully.");
    setNewPassword("");
    setResettingAgent(null);
  } catch (err) {
    setPasswordError(true);
    setPasswordMessage(
      err instanceof Error
        ? err.message
        : "Could not reset employee password."
    );
  } finally {
    setSavingPassword(false);
  }
}

  return (
    <div className="mt-8 space-y-6">

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h3 className="text-xl font-semibold">Create Agent</h3>
          <p className="mt-1 text-sm text-slate-500">
            Create a new employee account for your travel agency.
          </p>
        </div>

        <form onSubmit={createAgent} className="grid gap-4 sm:grid-cols-2">

          <label className="text-sm font-medium">
            Full name
            <input
              required
              maxLength={160}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Agent full name"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>

          <label className="text-sm font-medium">
            Email
            <input
              required
              type="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="agent@example.com"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>

          <label className="text-sm font-medium">
            Initial password
            <input
              required
              type="password"
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 12 characters"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>

          <label className="text-sm font-medium">
            Department
            <input
              maxLength={80}
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              placeholder="e.g. ticketing"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>

          <label className="flex items-center gap-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={isManager}
              onChange={(event) => setIsManager(event.target.checked)}
              className="h-4 w-4"
            />
            Grant manager permissions
          </label>

          {createMessage && (
            <p
              role="status"
              className={`text-sm sm:col-span-2 ${
                createError ? "text-red-600" : "text-green-700"
              }`}
            >
              {createMessage}
            </p>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Agent"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-xl font-semibold">Employees</h3>
            {statusMessage && (
  <p
    role="status"
    className={`mt-3 text-sm ${
      statusError ? "text-red-600" : "text-green-600"
    }`}
  >
    {statusMessage}
  </p>
)}
            <p className="mt-1 text-sm text-slate-500">
              Manage your agency employee accounts.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, email, or department..."
          aria-label="Search employees"
          className="mt-5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />

        {loading && (
          <p className="py-8 text-sm text-slate-500">
            Loading employees...
          </p>
        )}

        {error && (
          <p role="alert" className="py-8 text-sm text-red-600">
            {error}
          </p>
        )}

        {!loading && !error && (
          <>
            <p className="mt-4 text-sm text-slate-500">
              {agents.length} employee{agents.length === 1 ? "" : "s"} found
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[750px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-3 pr-4">Employee</th>
                    <th className="py-3 pr-4">Department</th>
                    <th className="py-3 pr-4">Role</th>
                    <th className="py-3 pr-4">Manager</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {agents.map((agent) => (
                    <tr
                      key={agent.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="py-4 pr-4">
                        <p className="font-medium">{agent.fullName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {agent.email}
                        </p>
                      </td>

                      <td className="py-4 pr-4">
                        {agent.department || "Unassigned"}
                      </td>

                      <td className="py-4 pr-4 capitalize">
                        {agent.role}
                      </td>

                      <td className="py-4 pr-4">
                        {agent.isManager === true ||
                        Number(agent.isManager) === 1
                          ? "Yes"
                          : "No"}
                      </td>

                      <td className="py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            agent.status === "active"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {agent.status}
                        </span>
                      </td>
                      <td className="py-4">
                            <button
                                type="button"
                                onClick={() => {
                                setEditingAgent({ ...agent });
                                setEditMessage("");
                                setEditError(false);
                                }}
                                className="rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
                            >
                                Edit
                            </button>
                            <button
                                type="button"
                                disabled={statusUpdatingId === String(agent.id)}
                                onClick={() => toggleAgentStatus(agent)}
                                className="ml-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
                                >
                                {statusUpdatingId === String(agent.id)
                                    ? "Updating..."
                                    : agent.status === "active"
                                    ? "Suspend"
                                    : "Reactivate"}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setResettingAgent({ ...agent });
                                    setNewPassword("");
                                    setPasswordMessage("");
                                    setPasswordError(false);
                                }}
                                className="ml-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
                                >
                                Reset Password
                            </button>
                            </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {agents.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">
                  No employees found.
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {editingAgent && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold">Edit Employee</h3>

          <form onSubmit={updateAgent} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Full Name
              <input
                required
                maxLength={160}
                value={editingAgent.fullName}
                onChange={(event) =>
                  setEditingAgent((current) =>
                    current
                      ? { ...current, fullName: event.target.value }
                      : current
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="block text-sm font-medium">
              Email
              <input
                required
                type="email"
                maxLength={254}
                value={editingAgent.email}
                onChange={(event) =>
                  setEditingAgent((current) =>
                    current
                      ? { ...current, email: event.target.value }
                      : current
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="block text-sm font-medium">
              Department
              <input
                maxLength={80}
                value={editingAgent.department ?? ""}
                onChange={(event) =>
                  setEditingAgent((current) =>
                    current
                      ? {
                          ...current,
                          department: event.target.value || null,
                        }
                      : current
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="flex items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                checked={
                  editingAgent.isManager === true ||
                  Number(editingAgent.isManager) === 1
                }
                onChange={(event) =>
                  setEditingAgent((current) =>
                    current
                      ? { ...current, isManager: event.target.checked }
                      : current
                  )
                }
              />
              Manager permissions
            </label>

            {editMessage && (
              <p
                role="status"
                className={`sm:col-span-2 text-sm ${
                  editError ? "text-red-600" : "text-green-600"
                }`}
              >
                {editMessage}
              </p>
            )}

            <div className="flex gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded-lg bg-blue-600 px-5 py-2 text-white disabled:opacity-50"
              >
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingAgent(null);
                  setEditMessage("");
                }}
                className="rounded-lg border border-slate-300 px-5 py-2"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
      {resettingAgent && (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h3 className="text-xl font-semibold">
      Reset Password — {resettingAgent.fullName}
    </h3>

    <form
      onSubmit={resetAgentPassword}
      className="mt-5 space-y-4"
    >
      <label className="block text-sm font-medium">
        New Password
        <input
          required
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>

      <p className="text-xs text-slate-500">
        Password must contain between 12 and 128 characters.
      </p>

      {passwordMessage && (
        <p
          role="status"
          className={`text-sm ${
            passwordError ? "text-red-600" : "text-green-600"
          }`}
        >
          {passwordMessage}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={savingPassword}
          className="rounded-lg bg-blue-600 px-5 py-2 text-white disabled:opacity-50"
        >
          {savingPassword ? "Saving..." : "Reset Password"}
        </button>

        <button
          type="button"
          onClick={() => {
            setResettingAgent(null);
            setNewPassword("");
            setPasswordMessage("");
          }}
          className="rounded-lg border border-slate-300 px-5 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  </section>
)}
    </div>
  );
}