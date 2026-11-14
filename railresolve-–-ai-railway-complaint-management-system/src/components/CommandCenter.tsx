import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { motion } from 'motion/react';
import {
  ArrowUpRight,
  BookOpenCheck,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Globe2,
  HeartPulse,
  Loader2,
  Lock,
  Mic,
  MicOff,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Utensils,
  Volume2,
  Wind,
  Wrench,
  X,
} from 'lucide-react';
import { fetchComplaintByTicketId, submitAgentIntake } from '../lib/api';
import { loadMyTicketIds, saveMyTicketId } from '../lib/myTickets';
import {
  SCHEDULED_INDIAN_LANGUAGES,
  type AgentIntakeResponse,
  type AgentTraceStep,
  type ChatHistoryItem,
  type ComplaintRecord,
} from '../types/complaint';
import { EmergencyCallModal } from './EmergencyCallModal';
import { PriorityTag, StatusTag } from './StatusTag';

interface CommandCenterProps {
  onTrackTicket: (ticketId: string) => void;
  externalSosTicket?: ComplaintRecord | null;
}

interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imagePreviewUrl?: string;
  agentResult?: AgentIntakeResponse;
  error?: string;
}

const WELCOME_MESSAGE: ChatItem = {
  id: 'welcome',
  role: 'assistant',
  text: 'Namaste. I am RailResolve, your private Indian Railways AI Assistant. You can report an onboard issue by text, voice (across 22 Indian languages), or photo, or ask follow-up questions about railway rules, TDR refunds, and station support.',
};

const SAMPLE_SCENARIOS = [
  {
    label: 'AC not cooling in Coach B2 (PNR 4521890123)',
    tag: 'Electrical/AC',
  },
  {
    label: 'Elderly passenger chest pain in Coach A1',
    tag: 'Medical SOS',
  },
  {
    label: 'Washroom clogged & overflowing in S4',
    tag: 'Housekeeping',
  },
  {
    label: 'Stale food served in train 12627',
    tag: 'Catering',
  },
  {
    label: 'Harassment / Women Safety SOS in S3',
    tag: 'RPF Security',
  },
  {
    label: 'What are TDR refund rules if AC fails?',
    tag: 'Ask SOP',
  },
] as const;

