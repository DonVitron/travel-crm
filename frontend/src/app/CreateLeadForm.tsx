"use client";

import { useState, type FormEvent } from "react";

const API_URL = "http://localhost:3001";

type CreateLeadFormProps = {
  accessToken: string;
  onCreated: () => void;
};

export default function CreateLeadForm({
  accessToken,
  onCreated,
}: CreateLeadFormProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setIsError(false);

    try {
      const response = await fetch(`${API_URL}/leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          customerPhone: customerPhone.trim(),
          notes: notes.trim(),
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(
          typeof result?.message === "string"
            ? result.message
            : "Couldn't create the lead. Please try again.",
        );
      }

      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setNotes("");
      setMessage("Lead created successfully.");
      onCreated();
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-semibold">Create a lead</h3>
      <p className="mt-1 text-sm text-slate-500">
        Add a new customer inquiry to your CRM.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label
            htmlFor="customerName"
            className="mb-1 block text-sm font-medium"
          >
            Customer name *
          </label>
          <input
            id="customerName"
            name="customerName"
            required
            maxLength={160}
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div>
          <label
            htmlFor="customerEmail"
            className="mb-1 block text-sm font-medium"
          >
            Email
          </label>
          <input
            id="customerEmail"
            name="customerEmail"
            type="email"
            maxLength={254}
            value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div>
          <label
            htmlFor="customerPhone"
            className="mb-1 block text-sm font-medium"
          >
            Phone
          </label>
          <input
            id="customerPhone"
            name="customerPhone"
            type="tel"
            maxLength={40}
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div>
          <label
            htmlFor="leadNotes"
            className="mb-1 block text-sm font-medium"
          >
            Notes
          </label>
          <textarea
            id="leadNotes"
            name="notes"
            rows={3}
            maxLength={5000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {message && (
          <p
            role={isError ? "alert" : "status"}
            className={`text-sm ${isError ? "text-red-600" : "text-green-700"}`}
          >
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Creating lead..." : "Create lead"}
        </button>
      </form>
    </section>
  );
}
