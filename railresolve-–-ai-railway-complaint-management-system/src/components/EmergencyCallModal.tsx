import { useEffect, useRef, useState } from 'react';
import {
  PhoneCall,
  PhoneOff,
  ShieldAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ComplaintRecord } from '../types/complaint';

interface EmergencyCallModalProps {
  complaint: ComplaintRecord | null;
  onClose: () => void;
}

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function EmergencyCallModal({
  complaint,
  onClose,
}: EmergencyCallModalProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const spokenForTicketRef = useRef<string | null>(null);

  const isConnected = elapsedSeconds >= 2;

  function speakDispatch(target: ComplaintRecord) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSpeechSupported(false);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const station = target.next_station || 'the next major junction';
      const eta = target.eta_minutes ? `${target.eta_minutes} minutes` : 'next halt';
      const unit =
        target.department === 'Medical'
          ? 'Emergency Medical Team and Railway Hospital unit'
          : 'RPF Quick Response and Women Safety Team';

      const script = `Priority RailResolve Emergency Alert. Ticket ${target.ticket_id}. ${unit} deployed to ${station}, arrival in ${eta}. Target location: Train ${target.train_number}, Coach ${target.coach}. Divisional Control Room is monitoring live.`;
      const utterance = new SpeechSynthesisUtterance(script);
      utterance.rate = 1.02;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeechSupported(false);
    }
  }

  useEffect(() => {
    if (!complaint) {
      setElapsedSeconds(0);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    setElapsedSeconds(0);
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    if (!isMuted && spokenForTicketRef.current !== complaint.ticket_id) {
      spokenForTicketRef.current = complaint.ticket_id;
      const timer = setTimeout(() => {
        speakDispatch(complaint);
      }, 900);
      return () => {
        clearInterval(interval);
        clearTimeout(timer);
      };
    }

    return () => clearInterval(interval);
  }, [complaint, isMuted]);

  function handleToggleMute() {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (
      nextMuted &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window
    ) {
      window.speechSynthesis.cancel();
    } else if (!nextMuted && complaint) {
      speakDispatch(complaint);
    }
  }

  function handleEndCall() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    onClose();
  }

  if (!complaint) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="emergency-call-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-lg border-2 border-red-600 bg-white shadow-2xl">
        {/* Top Crimson Call Banner */}
        <div className="bg-red-700 px-6 py-5 text-white">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <PhoneCall className="h-5 w-5 animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                {isConnected
                  ? 'Connected · Divisional Control Room'
                  : 'Dialing RPF / Railway Medical Dispatch...'}
              </span>
            </div>
            <span className="rounded bg-red-900/70 px-2.5 py-1 font-mono text-sm font-semibold tabular-nums">
              {formatTimer(elapsedSeconds)}
            </span>
          </div>

          <h2
            id="emergency-call-title"
            className="mt-3 text-xl font-bold tracking-tight"
          >
            {complaint.department === 'Medical'
              ? 'Emergency Medical Dispatch Active'
              : 'RPF Security & SOS Dispatch Active'}
          </h2>
          <p className="mt-1 text-xs text-red-100">
            Standard PNR queue bypassed · Ticket{' '}
            <span className="font-mono font-semibold">{complaint.ticket_id}</span>
          </p>
        </div>

        {/* Dispatch Telemetry */}
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs">
            <div>
              <p className="text-slate-500">Train / Coach</p>
              <p className="mt-0.5 font-mono font-semibold text-slate-900">
                {complaint.train_number} · Coach {complaint.coach}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Next Station Halt</p>
              <p className="mt-0.5 font-semibold text-slate-900">
                {complaint.next_station || 'Next Major Junction'}
                {complaint.eta_minutes ? ` (${complaint.eta_minutes}m)` : ''}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Flagged State</p>
              <p className="mt-0.5 font-mono font-semibold text-red-700">
                SOS: TRUE · EMERGENCY CALL: TRUE
              </p>
            </div>
            <div>
              <p className="text-slate-500">Passenger Phone</p>
              <p className="mt-0.5 font-mono font-medium text-slate-900">
                {complaint.passenger_phone || 'Not provided'}
              </p>
            </div>
          </div>

          <div className="rounded-md border border-red-200 bg-red-50 p-3.5 text-xs leading-relaxed text-red-950">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
              <div>
                <p className="font-semibold">Voice Dispatch Broadcast</p>
                <p className="mt-1 text-red-900">
                  &ldquo;
                  {complaint.department === 'Medical'
                    ? 'Emergency Medical Team and Railway Hospital unit'
                    : 'RPF Quick Response and Women Safety Team'}{' '}
                  deployed to {complaint.next_station || 'next major junction'}{' '}
                  for Coach {complaint.coach}.&rdquo;
                </p>
                {!speechSupported && (
                  <p className="mt-1 text-[11px] text-red-700">
                    Browser speech synthesis is unavailable on this device; visual
                    alert remains active.
                  </p>
                )}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-600">
            For immediate life-threatening emergencies, passengers should also
            dial Indian Railways Helpline{' '}
            <span className="font-mono font-semibold text-slate-900">139</span>{' '}
            or RPF{' '}
            <span className="font-mono font-semibold text-slate-900">182</span>{' '}
            or pull the emergency chain if required.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleMute}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                {isMuted ? (
                  <>
                    <VolumeX className="h-3.5 w-3.5" />
                    <span>Unmute Audio</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3.5 w-3.5 text-red-700" />
                    <span>Mute Voice</span>
                  </>
                )}
              </button>

              {!isMuted && (
                <button
                  type="button"
                  onClick={() => speakDispatch(complaint)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>Replay Dispatch</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleEndCall}
              className="inline-flex items-center gap-2 rounded-md bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 whitespace-nowrap shrink-0"
            >
              <PhoneOff className="h-3.5 w-3.5" />
              <span>Acknowledge &amp; End Call</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
