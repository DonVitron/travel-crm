"use client";

import { useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type PoolLead = {
  id: number;
  customerName: string;
  source: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
};

type PoolResponse = {
  data: PoolLead[];
  total: number;
  page: number;
  totalPages: number;
};

type LeadPoolProps = {
  accessToken: string;
  onClaimed: () => void;
};

const sourceLabels: Record<string, string> = {
  INBOX: "Inbox",
  LIVE_CHAT: "Live chat",
  GENERAL_LINE: "General line",
  OTHER: "Other",
};

export default function LeadPool({ accessToken, onClaimed }: LeadPoolProps) {
  const [leads, setLeads] = useState<PoolLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPool() {
      try {
        const response = await fetch(`${API_URL}/leads/pool?page=${page}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load the lead pool");
        }

        const result: PoolResponse = await response.json();

        // If the last lead on a later page was just claimed, step back a page.
        if (result.data.length === 0 && page > 1) {
          setPage(page - 1);
          return;
        }

        setLeads(result.data);
        setTotal(result.total);
        setTotalPages(Math.max(result.totalPages, 1));
        setLoadError(false);
      } catch {
        if (!controller.signal.aborted) {
          setLoadError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadPool();

    return () => controller.abort();
  }, [accessToken, page, refreshKey]);

  const claimLead = useCallback(
    async (lead: PoolLead) => {
      setClaimingId(lead.id);
      setNotice(null);

      try {
        const response = await fetch(`${API_URL}/leads/${lead.id}/claim`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.ok) {
          setNotice({
            kind: "success",
            text: `You claimed ${lead.customerName}. Find it under Leads.`,
          });
          onClaimed();
        } else if (response.status === 409) {
          setNotice({
            kind: "error",
            text: `${lead.customerName} was just claimed by someone else.`,
          });
        } else {
          setNotice({
            kind: "error",
            text: "Could not claim this lead. Please try again.",
          });
        }
      } catch {
        setNotice({
          kind: "error",
          text: "Could not reach the server. Please try again.",
        });
      } finally {
        setClaimingId(null);
        setRefreshKey((key) => key + 1);
      }
    },
    [accessToken, onClaimed],
  );

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Lead pool</h3>
          <p className="mt-1 text-sm text-slate-500">
            Unclaimed leads, oldest first. Claim one to work it. Contact
            details are shown after you claim.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
          {loading ? "Loading" : loadError ? "Unavailable" : `${total} waiting`}
        </span>
      </div>

      {notice && (
        <p
          role="status"
          className={`mt-4 rounded-lg px-4 py-3 text-sm ${
            notice.kind === "success"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </p>
      )}

      {loadError && (
        <p className="mt-4 text-sm text-red-600">
          The lead pool could not be loaded.
        </p>
      )}

      {!loading && !loadError && leads.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">
          The pool is empty. New leads will show up here.
        </p>
      )}

      {leads.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 pr-4 font-medium">Notes</th>
                <th className="py-2 pr-4 font-medium">Received</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td className="py-3 pr-4 font-medium">{lead.customerName}</td>
                  <td className="py-3 pr-4 text-slate-600">
                    {lead.source ? (sourceLabels[lead.source] ?? lead.source) : "-"}
                  </td>
                  <td className="max-w-xs truncate py-3 pr-4 text-slate-600">
                    {lead.notes ?? "-"}
                  </td>
                  <td className="whitespace-nowrap py-3 pr-4 text-slate-600">
                    {new Date(lead.createdAt).toLocaleString()}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      disabled={claimingId !== null}
                      onClick={() => void claimLead(lead)}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {claimingId === lead.id ? "Claiming..." : "Claim"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
