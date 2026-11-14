import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Flame,
  HeartPulse,
  Loader2,
  MapPin,
  MessageSquareWarning,
  PhoneCall,
  ShieldAlert,
  Siren,
  X,
} from 'lucide-react';
import { triggerFastTrackSos } from '../lib/api';
import type { ComplaintRecord, FastTrackSosType } from '../types/complaint';

interface FloatingSosButtonProps {
  onSosDispatched: (complaint: ComplaintRecord) => void;
}

interface CachedJourneyContext {
  pnr?: string;
  phone?: string;
  coach?: string;
  seat?: string;
  train?: string;
}

function readCachedJourney(): CachedJourneyContext {
  try {
    const raw = localStorage.getItem('railresolve_cached_journey');
    if (!raw) return {};
    return JSON.parse(raw) as CachedJourneyContext;
  } catch {
    return {};
  }
}

export function FloatingSosButton({ onSosDispatched }: FloatingSosButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coach, setCoach] = useState('');
  const [seat, setSeat] = useState('');
  const [pnr, setPnr] = useState('');
  const [phone, setPhone] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    null
  );
  const [isSending, setIsSending] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [offlineSmsFallback, setOfflineSmsFallback] = useState<string | null>(
    null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const holdTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const cached = readCachedJourney();
    setCoach(cached.coach || 'B2');
    setSeat(cached.seat || '32');
    setPnr(cached.pnr || '');
    setPhone(cached.phone || '');
    setOfflineSmsFallback(null);
    setErrorMsg(null);
    setHoldProgress(0);

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          });
        },
        () => {
          // Graceful fallback when location permission denied or unavailable
        },
        { timeout: 2500, maximumAge: 60000 }
      );
    }
  }, [isOpen]);

  function buildSmsString(sosType: FastTrackSosType): string {
    const latStr = coords ? coords.lat.toFixed(4) : 'NA';
    const lonStr = coords ? coords.lon.toFixed(4) : 'NA';
    return `SOS|TRN:12951|COACH:${coach || 'GEN'}|BERTH:${seat || 'NA'}|LAT:${latStr}|LON:${lonStr}|TYPE:${sosType}`;
  }

  async function executeFastTrackSos(sosType: FastTrackSosType) {
    setIsSending(true);
    setErrorMsg(null);
    setOfflineSmsFallback(null);

    try {
      const res = await triggerFastTrackSos({
        sosType,
        pnr_number: pnr.trim() || undefined,
        coach: coach.trim() || 'General',
        seat_number: seat.trim() || 'Unassigned',
        passenger_phone: phone.trim() || undefined,
        latitude: coords?.lat ?? null,
        longitude: coords?.lon ?? null,
      });

      setIsOpen(false);
      onSosDispatched(res.complaint);
    } catch (err) {
      const fallback = buildSmsString(sosType);
      setOfflineSmsFallback(fallback);
      setErrorMsg(
        err instanceof Error
          ? `${err.message} — Offline compressed SMS payload generated below for dead-zone/tunnel transmission.`
          : 'Network timeout — Offline compressed SMS payload ready.'
      );
    } finally {
      setIsSending(false);
      setHoldProgress(0);
    }
  }

  function startHold() {
    if (isSending) return;
    if (holdTimerRef.current) window.clearInterval(holdTimerRef.current);

    const started = Date.now();
    holdTimerRef.current = window.setInterval(() => {
      const pct = Math.min(100, ((Date.now() - started) / 2000) * 100);
      setHoldProgress(pct);
      if (pct >= 100) {
        if (holdTimerRef.current) window.clearInterval(holdTimerRef.current);
        holdTimerRef.current = null;
        void executeFastTrackSos('SEC');
      }
    }, 50);
  }

  function cancelHold() {
    if (holdTimerRef.current) {
      window.clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldProgress(0);
  }

  return (
    <>
      {/* Persistent Floating Red SOS Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open Fast-Track Emergency SOS"
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-3 text-xs font-bold tracking-wide text-white shadow-lg ring-2 ring-white transition-transform hover:scale-[1.03] hover:bg-red-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-400"
      >
        <Siren className="h-4 w-4 shrink-0" />
        <span>SOS EMERGENCY</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fast-sos-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-red-300 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-red-700 px-5 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="h-5 w-5 shrink-0" />
                <div>
                  <h2 id="fast-sos-title" className="text-base font-bold">
                    Fast-Track Emergency SOS
                  </h2>
                  <p className="text-[11px] text-red-100">
                    Zero AI queue delay · Direct Control Room &amp; SMS fallback
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close SOS panel"
                onClick={() => setIsOpen(false)}
                className="rounded p-1 text-red-100 hover:bg-red-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {/* Cached Coach/Seat/GPS Bar */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600">
                    Coach
                  </label>
                  <input
                    type="text"
                    value={coach}
                    onChange={(e) => setCoach(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600">
                    Seat / Berth
                  </label>
                  <input
                    type="text"
                    value={seat}
                    onChange={(e) => setSeat(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600">
                    Cached PNR
                  </label>
                  <input
                    type="text"
                    value={pnr}
                    onChange={(e) => setPnr(e.target.value)}
                    placeholder="Optional"
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91..."
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded bg-slate-50 px-3 py-2 text-[11px] text-slate-600 border border-slate-200">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-slate-500" />
                  <span>
                    GPS:{' '}
                    {coords
                      ? `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`
                      : 'Location standby (Coach context cached)'}
                  </span>
                </span>
                <span className="font-mono text-emerald-700 font-semibold">
                  READY
                </span>
              </div>

              {/* Instant Category Bypass */}
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-800">
                  Instant Emergency Bypass (1-Tap Immediate Dispatch)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => void executeFastTrackSos('MED')}
                    className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-left text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
                  >
                    <HeartPulse className="h-4 w-4 text-red-700 shrink-0" />
                    <span>Medical Aid</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => void executeFastTrackSos('SEC')}
                    className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-left text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
                  >
                    <ShieldAlert className="h-4 w-4 text-red-700 shrink-0" />
                    <span>Assault / Women SOS</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => void executeFastTrackSos('FIRE')}
                    className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-left text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                  >
                    <Flame className="h-4 w-4 text-amber-700 shrink-0" />
                    <span>Fire / Smoke</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => void executeFastTrackSos('THEFT')}
                    className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-left text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
                    <span>Active Theft</span>
                  </button>
                </div>
              </div>

              {/* 2-Second Press & Hold General SOS */}
              <div>
                <button
                  type="button"
                  disabled={isSending}
                  onMouseDown={startHold}
                  onMouseUp={cancelHold}
                  onMouseLeave={cancelHold}
                  onTouchStart={startHold}
                  onTouchEnd={cancelHold}
                  className="relative w-full overflow-hidden rounded-md bg-red-700 py-3 text-xs font-bold text-white transition-colors hover:bg-red-800 disabled:opacity-60 select-none"
                >
                  <span
                    className="absolute inset-y-0 left-0 bg-red-900/60 transition-none"
                    style={{ width: `${holdProgress}%` }}
                  />
                  <span className="relative z-10 inline-flex items-center gap-2">
                    {isSending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Dispatching SOS...</span>
                      </>
                    ) : (
                      <>
                        <PhoneCall className="h-4 w-4" />
                        <span>
                          Hold 2 Seconds for General SOS (Prevents Pocket Dials)
                        </span>
                      </>
                    )}
                  </span>
                </button>
              </div>

              {errorMsg && (
                <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                  <p className="font-medium">{errorMsg}</p>
                  {offlineSmsFallback && (
                    <div className="mt-2 rounded bg-white p-2 border border-red-200 font-mono text-[11px] text-slate-900 break-all">
                      <span className="inline-flex items-center gap-1 font-sans font-semibold text-red-800 mb-1">
                        <MessageSquareWarning className="h-3.5 w-3.5" />
                        Offline Compressed SMS Gateway Payload (Send to 139):
                      </span>
                      <div>{offlineSmsFallback}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