const VOICE_FIRST_QUICK_ICONS = [
  {
    label: 'Medical',
    prompt: 'Urgent medical assistance needed in Coach ',
    icon: HeartPulse,
    tone: 'text-red-700 border-red-200 bg-red-50/90 hover:bg-red-100 hover:border-red-300',
  },
  {
    label: 'Security',
    prompt: 'Security / RPF help needed immediately in Coach ',
    icon: ShieldAlert,
    tone: 'text-rose-700 border-rose-200 bg-rose-50/90 hover:bg-rose-100 hover:border-rose-300',
  },
  {
    label: 'AC / Power',
    prompt: 'AC cooling or electrical socket failure in Coach ',
    icon: Wind,
    tone: 'text-amber-800 border-amber-200 bg-amber-50/90 hover:bg-amber-100 hover:border-amber-300',
  },
  {
    label: 'Washroom',
    prompt: 'Washroom cleaning / water supply needed in Coach ',
    icon: Sparkles,
    tone: 'text-teal-800 border-teal-200 bg-teal-50/90 hover:bg-teal-100 hover:border-teal-300',
  },
  {
    label: 'Food',
    prompt: 'Catering / food quality complaint on Train ',
    icon: Utensils,
    tone: 'text-orange-800 border-orange-200 bg-orange-50/90 hover:bg-orange-100 hover:border-orange-300',
  },
  {
    label: 'Berth / Door',
    prompt: 'Damaged seat berth or coach door issue in Coach ',
    icon: Wrench,
    tone: 'text-indigo-800 border-indigo-200 bg-indigo-50/90 hover:bg-indigo-100 hover:border-indigo-300',
  },
] as const;

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function CommandCenter({
  onTrackTicket,
  externalSosTicket,
}: CommandCenterProps) {
  // Only tickets created or tracked by THIS passenger on this device (strictly private & read-only)
  const [sessionTickets, setSessionTickets] = useState<ComplaintRecord[]>([]);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [quickTicketQuery, setQuickTicketQuery] = useState('');
  const [quickTicketError, setQuickTicketError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Multi-turn Chatbot State
  const [selectedLanguage, setSelectedLanguage] = useState<string>('auto');
  const [messages, setMessages] = useState<ChatItem[]>([WELCOME_MESSAGE]);
  const [inputMessage, setInputMessage] = useState('');
  const [pnrInput, setPnrInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<{
    base64: string;
    mimeType: string;
    previewUrl: string;
    fileName: string;
  } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [expandedTraces, setExpandedTraces] = useState<Record<string, boolean>>(
    {}
  );

  const [activeEmergencyCall, setActiveEmergencyCall] =
    useState<ComplaintRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const refreshMyTicketsStatus = useCallback(async (idsOverride?: string[]) => {
    const ids = idsOverride ?? loadMyTicketIds();
    if (ids.length === 0) return;

    setIsRefreshingStatus(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => fetchComplaintByTicketId(id))
      );
      const fresh: ComplaintRecord[] = [];
      for (const res of results) {
        if (res.status === 'fulfilled' && res.value) {
          fresh.push(res.value);
        }
      }
      if (fresh.length > 0) {
        setSessionTickets((prev) => {
          const merged = new Map<string, ComplaintRecord>();
          for (const item of fresh) {
            merged.set(item.ticket_id, item);
          }
          for (const item of prev) {
            if (!merged.has(item.ticket_id)) {
              merged.set(item.ticket_id, item);
            }
          }
          return Array.from(merged.values());
        });
      }
    } finally {
      setIsRefreshingStatus(false);
    }
  }, []);

  useEffect(() => {
    void refreshMyTicketsStatus();
  }, [refreshMyTicketsStatus]);

  // Periodically poll live status ONLY for this passenger's active open/in-progress tickets
  useEffect(() => {
    const hasPending = sessionTickets.some((t) => t.status !== 'Resolved');
    if (!hasPending) return;

    const timer = window.setInterval(() => {
      void refreshMyTicketsStatus();
    }, 15000);

    return () => window.clearInterval(timer);
  }, [sessionTickets, refreshMyTicketsStatus]);

  useEffect(() => {
    if (!externalSosTicket) return;
    saveMyTicketId(externalSosTicket.ticket_id);
    setSessionTickets((prev) => [
      externalSosTicket,
      ...prev.filter((c) => c.ticket_id !== externalSosTicket.ticket_id),
    ]);
    setActiveEmergencyCall(externalSosTicket);
  }, [externalSosTicket]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'railresolve_cached_journey',
        JSON.stringify({
          pnr: pnrInput.trim(),
          phone: phoneInput.trim(),
        })
      );
    } catch {
      // Ignore storage errors
    }
  }, [pnrInput, phoneInput]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  function handleImageSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setVoiceNote('Please select a valid image file (JPG, PNG, or WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      if (commaIdx === -1) return;
      const base64 = result.slice(commaIdx + 1);
      setSelectedImage({
        base64,
        mimeType: file.type,
        previewUrl: result,
        fileName: file.name,
      });
      setVoiceNote(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handleToggleVoice() {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      setVoiceNote(
        'Voice input is not supported in this browser. Please type your message or upload a photo.'
      );
      return;
    }

    const langObj = SCHEDULED_INDIAN_LANGUAGES.find(
      (l) => l.code === selectedLanguage
    );

    try {
      const rec = new SpeechRec();
      rec.lang = langObj?.speechLocale || 'en-IN';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setInputMessage((prev) =>
            prev.trim() ? `${prev.trim()} ${transcript}` : transcript
          );
        }
        setIsListening(false);
      };
      rec.onerror = () => {
        setIsListening(false);
        setVoiceNote(
          'Microphone capture could not complete. Check browser microphone permissions or type directly.'
        );
      };
      rec.onend = () => {
        setIsListening(false);
      };
      recognitionRef.current = rec;
      setVoiceNote(null);
      setIsListening(true);
      rec.start();
    } catch {
      setIsListening(false);
      setVoiceNote('Unable to start microphone capture.');
    }
  }

  function speakReplyText(text: string, langName?: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setVoiceNote('Audio playback is unavailable in this browser.');
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const matched = SCHEDULED_INDIAN_LANGUAGES.find(
        (l) =>
          l.name.toLowerCase() === (langName || '').toLowerCase() ||
          l.code === selectedLanguage
      );
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = matched?.speechLocale || 'en-IN';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      setVoiceNote('Unable to play audio reply.');
    }
  }

  async function handleCopyTicket(ticketId: string) {
    try {
      await navigator.clipboard.writeText(ticketId);
      setCopiedId(ticketId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Ignore clipboard failure
    }
  }

  function handleResetChat() {
    setMessages([WELCOME_MESSAGE]);
    setExpandedTraces({});
    setVoiceNote(null);
  }

  async function handleQuickTicketLookup(e: FormEvent) {
    e.preventDefault();
    const cleaned = quickTicketQuery.trim();
    if (!cleaned) {
      setQuickTicketError('Enter a Ticket ID (e.g. RR-261113-...)');
      return;
    }

    setQuickTicketError(null);
    setIsRefreshingStatus(true);
    try {
      const record = await fetchComplaintByTicketId(cleaned);
      saveMyTicketId(record.ticket_id);
      setSessionTickets((prev) => [
        record,
        ...prev.filter((c) => c.ticket_id !== record.ticket_id),
      ]);
      setQuickTicketQuery('');
    } catch (err) {
      setQuickTicketError(
        err instanceof Error ? err.message : 'Ticket not found.'
      );
    } finally {
      setIsRefreshingStatus(false);
    }
  }

  async function dispatchMessage(overrideText?: string) {
    const textToSend = (overrideText ?? inputMessage).trim();
    const imageToSend = selectedImage;

    if (!textToSend && !imageToSend) {
      setVoiceNote('Enter a message, speak via mic, or attach a photo.');
      return;
    }

    const historyForModel: ChatHistoryItem[] = messages
      .filter((m) => m.id !== 'welcome' && !m.error)
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        text: m.agentResult?.complaint
          ? `${m.text} [Ticket ${m.agentResult.complaint.ticket_id} · ${m.agentResult.complaint.department}]`
          : m.text,
      }));

    const userMsgId = `u-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: 'user',
        text:
          textToSend ||
          `Uploaded photo (${imageToSend?.fileName || 'image'}) for visual inspection`,
        imagePreviewUrl: imageToSend?.previewUrl,
      },
    ]);

    if (!overrideText) {
      setInputMessage('');
    }
    setSelectedImage(null);
    setVoiceNote(null);
    setIsSending(true);

    try {
      const result = await submitAgentIntake({
        message: textToSend,
        history: historyForModel,
        recentTicketIds: sessionTickets.map((t) => t.ticket_id),
        pnr_number: pnrInput.trim() || undefined,
        passenger_phone: phoneInput.trim() || undefined,
        preferredLanguage: selectedLanguage,
        imageBase64: imageToSend?.base64,
        imageMimeType: imageToSend?.mimeType,
      });

      const assistantMsgId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: 'assistant',
          text: result.reply,
          agentResult: result,
        },
      ]);

      if (result.complaint) {
        const createdTicket = result.complaint;
        saveMyTicketId(createdTicket.ticket_id);
        setExpandedTraces((prev) => ({ ...prev, [assistantMsgId]: true }));
        setSessionTickets((prev) => [
          createdTicket,
          ...prev.filter((c) => c.ticket_id !== createdTicket.ticket_id),
        ]);

        if (createdTicket.emergency_call || createdTicket.sos) {
          setActiveEmergencyCall(createdTicket);
        }
      } else {
        // If assistant checked status via tool, refresh sidebar status too
        void refreshMyTicketsStatus();
      }
    } catch (err) {
      const errMsg =
        err instanceof Error
          ? err.message
          : 'RailResolve failed to process the request.';
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: 'Unable to complete your request right now.',
          error: errMsg,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    void dispatchMessage();
  }

  function toggleTrace(msgId: string) {
    setExpandedTraces((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <EmergencyCallModal
        complaint={activeEmergencyCall}
        onClose={() => setActiveEmergencyCall(null)}
      />

      {/* Clean Page Title Header */}
      <div className="mb-7 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
          Passenger Support &amp; Grievance Assistant
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Chat in any of 22 Indian languages, attach a photo, or ask about
          railway rules. Your submitted complaints are routed privately to
          railway operations staff.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-12 items-start">
        {/* MAIN PANEL (8 Cols): Multi-Turn Gemini Chatbot */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-8 flex flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-md"
        >
          {/* Clean Chat Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-amber-400 bg-gradient-to-r from-[#0B1F3A] via-[#12315D] to-[#1A4278] px-5 py-3.5 text-white">
            <h2 className="text-sm font-semibold tracking-tight whitespace-nowrap">
              RailResolve AI Assistant
            </h2>

            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5">
                <Globe2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <select
                  aria-label="Select Passenger Language"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="max-w-[175px] rounded-md border border-white/20 bg-[#122D52] px-2.5 py-1 text-xs font-medium text-white focus:border-amber-400 focus:outline-none"
                >
                  {SCHEDULED_INDIAN_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.nativeLabel}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleResetChat}
                title="Start New Conversation"
                className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-[#122D52] px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-[#193C6D] hover:text-white whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3 w-3" />
                <span>New Chat</span>
              </button>
            </div>
          </div>

          {/* Voice-First Icon Bar + Quick Scenarios */}
          <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-3.5 space-y-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {VOICE_FIRST_QUICK_ICONS.map((q) => {
                const IconComp = q.icon;
                return (
                  <button
                    key={q.label}
                    type="button"
                    disabled={isSending}
                    onClick={() => {
                      setInputMessage(q.prompt);
                      inputRef.current?.focus();
                    }}
                    className={`flex flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 text-[11px] font-medium transition-colors ${q.tone}`}
                  >
                    <IconComp className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate max-w-full">{q.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-500 mr-1">
                Try asking:
              </span>
              {SAMPLE_SCENARIOS.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  disabled={isSending}
                  onClick={() => void dispatchMessage(sample.label)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-left text-[11px] font-medium text-slate-700 transition-colors hover:border-[#0B1F3A] hover:bg-slate-100 disabled:opacity-50"
                >
                  <span
                    className={`font-semibold ${
                      sample.tag.includes('SOS') ||
                      sample.tag.includes('Medical')
                        ? 'text-red-700'
                        : 'text-[#0B1F3A]'
                    }`}
                  >
                    {sample.tag}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="truncate max-w-[200px]">{sample.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Multi-Turn Conversation Thread */}
          <div
            aria-live="polite"
            className="flex-1 space-y-4 overflow-y-auto p-5 min-h-[380px] max-h-[520px] bg-slate-50/40"
          >
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const res = msg.agentResult;
              const createdTicket = res?.complaint || null;
              const isTraceOpen = Boolean(expandedTraces[msg.id]);

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className={`flex flex-col ${
                    isUser ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[88%] rounded-xl px-4 py-3 text-sm shadow-xs ${
                      isUser
                        ? 'bg-gradient-to-br from-[#0B1F3A] to-[#173D72] text-white'
                        : msg.error
                          ? 'border border-red-200 bg-red-50 text-red-900'
                          : 'border border-slate-200 bg-white text-slate-800'
                    }`}
                  >
                    {msg.imagePreviewUrl && (
                      <img
                        src={msg.imagePreviewUrl}
                        alt="Uploaded railway grievance"
                        referrerPolicy="no-referrer"
                        className="mb-2.5 max-h-44 w-auto rounded-md border border-white/20 object-cover"
                      />
                    )}

                    <p className="whitespace-pre-wrap leading-relaxed text-[13.5px]">
                      {msg.text}
                    </p>

                    {!isUser && !msg.error && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            speakReplyText(msg.text, res?.detectedLanguage)
                          }
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Volume2 className="h-3 w-3 text-[#0B1F3A]" />
                          <span>Listen</span>
                        </button>
                        {res?.detectedLanguage && (
                          <span className="text-[11px] text-slate-500">
                            {res.detectedLanguage}
                          </span>
                        )}
                      </div>
                    )}

                    {msg.error && (
                      <p className="mt-1.5 text-xs font-medium text-red-700">
                        {msg.error}
                      </p>
                    )}

                    {/* Ticket Summary + Autonomous Trace (only when this turn registered a new ticket) */}
                    {res && createdTicket && (
                      <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onTrackTicket(createdTicket.ticket_id)
                            }
                            className="inline-flex items-center gap-1 font-mono font-semibold text-[#0B1F3A] hover:underline"
                          >
                            <span>{createdTicket.ticket_id}</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>
                          <div className="flex items-center gap-1.5">
                            <PriorityTag priority={createdTicket.urgency} />
                            <StatusTag status={createdTicket.status} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                          <div>
                            <span className="text-slate-400">Dept:</span>{' '}
                            <span className="font-semibold text-slate-800">
                              {createdTicket.department}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Coach:</span>{' '}
                            <span className="font-mono font-semibold text-slate-800">
                              {createdTicket.coach}
                            </span>
                          </div>
                          {res.liveTrainInfo && (
                            <>
                              <div>
                                <span className="text-slate-400">
                                  Next Halt:
                                </span>{' '}
                                <span className="font-medium text-slate-800">
                                  {res.liveTrainInfo.nextStation}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400">ETA:</span>{' '}
                                <span className="font-mono font-semibold text-slate-800">
                                  {res.liveTrainInfo.etaMinutes} mins
                                </span>
                              </div>
                            </>
                          )}
                        </div>

                        {res.sopReference && (
                          <div className="flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-[11px] text-amber-950">
                            <BookOpenCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                            <span>SOP Grounded: {res.sopReference}</span>
                          </div>
                        )}

                        {(createdTicket.sos ||
                          createdTicket.emergency_call) && (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-red-200 bg-red-50 px-2.5 py-2 text-red-900">
                            <span className="inline-flex items-center gap-1.5 font-semibold">
                              <ShieldAlert className="h-3.5 w-3.5 text-red-700" />
                              SOS &amp; Emergency Call Active
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setActiveEmergencyCall(createdTicket)
                              }
                              className="inline-flex items-center gap-1 rounded bg-red-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-800"
                            >
                              <PhoneCall className="h-3 w-3" />
                              <span>Open Call Screen</span>
                            </button>
                          </div>
                        )}

                        {res.trace.length > 0 && (
                          <div className="rounded border border-slate-200 bg-slate-50">
                            <button
                              type="button"
                              onClick={() => toggleTrace(msg.id)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold text-slate-800 hover:bg-slate-100"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                                <span>Autonomous Agent Workflow</span>
                                <span className="font-mono font-normal text-slate-500">
                                  ({(res.triageMs / 1000).toFixed(2)}s)
                                </span>
                              </span>
                              {isTraceOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                              )}
                            </button>

                            {isTraceOpen && (
                              <div className="space-y-2 border-t border-slate-200 px-3 py-2.5">
                                {res.trace.map((step: AgentTraceStep) => (
                                  <div
                                    key={step.step}
                                    className="text-[11px] leading-snug"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-semibold text-slate-900">
                                        [{step.step}. {step.title}]
                                      </span>
                                      <span
                                        className={`font-mono text-[10px] font-semibold ${
                                          step.status === 'alert'
                                            ? 'text-red-700'
                                            : step.status === 'bypassed'
                                              ? 'text-amber-700'
                                              : 'text-emerald-700'
                                        }`}
                                      >
                                        {step.status === 'alert'
                                          ? 'SOS ESCALATED'
                                          : step.status === 'bypassed'
                                            ? 'PNR BYPASSED'
                                            : 'DONE'}
                                      </span>
                                    </div>
                                    <p className="mt-0.5 text-slate-600">
                                      {step.detail}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}

            {isSending && (
              <div className="flex items-start">
                <div className="inline-flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-700">
                  <Loader2 className="h-4 w-4 animate-spin text-[#0B1F3A]" />
                  <span>RailResolve is thinking and checking railway SOPs...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Multimodal Composer */}
          <form
            onSubmit={handleFormSubmit}
            className="border-t border-slate-200 bg-white p-4 space-y-3"
          >
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                aria-label="PNR Number (Optional)"
                value={pnrInput}
                onChange={(e) => setPnrInput(e.target.value)}
                placeholder="PNR (optional, e.g. 4521890123)"
                disabled={isSending}
                className="rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-[#0B1F3A] focus:outline-none"
              />
              <input
                type="text"
                aria-label="Passenger Phone (Optional)"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="Phone (optional, e.g. +91 98...)"
                disabled={isSending}
                className="rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-[#0B1F3A] focus:outline-none"
              />
            </div>

            {selectedImage && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={selectedImage.previewUrl}
                    alt="Selected grievance attachment"
                    className="h-10 w-10 rounded object-cover border border-slate-300 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-800">
                      {selectedImage.fileName}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Ready for Gemini Vision inspection
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                  aria-label="Remove attached photo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {voiceNote && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                {voiceNote}
              </p>
            )}

            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending}
                title="Upload Photo for Gemini Vision"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 shrink-0"
              >
                <Camera className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleToggleVoice}
                disabled={isSending}
                title="Voice Grievance Input"
                className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition-colors disabled:opacity-50 shrink-0 ${
                  isListening
                    ? 'border-red-600 bg-red-50 text-red-700'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {isListening ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>

              <textarea
                ref={inputRef}
                rows={2}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void dispatchMessage();
                  }
                }}
                placeholder={
                  isListening
                    ? 'Listening... speak in any Indian language'
                    : 'Describe an issue, ask a question, or upload a photo...'
                }
                disabled={isSending}
                className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]/15"
              />

              <button
                type="submit"
                disabled={isSending}
                className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[#0B1F3A] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#14345E] disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {isSending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span>Send</span>
              </button>
            </div>
          </form>
        </motion.section>

        {/* RIGHT SIDEBAR (4 Cols): Private Passenger Tickets & Safety Guide */}
        <motion.aside
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-4 space-y-5"
        >
          {/* Your Complaint Status (Only this passenger's own tickets, strictly read-only) */}
          <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-md">
            <div className="flex items-center justify-between border-b-2 border-amber-400 bg-gradient-to-r from-[#0B1F3A] to-[#163868] px-5 py-3.5 text-white">
              <div className="flex items-center gap-2">
                <Lock
                  className="h-3.5 w-3.5 text-amber-400 shrink-0"
                  aria-hidden="true"
                />
                <h2 className="text-sm font-semibold text-white">
                  Your Complaint Status
                </h2>
              </div>
              {sessionTickets.length > 0 && (
                <button
                  type="button"
                  onClick={() => void refreshMyTicketsStatus()}
                  disabled={isRefreshingStatus}
                  className="inline-flex items-center gap-1 rounded border border-white/20 bg-white/10 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${isRefreshingStatus ? 'animate-spin' : ''}`}
                  />
                  <span>Refresh</span>
                </button>
              )}
            </div>

            {/* Inline Quick Ticket Lookup */}
            <form
              onSubmit={handleQuickTicketLookup}
              className="border-b border-slate-100 bg-slate-50/70 px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    aria-label="Check Ticket ID status"
                    value={quickTicketQuery}
                    onChange={(e) => setQuickTicketQuery(e.target.value)}
                    placeholder="Check Ticket ID (e.g. RR-...)"
                    className="block w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2.5 font-mono text-xs text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-[#0B1F3A] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isRefreshingStatus}
                  className="rounded-md bg-[#0B1F3A] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#14345E] disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  Check
                </button>
              </div>
              {quickTicketError && (
                <p className="mt-1.5 text-[11px] text-red-700">
                  {quickTicketError}
                </p>
              )}
            </form>

            {sessionTickets.length === 0 ? (
              <div className="p-5 text-xs leading-relaxed text-slate-600">
                <p className="font-medium text-slate-800">
                  No personal tickets tracked yet
                </p>
                <p className="mt-1">
                  When you submit a grievance, your private Ticket ID and live
                  resolution progress (Open → In Progress → Resolved) will update
                  automatically here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 max-h-[420px] overflow-y-auto">
                {sessionTickets.map((ticket) => {
                  const stage =
                    ticket.status === 'Resolved'
                      ? 3
                      : ticket.status === 'In Progress'
                        ? 2
                        : 1;
                  return (
                    <div key={ticket.ticket_id} className="p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                          {ticket.ticket_id}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <PriorityTag priority={ticket.urgency} />
                          <StatusTag status={ticket.status} />
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 line-clamp-2">
                        {ticket.description}
                      </p>

                      {/* Read-Only 3-Stage Status Progress */}
                      <div className="grid grid-cols-3 gap-1.5 pt-0.5 text-[10px] font-medium">
                        <div
                          className={`rounded border px-2 py-1 text-center ${
                            stage >= 1
                              ? 'border-amber-300 bg-amber-50 text-amber-900'
                              : 'border-slate-200 bg-slate-50 text-slate-400'
                          }`}
                        >
                          1. Open
                        </div>
                        <div
                          className={`rounded border px-2 py-1 text-center ${
                            stage >= 2
                              ? 'border-blue-300 bg-blue-50 text-blue-900'
                              : 'border-slate-200 bg-slate-50 text-slate-400'
                          }`}
                        >
                          2. In Progress
                        </div>
                        <div
                          className={`rounded border px-2 py-1 text-center ${
                            stage >= 3
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                              : 'border-slate-200 bg-slate-50 text-slate-400'
                          }`}
                        >
                          3. Resolved
                        </div>
                      </div>

                      {ticket.resolution_notes && (
                        <div className="rounded border border-emerald-200 bg-emerald-50/70 px-2.5 py-2 text-[11px] text-emerald-950">
                          <span className="font-semibold">Staff Update: </span>
                          <span>{ticket.resolution_notes}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
                        <span className="truncate">{ticket.department}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopyTicket(ticket.ticket_id)}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                          >
                            {copiedId === ticket.ticket_id ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-600" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onTrackTicket(ticket.ticket_id)}
                            className="inline-flex items-center gap-1 rounded bg-[#0B1F3A] px-2.5 py-1 font-semibold text-white hover:bg-[#14345E]"
                          >
                            <span>Details</span>
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Emergency & Helpline Card */}
          <div className="rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50/70 to-amber-50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-orange-700" />
              <div>
                <h3 className="text-sm font-semibold text-amber-950">
                  24×7 Emergency &amp; Helpline
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-amber-900">
                  For active medical emergencies, fire, or security threats, use
                  the floating <strong>SOS EMERGENCY</strong> button or call
                  Indian Railways directly:
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-amber-300 bg-white px-3 py-2 shadow-xs">
                    <p className="text-[11px] text-slate-500">RailMadad</p>
                    <p className="font-mono text-base font-bold text-[#0B1F3A]">
                      139
                    </p>
                  </div>
                  <div className="rounded-md border border-red-200 bg-white px-3 py-2 shadow-xs">
                    <p className="text-[11px] text-slate-500">RPF Security</p>
                    <p className="font-mono text-base font-bold text-red-700">
                      182
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Privacy & Capabilities Summary */}
          <div className="rounded-xl border border-indigo-200/80 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-[#0B1F3A]">
              Confidential Passenger Triage
            </h3>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
                <span>
                  <span className="font-semibold text-slate-800">
                    Private Routing:
                  </span>{' '}
                  Your complaint details and contact info are visible only to
                  authorized Railway Control staff.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                <span>
                  <span className="font-semibold text-slate-800">
                    22 Indian Languages:
                  </span>{' '}
                  Speak or type naturally in your preferred regional language.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#0B1F3A] shrink-0" />
                <span>
                  <span className="font-semibold text-slate-800">
                    Photo Inspection:
                  </span>{' '}
                  Upload an image for automatic damage, hygiene, or hazard
                  assessment.
                </span>
              </li>
            </ul>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}
