import { useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  PhoneCall,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { createComplaint } from '../lib/api';
import { saveMyTicketId } from '../lib/myTickets';
import type { ComplaintRecord } from '../types/complaint';
import { PriorityTag, StatusTag } from './StatusTag';

interface PassengerPortalProps {
  onTrackTicket: (ticketId: string) => void;
}

export function PassengerPortal({ onTrackTicket }: PassengerPortalProps) {
  const [passengerName, setPassengerName] = useState('');
  const [contact, setContact] = useState('');
  const [trainNumber, setTrainNumber] = useState('');
  const [coach, setCoach] = useState('');
  const [seatNumber, setSeatNumber] = useState('');
  const [description, setDescription] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedComplaint, setSubmittedComplaint] =
    useState<ComplaintRecord | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const created = await createComplaint({
        passenger_name: passengerName,
        contact,
        train_number: trainNumber,
        coach,
        seat_number: seatNumber,
        description,
      });

      saveMyTicketId(created.ticket_id);
      setSubmittedComplaint(created);
      setPassengerName('');
      setContact('');
      setTrainNumber('');
      setCoach('');
      setSeatNumber('');
      setDescription('');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unable to submit your complaint right now. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopyTicket(ticketId: string) {
    try {
      await navigator.clipboard.writeText(ticketId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
          Passenger Complaint Portal
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
          Report onboard, station, or ticketing issues. Your complaint is
          automatically triaged to the responsible railway department with a
          trackable ticket ID.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* Left: Complaint Submission Form */}
        <section className="lg:col-span-7 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
          <div className="border-b-2 border-amber-400 bg-gradient-to-r from-[#0B1F3A] to-[#163868] px-6 py-4 text-white sm:px-8">
            <h2 className="text-base font-semibold text-white">
              Submit a Railway Complaint
            </h2>
            <p className="mt-0.5 text-xs text-slate-200">
              All fields are required so railway staff can locate your coach and
              resolve the issue quickly.
            </p>
          </div>

          <div className="p-6 sm:p-8">

          {errorMsg && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div>
                <p className="font-semibold">Submission failed</p>
                <p className="mt-0.5 text-red-700">{errorMsg}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="passenger_name"
                  className="block text-xs font-medium text-slate-700"
                >
                  Passenger Name
                </label>
                <input
                  id="passenger_name"
                  type="text"
                  required
                  value={passengerName}
                  onChange={(e) => setPassengerName(e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                  disabled={isSubmitting}
                  className="mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15 disabled:bg-slate-50"
                />
              </div>

              <div>
                <label
                  htmlFor="contact"
                  className="block text-xs font-medium text-slate-700"
                >
                  Phone Number or Email
                </label>
                <input
                  id="contact"
                  type="text"
                  required
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="e.g. +91 98765 43210 or email"
                  disabled={isSubmitting}
                  className="mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15 disabled:bg-slate-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="train_number"
                  className="block text-xs font-medium text-slate-700"
                >
                  Train Number / Name
                </label>
                <input
                  id="train_number"
                  type="text"
                  required
                  value={trainNumber}
                  onChange={(e) => setTrainNumber(e.target.value)}
                  placeholder="e.g. 12951 Rajdhani"
                  disabled={isSubmitting}
                  className="mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15 disabled:bg-slate-50"
                />
              </div>

              <div>
                <label
                  htmlFor="coach"
                  className="block text-xs font-medium text-slate-700"
                >
                  Coach
                </label>
                <input
                  id="coach"
                  type="text"
                  required
                  value={coach}
                  onChange={(e) => setCoach(e.target.value)}
                  placeholder="e.g. B4"
                  disabled={isSubmitting}
                  className="mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15 disabled:bg-slate-50"
                />
              </div>

              <div>
                <label
                  htmlFor="seat_number"
                  className="block text-xs font-medium text-slate-700"
                >
                  Seat / Berth Number
                </label>
                <input
                  id="seat_number"
                  type="text"
                  required
                  value={seatNumber}
                  onChange={(e) => setSeatNumber(e.target.value)}
                  placeholder="e.g. 42 (Lower)"
                  disabled={isSubmitting}
                  className="mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15 disabled:bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-xs font-medium text-slate-700"
              >
                Complaint Description
              </label>
              <textarea
                id="description"
                required
                rows={5}
                minLength={10}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue clearly (what happened, location in coach, urgency, or safety risk)..."
                disabled={isSubmitting}
                className="mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15 disabled:bg-slate-50"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Gemini AI will classify the category, urgency, and assigned
                department upon submission.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0B1F3A] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#14345E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F3A] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto whitespace-nowrap shrink-0"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analyzing &amp; Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Submit Complaint</span>
                  </>
                )}
              </button>
            </div>
          </form>
          </div>
        </section>

        {/* Right: Confirmation Receipt & Safety Notice */}
        <aside className="lg:col-span-5 space-y-6">
          {submittedComplaint && (
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs font-medium text-emerald-700">
                    Complaint Registered
                  </p>
                  <h3 className="mt-1 font-mono text-xl font-semibold text-slate-900">
                    {submittedComplaint.ticket_id}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyTicket(submittedComplaint.ticket_id)}
                  className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy ID</span>
                    </>
                  )}
                </button>
              </div>

              {submittedComplaint.priority === 'Critical' && (
                <div className="mt-4 flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 p-3.5 text-xs text-red-900">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                  <div>
                    <p className="font-semibold">
                      Flagged for Urgent Human Attention
                    </p>
                    <p className="mt-1 leading-relaxed text-red-800">
                      This complaint was prioritized as Critical. If you are in
                      immediate physical danger, do not wait for ticket triage—call
                      Helpline 139 or RPF 182 immediately.
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Status</span>
                  <StatusTag status={submittedComplaint.status} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Priority</span>
                  <PriorityTag priority={submittedComplaint.priority} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">AI Category</span>
                  <span className="font-medium text-slate-900">
                    {submittedComplaint.category}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">Assigned Dept</span>
                  <span className="text-right font-medium text-slate-900">
                    {submittedComplaint.department}
                  </span>
                </div>
              </div>

              {submittedComplaint.ai_reasoning && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-xs font-medium text-slate-500">
                    AI Triage Reasoning
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
                    {submittedComplaint.ai_reasoning}
                  </p>
                </div>
              )}

              {submittedComplaint.recommended_action && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500">
                    Recommended Staff Action
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
                    {submittedComplaint.recommended_action}
                  </p>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => onTrackTicket(submittedComplaint.ticket_id)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  <span>Track This Ticket</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSubmittedComplaint(null)}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
                >
                  Dismiss Receipt
                </button>
              </div>
            </div>
          )}

          {/* Mandatory Safety & Non-Emergency Disclaimer */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-5">
            <div className="flex items-start gap-3">
              <PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" />
              <div>
                <h3 className="text-sm font-semibold text-amber-950">
                  Safety &amp; Emergency Disclaimer
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-amber-900">
                  AI triage assists railway operations teams in routing service
                  grievances and is <strong>not emergency assistance</strong>.
                  Safety-related reports are prioritized for human review, but
                  live emergencies require immediate direct action.
                </p>
                <p className="mt-2.5 text-xs font-medium text-amber-950">
                  For active fire, medical crisis, crime, or physical threat:
                  call Railway Helpline <span className="font-mono">139</span> or
                  RPF <span className="font-mono">182</span>, or notify the
                  Train Guard / TTE immediately.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-900">
              How RailResolve Triage Works
            </h3>
            <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-600">
              <li>
                <span className="font-semibold text-slate-800">
                  1. Instant AI Classification:
                </span>{' '}
                Your complaint description is categorized across 10 railway
                departments with priority scoring.
              </li>
              <li>
                <span className="font-semibold text-slate-800">
                  2. Unique Ticket Generation:
                </span>{' '}
                You receive a unique <span className="font-mono">RR-</span>{' '}
                ticket ID immediately stored in the operations database.
              </li>
              <li>
                <span className="font-semibold text-slate-800">
                  3. Live Status Tracking:
                </span>{' '}
                Use your ticket ID anytime to monitor progress from Open to In
                Progress and Resolved.
              </li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
