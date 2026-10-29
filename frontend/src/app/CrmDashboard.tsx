"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import CreateLeadForm from "./CreateLeadForm";
import LeadPool from "./LeadPool";

const navigation = [
  { label: "Dashboard", icon: "D", active: true },
  { label: "Leads", icon: "L", active: false },
  { label: "Lead Pool", icon: "P", active: false },
  { label: "Flight Requests", icon: "F", active: false },
  { label: "Quotes", icon: "Q", active: false },
  { label: "Customers", icon: "C", active: false },
];

const stats = [
  { label: "Total Leads", value: "128", note: "Sample overview" },
  { label: "Pending Requests", value: "12", note: "Sample overview" },
  { label: "Quotes Prepared", value: "34", note: "Sample overview" },
  { label: "Bookings", value: "18", note: "Sample overview" },
];

type Lead = {
  id: number;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
  status: "new" | "contacted" | "qualified" | "quoted" | "won" | "lost";
  createdAt: string;
};

type LeadsResponse = {
  data: Lead[];
  count: number;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type Client = {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  leadCount: number;
};

type ClientLead = {
  id: number;
  originCode: string | null;
  destinationCode: string | null;
  cabinClass: string | null;
  departureDate: string | null;
  returnDate: string | null;
  status: string;
  source: string;
  contactability: string;
  createdAt: string;
  assignedAt: string | null;
  assignedAgentId: number | string | null;
};

type ClientsResponse = {
  data: Client[];
  count: number;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type ClientDetailsResponse = {
  data: Omit<Client, "leadCount"> & {
    leads: ClientLead[];
    leadCount: number;
  };
};

const API_URL = "http://localhost:3001";

type CrmDashboardProps = {
  accessToken: string;
  onLogout: () => void;
  initialSection?: string;
};

export default function CrmDashboard({
  accessToken,
  onLogout,
  initialSection,
}: CrmDashboardProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [leads, setLeads] = useState<Lead[]>([]);

  const [clients, setClients] = useState<Client[]>([]);
  const [clientsPage, setClientsPage] = useState(1);
  const [clientsTotalPages, setClientsTotalPages] = useState(0);
  const [clientsTotal, setClientsTotal] = useState(0);
  const [clientsSearch, setClientsSearch] = useState("");
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState("");
  const [selectedClient, setSelectedClient] =
    useState<ClientDetailsResponse["data"] | null>(null);
  const [clientDetailsLoading, setClientDetailsLoading] = useState(false);
  const [clientDetailsError, setClientDetailsError] = useState("");
  const [activeSection, setActiveSection] = useState(
    initialSection ?? "Dashboard"
  );

  useEffect(() => {
    if (pathname === "/leads") {
      setActiveSection("Leads");
    }
  }, [pathname]);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerEmail, setEditCustomerEmail] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingLead, setSavingLead] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [editError, setEditError] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsError, setLeadsError] = useState(false);
  const [leadsRefreshKey, setLeadsRefreshKey] = useState(0);
  const [totalLeads, setTotalLeads] = useState<number | null>(null);
  const [totalLeadsError, setTotalLeadsError] = useState(false);
  const [updatingLeadId, setUpdatingLeadId] = useState<number | null>(null);
  const [statusUpdateMessage, setStatusUpdateMessage] = useState("");
  const [statusUpdateError, setStatusUpdateError] = useState(false);

  async function updateLeadStatus(leadId: number, status: Lead["status"]) {
    setUpdatingLeadId(leadId);
    setStatusUpdateMessage("");
    setStatusUpdateError(false);

    try {
      const response = await fetch(`${API_URL}/leads/${leadId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error("Status update failed");
      }

      setStatusUpdateMessage(`Lead #${leadId} updated to ${status}.`);
      setLeadsRefreshKey((key) => key + 1);
    } catch {
      setStatusUpdateError(true);
      setStatusUpdateMessage(
        `Couldn't update lead #${leadId}. Please try again.`
      );
    } finally {
      setUpdatingLeadId(null);
    }
  }

  async function saveLeadDetails() {
    if (!editingLead) return;

    setSavingLead(true);
    setEditMessage("");
    setEditError(false);

    try {
      const response = await fetch(
        `${API_URL}/leads/${editingLead.id}/details`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerName: editCustomerName,
            customerEmail: editCustomerEmail || null,
            customerPhone: editCustomerPhone || null,
            notes: editNotes || null,
          }),
        }
      );

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.message || "Could not save lead details.");
      }

      setEditMessage(`Lead #${editingLead.id} saved successfully.`);
      setLeadsRefreshKey((key) => key + 1);
      setEditingLead(null);
    } catch (error) {
      setEditError(true);
      setEditMessage(
        error instanceof Error
          ? error.message
          : "Could not save lead details. Please try again."
      );
    } finally {
      setSavingLead(false);
    }
  }

  async function openClient(clientId: number) {
    setSelectedClient(null);
    setClientDetailsLoading(true);
    setClientDetailsError("");

    try {
      const response = await fetch(`${API_URL}/clients/${clientId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Could not load client details.");
      }

      const result: ClientDetailsResponse = await response.json();
      setSelectedClient(result.data);
    } catch (error) {
      setClientDetailsError(
        error instanceof Error
          ? error.message
          : "Could not load client details."
      );
    } finally {
      setClientDetailsLoading(false);
    }
  }

  const filteredLeads = leads.filter((lead) => {
    const matchesName = lead.customerName
      .toLowerCase()
      .includes(searchText.trim().toLowerCase());

    const matchesStatus =
      statusFilter === "all" || lead.status === statusFilter;

    return matchesName && matchesStatus;
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadLeads() {
      try {
        const response = await fetch(
          `${API_URL}/leads?page=${currentPage}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            signal: controller.signal,
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error("Failed to load leads");
        }

        const result: LeadsResponse = await response.json();

        setLeads(result.data);
        setTotalPages(result.totalPages);
        setLeadsError(false);
      } catch {
        if (!controller.signal.aborted) {
          setLeadsError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLeadsLoading(false);
        }
      }
    }

    void loadLeads();

    return () => controller.abort();
  }, [accessToken, leadsRefreshKey, currentPage]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTotalLeads() {
      try {
        const response = await fetch(`${API_URL}/leads/count`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load total lead count");
        }

        const result: { total: number } = await response.json();
        setTotalLeads(result.total);
        setTotalLeadsError(false);
      } catch {
        if (!controller.signal.aborted) {
          setTotalLeadsError(true);
        }
      }
    }

    void loadTotalLeads();

    return () => controller.abort();
  }, [accessToken, leadsRefreshKey]);

  useEffect(() => {
    if (activeSection !== "Customers") return;

    const controller = new AbortController();

    async function loadClients() {
      setClientsLoading(true);
      setClientsError("");

      try {
        const params = new URLSearchParams({
          page: String(clientsPage),
          search: clientsSearch.trim(),
        });

        const response = await fetch(
          `${API_URL}/clients?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            signal: controller.signal,
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error("Could not load clients.");
        }

        const result: ClientsResponse = await response.json();

        setClients(result.data);
        setClientsTotal(result.total);
        setClientsTotalPages(result.totalPages);
      } catch (error) {
        if (!controller.signal.aborted) {
          setClientsError(
            error instanceof Error
              ? error.message
              : "Could not load clients."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setClientsLoading(false);
        }
      }
    }

    void loadClients();

    return () => controller.abort();
  }, [activeSection, accessToken, clientsPage, clientsSearch]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 md:flex">
      <aside className="w-full border-b border-slate-200 bg-white p-5 md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            Travel CRM
          </p>
          <h1 className="mt-2 text-2xl font-bold">Workspace</h1>
          <p className="mt-1 text-sm text-slate-500">
            Travel agency management
          </p>
        </div>

        <nav aria-label="Main navigation" className="space-y-2">
          {navigation.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setActiveSection(item.label);

                if (item.label === "Leads") {
                  router.push("/leads");
                } else if (pathname === "/leads") {
                  router.push("/");
                }
              }}
              aria-current={activeSection === item.label ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium ${
                activeSection === item.label
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-8 rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-semibold">Access control</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Admin and Agent permissions will be enforced by the backend.
          </p>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Sign out
        </button>
      </aside>

      <section className="min-w-0 flex-1 p-5 md:p-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-500">Workspace / Dashboard</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              {activeSection === "Dashboard" ? "Overview" : activeSection}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Your agency activity at a glance.
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Demo dashboard · Sample data
          </div>
        </header>

        {activeSection === "Dashboard" && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <article
                key={stat.label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="text-sm text-slate-500">{stat.label}</p>
                <p className="mt-3 text-3xl font-bold">
                  {stat.label === "Total Leads"
                    ? totalLeadsError
                      ? "Unavailable"
                      : totalLeads === null
                      ? "…"
                      : totalLeads
                    : stat.value}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {stat.label === "Total Leads"
                    ? totalLeadsError
                      ? "Could not load count"
                      : "Live database count"
                    : stat.note}
                </p>
              </article>
            ))}
          </div>
        )}

        {activeSection === "Lead Pool" && (
          <LeadPool
            accessToken={accessToken}
            onClaimed={() => {
              setCurrentPage(1);
              setLeadsRefreshKey((key) => key + 1);
            }}
          />
        )}

        {activeSection === "Leads" && (
          <div className="mt-8 grid gap-6 xl:grid-cols-3">
            <div className="xl:col-span-3">
              <CreateLeadForm
                accessToken={accessToken}
                onCreated={() => {
                  setCurrentPage(1);
                  setLeadsRefreshKey((key) => key + 1);
                }}
              />
            </div>
            <section className="rounded-2xl border border-slate-200 bg-white p-6 xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Recent leads</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Live records from your CRM database.
                  </p>
                </div>
                {editingLead && (
                  <form
                    className="mt-6 space-y-4 rounded-xl border border-slate-200 p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveLeadDetails();
                    }}
                  >
                    <h4 className="font-semibold">
                      Edit lead #{editingLead.id}
                    </h4>

                    <label className="block text-sm font-medium">
                      Customer name
                      <input
                        required
                        maxLength={160}
                        value={editCustomerName}
                        onChange={(event) =>
                          setEditCustomerName(event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      />
                    </label>

                    <label className="block text-sm font-medium">
                      Email
                      <input
                        type="email"
                        maxLength={254}
                        value={editCustomerEmail}
                        onChange={(event) =>
                          setEditCustomerEmail(event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      />
                    </label>

                    <label className="block text-sm font-medium">
                      Phone
                      <input
                        type="tel"
                        maxLength={40}
                        value={editCustomerPhone}
                        onChange={(event) =>
                          setEditCustomerPhone(event.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      />
                    </label>

                    <label className="block text-sm font-medium">
                      Notes
                      <textarea
                        maxLength={5000}
                        rows={4}
                        value={editNotes}
                        onChange={(event) => setEditNotes(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      />
                    </label>

                    {editMessage && (
                      <p
                        role={editError ? "alert" : "status"}
                        className={`text-sm ${
                          editError ? "text-red-600" : "text-green-700"
                        }`}
                      >
                        {editMessage}
                      </p>
                    )}

                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={savingLead}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {savingLead ? "Saving..." : "Save changes"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingLead(null);
                          setEditMessage("");
                          setEditError(false);
                        }}
                        disabled={savingLead}
                        className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                  {leadsLoading
                    ? "Loading"
                    : leadsError
                    ? "Unavailable"
                    : `${filteredLeads.length} leads`}
                </span>
              </div>

              {statusUpdateMessage && (
                <p
                  role={statusUpdateError ? "alert" : "status"}
                  className={`mt-4 text-sm ${
                    statusUpdateError ? "text-red-600" : "text-green-700"
                  }`}
                >
                  {statusUpdateMessage}
                </p>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <input
                  type="search"
                  aria-label="Search leads by customer name"
                  placeholder="Search customer name..."
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />

                <select
                  aria-label="Filter leads by status"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="quoted">Quoted</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </div>

              <div className="mt-5 overflow-x-auto">
                {leadsLoading ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    Loading leads…
                  </p>
                ) : leadsError ? (
                  <p
                    role="alert"
                    className="py-8 text-center text-sm text-red-600"
                  >
                    Couldn't load leads. Check that the backend is running and
                    try refreshing.
                  </p>
                ) : filteredLeads.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    {leads.length === 0
                      ? "No leads yet. New leads will appear here when they're added to your CRM."
                      : "No leads match your search and status filter."}
                  </p>
                ) : (
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500">
                        <th className="py-3 pr-4 font-medium">Lead</th>
                        <th className="py-3 pr-4 font-medium">ID</th>
                        <th className="py-3 font-medium">Status</th>
                        <th className="py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.map((lead) => (
                        <tr
                          key={lead.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-4 pr-4 font-medium">
                            {lead.customerName}
                          </td>
                          <td className="py-4 pr-4 text-slate-500">
                            {lead.id}
                          </td>
                          <td className="py-4">
                            <select
                              aria-label={`Status for lead ${lead.id}`}
                              value={lead.status}
                              disabled={updatingLeadId === lead.id}
                              onChange={(event) => {
                                const nextStatus = event.target
                                  .value as Lead["status"];
                                void updateLeadStatus(lead.id, nextStatus);
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm capitalize disabled:opacity-50"
                            >
                              <option value="new">New</option>
                              <option value="contacted">Contacted</option>
                              <option value="qualified">Qualified</option>
                              <option value="quoted">Quoted</option>
                              <option value="won">Won</option>
                              <option value="lost">Lost</option>
                            </select>
                          </td>
                          <td className="py-4">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLead(lead);
                                setEditCustomerName(lead.customerName);
                                setEditCustomerEmail(lead.customerEmail ?? "");
                                setEditCustomerPhone(lead.customerPhone ?? "");
                                setEditNotes(lead.notes ?? "");
                                setEditMessage("");
                                setEditError(false);
                              }}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-500">
                  Page {currentPage} of {Math.max(totalPages, 1)}
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1 || leadsLoading}
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>

                  <button
                    type="button"
                    disabled={currentPage >= totalPages || leadsLoading}
                    onClick={() => setCurrentPage((page) => page + 1)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="text-lg font-semibold">Flight requests</h3>
              <p className="mt-1 text-sm text-slate-500">
                Supported trip types
              </p>

              <div className="mt-5 space-y-3">
                {["One-way", "Round-trip", "Multi-city"].map((trip) => (
                  <div
                    key={trip}
                    className="flex items-center justify-between rounded-xl bg-slate-50 p-4"
                  >
                    <span className="text-sm font-medium">{trip}</span>
                    <span className="text-slate-400" aria-hidden="true">
                      →
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-xs leading-5 text-slate-500">
                These are visual placeholders. Flight requests and quotes will
                be connected after authentication and API permissions are ready.
              </p>
            </section>
          </div>
        )}

        {activeSection === "Customers" ? (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
            {selectedClient ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedClient(null)}
                  className="mb-5 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  ← Back to customers
                </button>

                <h3 className="text-xl font-semibold">
                  {selectedClient.fullName}
                </h3>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <p className="text-sm text-slate-600">
                    Email: {selectedClient.email || "—"}
                  </p>
                  <p className="text-sm text-slate-600">
                    Phone: {selectedClient.phone || "—"}
                  </p>
                  <p className="text-sm text-slate-600">
                    Client ID: {selectedClient.id}
                  </p>
                  <p className="text-sm text-slate-600">
                    Total leads: {selectedClient.leadCount}
                  </p>
                </div>

                <h4 className="mt-8 text-lg font-semibold">Travel requests</h4>

                {selectedClient.leads.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    No travel requests found for this customer.
                  </p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[700px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="py-3 pr-4">Lead</th>
                          <th className="py-3 pr-4">Route</th>
                          <th className="py-3 pr-4">Cabin</th>
                          <th className="py-3 pr-4">Departure</th>
                          <th className="py-3 pr-4">Return</th>
                          <th className="py-3 pr-4">Status</th>
                          <th className="py-3 pr-4">Source</th>
                          <th className="py-3">Contactability</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedClient.leads.map((lead) => (
                          <tr
                            key={lead.id}
                            className="border-b border-slate-100 last:border-0"
                          >
                            <td className="py-3 pr-4">#{lead.id}</td>
                            <td className="py-3 pr-4">
                              {lead.originCode || "—"} →{" "}
                              {lead.destinationCode || "—"}
                            </td>
                            <td className="py-3 pr-4">
                              {lead.cabinClass?.replaceAll("_", " ") || "—"}
                            </td>
                            <td className="py-3 pr-4">
                              {lead.departureDate?.slice(0, 10) || "—"}
                            </td>
                            <td className="py-3 pr-4">
                              {lead.returnDate?.slice(0, 10) || "One-way"}
                            </td>
                            <td className="py-3 pr-4">{lead.status}</td>
                            <td className="py-3 pr-4">{lead.source}</td>
                            <td className="py-3">{lead.contactability}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <>
                <h3 className="text-xl font-semibold">Customers</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Search customers and review their linked travel requests.
                </p>

                <input
                  type="search"
                  aria-label="Search customers"
                  placeholder="Search name, email, or phone..."
                  value={clientsSearch}
                  onChange={(event) => {
                    setClientsPage(1);
                    setClientsSearch(event.target.value);
                  }}
                  className="mt-5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:max-w-md"
                />

                {clientsLoading && (
                  <p className="py-6 text-sm text-slate-500">
                    Loading customers…
                  </p>
                )}

                {clientsError && (
                  <p role="alert" className="py-6 text-sm text-red-600">
                    {clientsError}
                  </p>
                )}

                {!clientsLoading && !clientsError && (
                  <>
                    <p className="mt-4 text-sm text-slate-500">
                      {clientsTotal} customer{clientsTotal === 1 ? "" : "s"}{" "}
                      found
                    </p>

                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[560px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-3 pr-4">Name</th>
                            <th className="py-3 pr-4">Email</th>
                            <th className="py-3 pr-4">Phone</th>
                            <th className="py-3 pr-4">Leads</th>
                            <th className="py-3">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clients.map((client) => (
                            <tr
                              key={client.id}
                              className="border-b border-slate-100 last:border-0"
                            >
                              <td className="py-4 pr-4 font-medium">
                                {client.fullName}
                              </td>
                              <td className="py-4 pr-4">
                                {client.email || "—"}
                              </td>
                              <td className="py-4 pr-4">
                                {client.phone || "—"}
                              </td>
                              <td className="py-4 pr-4">{client.leadCount}</td>
                              <td className="py-4">
                                <button
                                  type="button"
                                  onClick={() => void openClient(client.id)}
                                  className="rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {clients.length === 0 && (
                        <p className="py-8 text-center text-sm text-slate-500">
                          No customers match your search.
                        </p>
                      )}
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                      <p className="text-sm text-slate-500">
                        Page {clientsPage} of {Math.max(clientsTotalPages, 1)}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={clientsPage <= 1}
                          onClick={() =>
                            setClientsPage((page) => Math.max(1, page - 1))
                          }
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          disabled={
                            clientsPage >= clientsTotalPages ||
                            clientsTotalPages === 0
                          }
                          onClick={() => setClientsPage((page) => page + 1)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {clientDetailsLoading && (
                  <p role="status" className="mt-4 text-sm text-slate-500">
                    Loading customer details…
                  </p>
                )}

                {clientDetailsError && (
                  <p role="alert" className="mt-4 text-sm text-red-600">
                    {clientDetailsError}
                  </p>
                )}
              </>
            )}
          </section>
        ) : (
          ["Flight Requests", "Quotes"].includes(activeSection) && (
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-8">
              <h3 className="text-xl font-semibold">{activeSection}</h3>
              <p className="mt-2 text-sm text-slate-600">
                This section is ready for its features to be added.
              </p>
            </section>
          )
        )}

        <footer className="mt-8 border-t border-slate-200 py-5 text-xs text-slate-500">
          Travel CRM · Initial dashboard prototype
        </footer>
      </section>
    </main>
  );
}