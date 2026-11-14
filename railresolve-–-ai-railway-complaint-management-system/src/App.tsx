import { useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { CommandCenter } from './components/CommandCenter';
import { FloatingSosButton } from './components/FloatingSosButton';
import { PassengerPortal } from './components/PassengerPortal';
import { RailResolveLogo } from './components/RailResolveLogo';
import { TrackComplaint } from './components/TrackComplaint';
import { saveMyTicketId } from './lib/myTickets';
import type { ComplaintRecord } from './types/complaint';

type ActiveView = 'command' | 'track' | 'form' | 'admin';

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('ticket')) return 'track';
    }
    return 'command';
  });

  const [trackedTicketId, setTrackedTicketId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('ticket') || '';
    }
    return '';
  });

  const [externalSosTicket, setExternalSosTicket] =
    useState<ComplaintRecord | null>(null);

  function handleNavigateToTrack(ticketId: string) {
    setTrackedTicketId(ticketId);
    setActiveView('track');
  }

  function handleSosDispatched(complaint: ComplaintRecord) {
    saveMyTicketId(complaint.ticket_id);
    setExternalSosTicket(complaint);
    setActiveView('command');
  }

  return (
    <div className="min-h-screen flex flex-col bg-rail-canvas text-slate-900">
      {/* Clean 3-Zone Top Bar */}
      <header className="border-b-2 border-amber-500 bg-gradient-to-r from-[#081931] via-[#0B1F3A] to-[#122F57] text-white shadow-md">
        <div className="h-1 w-full bg-gradient-to-r from-[#FF9933] via-white to-[#138808]" />
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
          {/* Zone 1: RailResolve Brand Logo */}
          <button
            type="button"
            onClick={() => setActiveView('command')}
            className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <RailResolveLogo size="md" tone="dark-bg" />
          </button>

          {/* Zone 2: Passenger Portal Navigation Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-8 text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => setActiveView('command')}
              className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'command'
                  ? 'border-amber-400 text-white'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              AI Assistant
            </button>
            <button
              type="button"
              onClick={() => setActiveView('form')}
              className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'form'
                  ? 'border-amber-400 text-white'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              Complaint Form
            </button>
            <button
              type="button"
              onClick={() => setActiveView('track')}
              className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'track'
                  ? 'border-amber-400 text-white'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              Track Ticket
            </button>
          </nav>

          {/* Zone 3: Admin Operations Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveView('admin')}
              className={`rounded-md px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3A] whitespace-nowrap shrink-0 ${
                activeView === 'admin'
                  ? 'bg-white text-[#0B1F3A]'
                  : 'bg-amber-500 text-[#0B1F3A] hover:bg-amber-400'
              }`}
            >
              Admin Dashboard
            </button>
          </div>
        </div>

        {/* Mobile Navigation Strip */}
        <nav
          aria-label="Mobile navigation"
          className="flex md:hidden border-t border-white/10 bg-[#08172B] px-4 py-2 gap-2 overflow-x-auto"
        >
          <button
            type="button"
            onClick={() => setActiveView('command')}
            className={`rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
              activeView === 'command'
                ? 'bg-amber-500 text-[#0B1F3A] font-semibold'
                : 'text-slate-300'
            }`}
          >
            AI Assistant
          </button>
          <button
            type="button"
            onClick={() => setActiveView('form')}
            className={`rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
              activeView === 'form'
                ? 'bg-amber-500 text-[#0B1F3A] font-semibold'
                : 'text-slate-300'
            }`}
          >
            Complaint Form
          </button>
          <button
            type="button"
            onClick={() => setActiveView('track')}
            className={`rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
              activeView === 'track'
                ? 'bg-amber-500 text-[#0B1F3A] font-semibold'
                : 'text-slate-300'
            }`}
          >
            Track Ticket
          </button>
          <button
            type="button"
            onClick={() => setActiveView('admin')}
            className={`rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
              activeView === 'admin'
                ? 'bg-amber-500 text-[#0B1F3A] font-semibold'
                : 'text-slate-300'
            }`}
          >
            Admin Dashboard
          </button>
        </nav>
      </header>

      <main className="flex-1 pb-16">
        {activeView === 'command' && (
          <CommandCenter
            onTrackTicket={handleNavigateToTrack}
            externalSosTicket={externalSosTicket}
          />
        )}
        {activeView === 'track' && (
          <TrackComplaint initialTicketId={trackedTicketId} />
        )}
        {activeView === 'form' && (
          <PassengerPortal onTrackTicket={handleNavigateToTrack} />
        )}
        {activeView === 'admin' && <AdminDashboard />}
      </main>

      {activeView !== 'admin' && (
        <FloatingSosButton onSosDispatched={handleSosDispatched} />
      )}

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-4 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <RailResolveLogo size="sm" showWordmark={false} tone="light-bg" />
            <p className="font-medium text-slate-800">
              RailResolve – Autonomous Railway Grievance &amp; Operations System
            </p>
          </div>
          <p>
            Indian Railways Helpline:{' '}
            <span className="font-mono font-semibold text-slate-900">139</span>{' '}
            · RPF Security:{' '}
            <span className="font-mono font-semibold text-slate-900">182</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
