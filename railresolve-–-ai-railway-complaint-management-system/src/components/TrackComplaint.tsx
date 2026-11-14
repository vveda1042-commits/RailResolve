import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CircleDot,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { fetchComplaintByTicketId } from '../lib/api';
import { loadMyTicketIds, saveMyTicketId } from '../lib/myTickets';
import type { ComplaintRecord } from '../types/complaint';
import { PriorityTag, StatusTag } from './StatusTag';

interface TrackComplaintProps {
  initialTicketId?: string;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TrackComplaint({ initialTicketId = '' }: TrackComplaintProps) {
  const [query, setQuery] = useState(initialTicketId);
  const [recentIds, setRecentIds] = useState<string[]>(() => loadMyTicketIds());
  const [complaint, setComplaint] = useState<ComplaintRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  async function lookupTicket(ticketIdToFetch: string) {
    const cleaned = ticketIdToFetch.trim();
    if (!cleaned) {
      setErrorMsg('Please enter a valid Ticket ID (for example, RR-261113-A7K9C).');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setHasSearched(true);

    try {
      const record = await fetchComplaintByTicketId(cleaned);
      setComplaint(record);
      setRecentIds(saveMyTicketId(record.ticket_id));
    } catch (err) {
      setComplaint(null);
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to fetch complaint status.'
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (initialTicketId && initialTicketId.trim()) {
      setQuery(initialTicketId.trim());
      void lookupTicket(initialTicketId.trim());
    }
  }, [initialTicketId]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void lookupTicket(query);
  }

  const currentStep =
    complaint?.status === 'Resolved'
      ? 3
      : complaint?.status === 'In Progress'
        ? 2
        : 1;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
          Track Your Complaint
        </h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          Enter your RailResolve Ticket ID to check live departmental status, AI
          triage routing, and staff resolution notes.
        </p>
      </div>

      {/* Search Bar */}
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5"
      >
        <label
          htmlFor="ticket_search"
          className="block text-xs font-medium text-slate-700"
        >
          Ticket ID
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="ticket_search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter Ticket ID (e.g. RR-261113-A7K9C)"
              disabled={isLoading}
              className="block w-full rounded-md border border-slate-300 bg-white py-2.5 pl-9 pr-3 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]/15 disabled:bg-slate-50"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[#0B1F3A] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#14345E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F3A] focus-visible:ring-offset-2 disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <Search className="h-4 w-4" />
            <span>{isLoading ? 'Searching...' : 'Track Ticket'}</span>
          </button>
        </div>

        {recentIds.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
            <span className="text-[11px] font-medium text-slate-500 mr-1">
              Your recent tickets:
            </span>
            {recentIds.map((id) => (
              <button
                key={id}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setQuery(id);
                  void lookupTicket(id);
                }}
                className={`rounded border px-2 py-1 font-mono text-[11px] font-semibold transition-colors ${
                  complaint?.ticket_id === id
                    ? 'border-[#0B1F3A] bg-[#0B1F3A] text-white'
                    : 'border-slate-200 bg-slate-50 text-[#0B1F3A] hover:bg-slate-100'
                }`}
              >
                {id}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 animate-pulse space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-6 w-44 rounded bg-slate-200" />
            <div className="h-6 w-24 rounded bg-slate-200" />
          </div>
          <div className="h-12 w-full rounded bg-slate-100" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="h-10 rounded bg-slate-100" />
            <div className="h-10 rounded bg-slate-100" />
            <div className="h-10 rounded bg-slate-100" />
            <div className="h-10 rounded bg-slate-100" />
          </div>
          <div className="h-20 w-full rounded bg-slate-100" />
        </div>
      )}

      {/* Error Message */}
      {!isLoading && errorMsg && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-900"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold">Ticket Lookup Failed</p>
            <p className="mt-1 text-red-800">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Empty Initial Prompt */}
      {!isLoading && !errorMsg && !complaint && !hasSearched && (
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-800">
            Ready to check a complaint
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Paste the <span className="font-mono">RR-</span> ticket ID issued
            when you submitted your complaint above.
          </p>
        </div>
      )}

      {/* Ticket Result Dossier */}
      {!isLoading && complaint && (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-amber-400 bg-gradient-to-r from-[#0B1F3A] to-[#163868] px-6 py-5 text-white">
            <div>
              <p className="text-xs font-medium text-amber-300">
                Complaint Ticket
              </p>
              <h2 className="mt-0.5 font-mono text-xl font-semibold text-white">
                {complaint.ticket_id}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <PriorityTag priority={complaint.priority} />
              <StatusTag status={complaint.status} />
              <button
                type="button"
                onClick={() => void lookupTicket(complaint.ticket_id)}
                className="inline-flex items-center gap-1.5 rounded border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Urgent Safety Escalation Notice */}
          {complaint.priority === 'Critical' && (
            <div className="border-b border-red-200 bg-red-50 px-6 py-4 flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
              <p className="text-xs leading-relaxed text-red-900">
                <strong>Urgent Human Attention Priority:</strong> This ticket has
                been escalated for immediate human review. For active
                emergencies, please call Railway Helpline{' '}
                <span className="font-mono font-semibold">139</span> or RPF{' '}
                <span className="font-mono font-semibold">182</span>.
              </p>
            </div>
          )}

          {/* 3-Step Status Stepper */}
          <div className="border-b border-slate-200 px-6 py-5">
            <p className="mb-3 text-xs font-medium text-slate-500">
              Resolution Progress
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div
                className={`rounded-md border px-3 py-2.5 ${
                  currentStep >= 1
                    ? 'border-amber-300 bg-amber-50/70'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                  <CircleDot
                    className={`h-3.5 w-3.5 ${
                      currentStep >= 1 ? 'text-amber-600' : 'text-slate-400'
                    }`}
                  />
                  <span>1. Open</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-600">
                  Logged &amp; triaged
                </p>
              </div>

              <div
                className={`rounded-md border px-3 py-2.5 ${
                  currentStep >= 2
                    ? 'border-blue-300 bg-blue-50/70'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                  <Clock
                    className={`h-3.5 w-3.5 ${
                      currentStep >= 2 ? 'text-blue-600' : 'text-slate-400'
                    }`}
                  />
                  <span>2. In Progress</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-600">
                  Assigned team acting
                </p>
              </div>

              <div
                className={`rounded-md border px-3 py-2.5 ${
                  currentStep >= 3
                    ? 'border-emerald-300 bg-emerald-50/70'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                  <CheckCircle2
                    className={`h-3.5 w-3.5 ${
                      currentStep >= 3 ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  />
                  <span>3. Resolved</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-600">
                  Issue closed by staff
                </p>
              </div>
            </div>
          </div>

          {/* Core Metadata Grid */}
          <div className="grid grid-cols-2 gap-6 border-b border-slate-200 px-6 py-5 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Category</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {complaint.category}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Department</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {complaint.department}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Train / Coach / Seat</p>
              <p className="mt-1 font-mono text-sm font-medium text-slate-900">
                {complaint.train_number} · {complaint.coach} /{' '}
                {complaint.seat_number}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Passenger</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {complaint.passenger_name}
              </p>
            </div>
          </div>

          {/* Description & AI Routing Details */}
          <div className="space-y-5 px-6 py-5">
            <div>
              <p className="text-xs font-medium text-slate-500">
                Complaint Description
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {complaint.description}
              </p>
            </div>

            {(complaint.ai_reasoning || complaint.recommended_action) && (
              <div className="grid grid-cols-1 gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2">
                {complaint.ai_reasoning && (
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      AI Triage Reasoning
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-700">
                      {complaint.ai_reasoning}
                    </p>
                  </div>
                )}
                {complaint.recommended_action && (
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Recommended Staff Action
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-700">
                      {complaint.recommended_action}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-slate-100 pt-5">
              <p className="text-xs font-medium text-slate-500">
                Official Resolution Notes
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-800">
                {complaint.resolution_notes ? (
                  complaint.resolution_notes
                ) : (
                  <span className="text-slate-500">
                    No staff resolution notes posted yet.
                  </span>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500 font-mono">
              <span>Submitted: {formatDateTime(complaint.created_at)}</span>
              <span>Last Updated: {formatDateTime(complaint.updated_at)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
