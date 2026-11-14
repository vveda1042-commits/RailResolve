import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type Content,
  type FunctionDeclaration,
  type Part,
} from '@google/genai';
import crypto from 'node:crypto';
import {
  COMPLAINT_CATEGORIES,
  SCHEDULED_INDIAN_LANGUAGES,
  type AgentIntakeResponse,
  type AgentTraceStep,
  type ChatHistoryItem,
  type ComplaintCategory,
  type ComplaintRecord,
  type ComplaintUrgency,
} from '../src/types/complaint.ts';
import {
  getComplaintByTicketId,
  insertComplaintRow,
} from './complaintsStore.ts';
import { retrieveRelevantSops } from './railwaySops.ts';
import { ServiceConfigError } from './supabase.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new ServiceConfigError(
      'Gemini API key is not configured. Please add GEMINI_API_KEY in Settings > Secrets.',
      503
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function generateTicketId(prefix = 'RR'): string {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  const bytes = crypto.randomBytes(5);
  for (let i = 0; i < 5; i++) {
    suffix += alphabet[bytes[i] % alphabet.length];
  }
  return `${prefix}-${yy}${mm}${dd}-${suffix}`;
}

interface LiveTrainLookupResult {
  trainNumber: string;
  trainName: string;
  nextStation: string;
  etaMinutes: number;
  runningStatus: string;
  availableUnits: string[];
}

export function simulateLiveTrainLookup(params: {
  pnr_number?: string;
  train_number?: string;
  is_critical?: boolean;
}): LiveTrainLookupResult {
  const pnr = (params.pnr_number || '').trim();
  const train = (params.train_number || '').trim();
  const isCritical = Boolean(params.is_critical);

  if (train.includes('12627') || pnr.startsWith('6')) {
    return {
      trainNumber: '12627',
      trainName: 'Karnataka Express',
      nextStation: 'Bhopal Jn (BPL)',
      etaMinutes: isCritical ? 8 : 22,
      runningStatus: 'Running on time · 94 km/h near Bina-Bhopal section',
      availableUnits: [
        'RPF Post BPL',
        'Divisional Railway Hospital Unit',
        'IRCTC Base Kitchen',
      ],
    };
  }

  if (train.includes('12002') || pnr.startsWith('7')) {
    return {
      trainNumber: '12002',
      trainName: 'Bhopal Shatabdi Express',
      nextStation: 'VGL Jhansi Jn (VGLJ)',
      etaMinutes: isCritical ? 7 : 19,
      runningStatus: 'On schedule · Platform 2 assigned at next halt',
      availableUnits: [
        'RPF Quick Response Team',
        'Station Medical Booth',
        'OBHS Cleaning Squad',
      ],
    };
  }

  if (pnr === '4521890123' || train.includes('12951')) {
    return {
      trainNumber: '12951',
      trainName: 'Mumbai Central – New Delhi Rajdhani Express',
      nextStation: 'Vadodara Jn (BRC)',
      etaMinutes: isCritical ? 6 : 16,
      runningStatus: 'Running on time · Approaching Vadodara Division',
      availableUnits: [
        'Electrical & HVAC Squad',
        'RPF Escort Team',
        'Station Medical Unit',
      ],
    };
  }

  return {
    trainNumber: train || '12951',
    trainName: train
      ? `Indian Railways Train ${train}`
      : 'Mumbai Rajdhani Express',
    nextStation: 'Nagpur Jn (NGP)',
    etaMinutes: isCritical ? 7 : 18,
    runningStatus: 'Live NTES telemetry active · Next major junction confirmed',
    availableUnits: [
      'RPF Control',
      'Railway Medical Team',
      'Carriage & Electrical Desk',
    ],
  };
}

function normalizeCategory(raw: unknown): ComplaintCategory {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const matched = COMPLAINT_CATEGORIES.find(
      (cat) => cat.toLowerCase() === trimmed.toLowerCase()
    );
    if (matched) return matched;
  }
  return 'Other';
}

function normalizeUrgency(raw: unknown, sos: boolean): ComplaintUrgency {
  if (sos) return 'CRITICAL';
  if (typeof raw === 'string') {
    const u = raw.trim().toUpperCase();
    if (u === 'CRITICAL') return 'CRITICAL';
    if (u === 'HIGH') return 'HIGH';
  }
  return 'NORMAL';
}

function mapUrgencyToPriority(urgency: ComplaintUrgency): string {
  if (urgency === 'CRITICAL') return 'Critical';
  if (urgency === 'HIGH') return 'High';
  return 'Medium';
}

const lookupTrainTool: FunctionDeclaration = {
  name: 'lookupLiveTrainAndNextStation',
  description:
    'Look up live train running telemetry, upcoming major junction station, and ETA for a passenger complaint or emergency.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      pnr_number: {
        type: Type.STRING,
        description: '10-digit Indian Railways PNR number if provided.',
      },
      train_number: {
        type: Type.STRING,
        description: '5-digit train number or train name if mentioned.',
      },
      is_critical: {
        type: Type.BOOLEAN,
        description:
          'True if this is a Medical Emergency, Women Safety SOS, Fire/Hazard, or active Theft requiring priority station halt.',
      },
    },
  },
};

const dispatchComplaintTool: FunctionDeclaration = {
  name: 'dispatchAndSaveComplaint',
  description:
    'Register and dispatch a NEW railway complaint or emergency alert to Supabase. Call ONLY when the passenger is reporting an actual issue, grievance, or emergency (or uploading a photo of an issue)—do NOT call for general policy/rule Q&A or greetings.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      detected_language: {
        type: Type.STRING,
        description:
          'Detected language name from the 22 Scheduled Indian Languages or English.',
      },
      pnr_number: {
        type: Type.STRING,
        description: 'Extracted 10-digit PNR number, or "Not provided".',
      },
      train_number: {
        type: Type.STRING,
        description: 'Train number or name from intake or lookup.',
      },
      coach: {
        type: Type.STRING,
        description: 'Coach identifier such as A1, B2, S4, S3, or "General".',
      },
      seat_number: {
        type: Type.STRING,
        description: 'Seat or berth number if mentioned, otherwise "Unassigned".',
      },
      passenger_name: {
        type: Type.STRING,
        description: 'Passenger name if mentioned, otherwise "Passenger".',
      },
      passenger_phone: {
        type: Type.STRING,
        description:
          'Passenger phone number if provided, otherwise "Not provided".',
      },
      category: {
        type: Type.STRING,
        description:
          'One of: Cleanliness, Train Delay, Electrical, Water Supply, Food Quality, Staff Behaviour, Security, Ticketing, Coach Maintenance, Other.',
      },
      department: {
        type: Type.STRING,
        description:
          'Must be one of: Security/SOS, Medical, Electrical/AC, Housekeeping, Catering, Coach Maintenance, Ticketing.',
      },
      urgency: {
        type: Type.STRING,
        description: 'Must be strictly one of: CRITICAL, HIGH, NORMAL.',
      },
      description: {
        type: Type.STRING,
        description:
          'Standardized English grievance summary for railway control officers, incorporating text, translated Indic/Hinglish intent, and visual photo findings.',
      },
      emergency_call: {
        type: Type.BOOLEAN,
        description:
          'True ONLY for critical emergencies (Medical Emergency, Fire/Hazard, Theft in progress, or Women Safety/Harassment SOS).',
      },
      sos: {
        type: Type.BOOLEAN,
        description:
          'True ONLY for critical safety, security, or medical emergencies requiring immediate human RPF/Medical intervention.',
      },
      next_station: {
        type: Type.STRING,
        description: 'Upcoming junction station from train lookup.',
      },
      eta_minutes: {
        type: Type.NUMBER,
        description: 'Estimated minutes to next station.',
      },
      ai_reasoning: {
        type: Type.STRING,
        description: 'Concise 1-2 sentence triage justification.',
      },
      recommended_action: {
        type: Type.STRING,
        description:
          'Immediate operational action grounded in Indian Railways SOPs.',
      },
    },
    required: [
      'department',
      'urgency',
      'description',
      'emergency_call',
      'sos',
      'category',
      'ai_reasoning',
      'recommended_action',
    ],
  },
};

const checkComplaintStatusTool: FunctionDeclaration = {
  name: 'checkComplaintStatus',
  description:
    'Look up the current live status (Open, In Progress, Resolved), assigned department, and staff resolution notes for a specific RailResolve Ticket ID belonging to the current passenger.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      ticket_id: {
        type: Type.STRING,
        description: 'The RailResolve Ticket ID (e.g., RR-261113-A7K9C).',
      },
    },
    required: ['ticket_id'],
  },
};

export async function runRailResolveAgent(input: {
  message: string;
  history?: ChatHistoryItem[];
  recentTicketIds?: string[];
  pnr_number?: string;
  passenger_phone?: string;
  preferredLanguage?: string;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<AgentIntakeResponse> {
  const startedAt = Date.now();
  const ai = getGeminiClient();

  const cleanMessage = (input.message || '').trim();
  const hasImage = Boolean(input.imageBase64 && input.imageMimeType);

  if (!cleanMessage && !hasImage) {
    throw new ServiceConfigError(
      'Please describe your railway issue, ask a question, or upload a photo for RailResolve inspection.',
      400
    );
  }

  const langEntry = SCHEDULED_INDIAN_LANGUAGES.find(
    (l) => l.code === input.preferredLanguage
  );
  const targetLangName =
    langEntry && langEntry.code !== 'auto' ? langEntry.name : 'Auto-Detect';

  const matchedSops = retrieveRelevantSops(cleanMessage);
  const sopContextText = matchedSops
    .map((s) => `[${s.id} - ${s.title}]: ${s.guidance}`)
    .join('\n');

  const ownTickets = Array.isArray(input.recentTicketIds)
    ? input.recentTicketIds
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .slice(0, 5)
    : [];

  const ownTicketsLine =
    ownTickets.length > 0
      ? `Passenger's own session Ticket IDs: ${ownTickets.join(', ')}`
      : 'Passenger has no session Ticket IDs stored yet.';

  const systemInstruction = `You are RailResolve, a helpful, multi-turn Indian Railways Passenger AI Assistant & Autonomous Triage Agent.

Your Role & Multi-Turn Behavior:
1. Multilingual Support (All 22 Scheduled Indian Languages + English/Hinglish):
   - Understand and respond naturally in any of the 22 scheduled Indian languages or Hinglish/Tanglish.
   - Target response language preference: ${targetLangName}. If "Auto-Detect", reply in the same language/script the passenger used.
2. Conversational Q&A, Status Checks vs. Filing a New Complaint:
   - If the passenger asks about the status of their complaint (e.g. "What is the status of my ticket?", "Is my issue resolved?") or gives a Ticket ID, call checkComplaintStatus (using the Ticket ID they mentioned or their own session Ticket ID below) and report the live status (Open, In Progress, or Resolved), department, and any staff resolution notes WITHOUT creating a new complaint.
   - ${ownTicketsLine}
   - If the passenger asks a general question (e.g., TDR refund rules, Helpline 139, luggage rules), answer clearly using the SOP knowledge below WITHOUT calling dispatchAndSaveComplaint.
   - If the passenger is reporting a NEW railway problem, service failure, safety/medical emergency, or uploading an issue photo:
     a) Call lookupLiveTrainAndNextStation (set is_critical=true for Medical, Fire, Theft, Harassment/Women Safety SOS).
     b) Call dispatchAndSaveComplaint with standardized English description for railway staff, accurate department ("Security/SOS", "Medical", "Electrical/AC", "Housekeeping", "Catering", "Coach Maintenance", "Ticketing"), urgency ("CRITICAL", "HIGH", "NORMAL"), and emergency_call/sos booleans.
     c) Reply warmly with the generated Ticket ID, assigned department, next station & ETA, and immediate practical SOP steps.
3. Grounded Indian Railways SOPs:
   ${sopContextText}
4. Strict Privacy & Read-Only Status Rule:
   - Never share or look up other passengers' complaints. Only check Ticket IDs belonging to this passenger's session or explicitly provided by this passenger.
   - Passengers cannot edit or change complaint statuses; only Railway Control Admins can update statuses.`;

  // Build multi-turn conversation history
  const contents: Content[] = [];
  if (Array.isArray(input.history)) {
    for (const turn of input.history.slice(-10)) {
      if (turn && typeof turn.text === 'string' && turn.text.trim()) {
        contents.push({
          role: turn.role === 'model' ? 'model' : 'user',
          parts: [{ text: turn.text.trim() }],
        });
      }
    }
  }

  const contextLines: string[] = [];
  if (input.pnr_number?.trim()) {
    contextLines.push(`Passenger-supplied PNR: ${input.pnr_number.trim()}`);
  }
  if (input.passenger_phone?.trim()) {
    contextLines.push(
      `Passenger-supplied Phone: ${input.passenger_phone.trim()}`
    );
  }
  contextLines.push(
    cleanMessage ||
      'Please inspect the attached photo and triage this railway issue.'
  );
  if (hasImage) {
    contextLines.push(
      'An onboard photo is attached. Inspect the photo visually and include concrete visual findings.'
    );
  }

  const userParts: Part[] = [];
  if (hasImage && input.imageBase64 && input.imageMimeType) {
    userParts.push({
      inlineData: {
        mimeType: input.imageMimeType,
        data: input.imageBase64,
      },
    });
  }
  userParts.push({ text: contextLines.join('\n') });
  contents.push({ role: 'user', parts: userParts });

  let liveTrainInfo: LiveTrainLookupResult | null = null;
  let savedComplaint: ComplaintRecord | null = null;
  let detectedLanguage =
    targetLangName === 'Auto-Detect' ? 'English' : targetLangName;
  let finalReply = '';
  let lookupDurationMs = 0;
  let dispatchDurationMs = 0;

  try {
    for (let turn = 0; turn < 5; turn++) {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          tools: [
            {
              functionDeclarations: [
                lookupTrainTool,
                dispatchComplaintTool,
                checkComplaintStatusTool,
              ],
            },
          ],
        },
      });

      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) {
        contents.push(modelContent);
      }

      const calls = response.functionCalls;
      if (!calls || calls.length === 0) {
        finalReply = (response.text || '').trim();
        break;
      }

      const functionResponseParts: Part[] = [];

      for (const call of calls) {
        const args = (call.args || {}) as Record<string, unknown>;

        if (call.name === 'lookupLiveTrainAndNextStation') {
          const t0 = Date.now();
          liveTrainInfo = simulateLiveTrainLookup({
            pnr_number:
              typeof args.pnr_number === 'string'
                ? args.pnr_number
                : input.pnr_number,
            train_number:
              typeof args.train_number === 'string'
                ? args.train_number
                : undefined,
            is_critical: Boolean(args.is_critical),
          });
          lookupDurationMs = Date.now() - t0;

          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: { result: liveTrainInfo },
            },
          });
        } else if (call.name === 'dispatchAndSaveComplaint') {
          const t0 = Date.now();
          if (
            typeof args.detected_language === 'string' &&
            args.detected_language.trim()
          ) {
            detectedLanguage = args.detected_language.trim();
          }

          const trainFallback: LiveTrainLookupResult =
            liveTrainInfo ||
            simulateLiveTrainLookup({
              pnr_number: input.pnr_number,
              is_critical: Boolean(args.sos),
            });
          liveTrainInfo = trainFallback;

          const ticketId = generateTicketId();
          const sos = Boolean(args.sos);
          const emergencyCall = Boolean(args.emergency_call) || sos;
          const urgency = normalizeUrgency(args.urgency, sos);
          const category = normalizeCategory(args.category);
          const department =
            typeof args.department === 'string' && args.department.trim()
              ? args.department.trim()
              : sos
                ? 'Security/SOS'
                : 'Housekeeping';

          const pnrVal =
            typeof args.pnr_number === 'string' &&
            args.pnr_number.trim() &&
            args.pnr_number.trim().toLowerCase() !== 'not provided'
              ? args.pnr_number.trim()
              : input.pnr_number?.trim() || 'PNR-BYPASSED';

          const phoneVal =
            typeof args.passenger_phone === 'string' &&
            args.passenger_phone.trim() &&
            args.passenger_phone.trim().toLowerCase() !== 'not provided'
              ? args.passenger_phone.trim()
              : input.passenger_phone?.trim() || 'Not provided';

          const coachVal =
            typeof args.coach === 'string' && args.coach.trim()
              ? args.coach.trim().toUpperCase()
              : 'General';

          const seatVal =
            typeof args.seat_number === 'string' && args.seat_number.trim()
              ? args.seat_number.trim()
              : 'Unassigned';

          const trainVal =
            typeof args.train_number === 'string' && args.train_number.trim()
              ? args.train_number.trim()
              : `${trainFallback.trainNumber} ${trainFallback.trainName}`;

          const nextStationVal =
            typeof args.next_station === 'string' && args.next_station.trim()
              ? args.next_station.trim()
              : trainFallback.nextStation;

          const etaVal =
            typeof args.eta_minutes === 'number'
              ? args.eta_minutes
              : trainFallback.etaMinutes;

          savedComplaint = await insertComplaintRow({
            ticket_id: ticketId,
            pnr_number: pnrVal,
            passenger_name:
              typeof args.passenger_name === 'string' &&
              args.passenger_name.trim()
                ? args.passenger_name.trim()
                : 'Passenger',
            passenger_phone: phoneVal,
            train_number: trainVal,
            coach: coachVal,
            seat_number: seatVal,
            category,
            department,
            urgency,
            priority: mapUrgencyToPriority(urgency),
            status: 'Open',
            description:
              typeof args.description === 'string' && args.description.trim()
                ? args.description.trim()
                : cleanMessage || 'Photo-reported railway grievance',
            emergency_call: emergencyCall,
            sos,
            ai_reasoning:
              typeof args.ai_reasoning === 'string'
                ? args.ai_reasoning.trim()
                : null,
            recommended_action:
              typeof args.recommended_action === 'string'
                ? args.recommended_action.trim()
                : null,
            resolution_notes: null,
            next_station: nextStationVal,
            eta_minutes: etaVal,
          });

          dispatchDurationMs = Date.now() - t0;

          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: {
                result: {
                  saved: true,
                  ticket_id: savedComplaint.ticket_id,
                  status: savedComplaint.status,
                  department: savedComplaint.department,
                  urgency: savedComplaint.urgency,
                  emergency_call: savedComplaint.emergency_call,
                  sos: savedComplaint.sos,
                },
              },
            },
          });
        } else if (call.name === 'checkComplaintStatus') {
          const requestedId =
            typeof args.ticket_id === 'string' ? args.ticket_id.trim() : '';
          const found = requestedId
            ? await getComplaintByTicketId(requestedId)
            : null;

          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: {
                result: found
                  ? {
                      found: true,
                      ticket_id: found.ticket_id,
                      status: found.status,
                      department: found.department,
                      category: found.category,
                      priority: found.priority,
                      resolution_notes: found.resolution_notes,
                      updated_at: found.updated_at,
                    }
                  : {
                      found: false,
                      message: `No ticket found with ID "${requestedId}".`,
                    },
              },
            },
          });
        }
      }

      if (functionResponseParts.length > 0) {
        contents.push({ role: 'user', parts: functionResponseParts });
      }
    }

    const totalMs = Date.now() - startedAt;
    const sopRef = matchedSops.map((s) => `${s.id} (${s.title})`).join(' · ');

    if (!finalReply && savedComplaint && liveTrainInfo) {
      finalReply = savedComplaint.sos
        ? `EMERGENCY DISPATCH ACTIVATED (${savedComplaint.ticket_id}): Priority ${savedComplaint.department} alert logged for Coach ${savedComplaint.coach}. ${matchedSops[0]?.guidance || ''} RPF & Medical units at ${liveTrainInfo.nextStation} (ETA ${liveTrainInfo.etaMinutes} mins) alerted.`
        : `Ticket ${savedComplaint.ticket_id} logged with ${savedComplaint.department} (${savedComplaint.urgency} urgency). Next major station: ${liveTrainInfo.nextStation} in ~${liveTrainInfo.etaMinutes} mins.`;
    }

    if (!finalReply) {
      finalReply =
        'I am here to assist with your Indian Railways journey. Please share your coach or issue details if you would like me to file a complaint, or ask any question about railway rules and assistance.';
    }

    const trace: AgentTraceStep[] = savedComplaint
      ? [
          {
            step: 1,
            title: 'Multimodal & 22-Language Intent Analysis',
            status: savedComplaint.sos ? 'alert' : 'completed',
            detail: `${hasImage ? 'Text + Vision inspection' : 'Indic/NLP intent extraction'} (${detectedLanguage}) → ${savedComplaint.department} (${savedComplaint.urgency}).`,
            durationMs: Math.max(120, Math.round(totalMs * 0.45)),
          },
          {
            step: 2,
            title: 'Live Train, Station & SOP Lookup',
            status: savedComplaint.sos ? 'bypassed' : 'completed',
            detail: savedComplaint.sos
              ? `PNR wait bypassed for SOS. Grounded in ${matchedSops[0]?.id || 'SOP-01'} → ${liveTrainInfo?.nextStation || 'Next Junction'} (ETA ${liveTrainInfo?.etaMinutes || 8} mins).`
              : `Train ${liveTrainInfo?.trainNumber || 'IR'} · ${liveTrainInfo?.nextStation || 'Next Junction'} (${liveTrainInfo?.etaMinutes || 18} mins) · Applied ${matchedSops[0]?.id || 'Railway SOP'}.`,
            durationMs: Math.max(18, lookupDurationMs),
          },
          {
            step: 3,
            title: 'Cross-Department Routing',
            status: savedComplaint.emergency_call ? 'alert' : 'completed',
            detail: savedComplaint.emergency_call
              ? `Routed to ${savedComplaint.department} with sos=true and emergency_call=true.`
              : `Assigned to ${savedComplaint.department} (${savedComplaint.category}).`,
            durationMs: Math.max(25, Math.round(totalMs * 0.2)),
          },
          {
            step: 4,
            title: 'Supabase Cloud Sync & Dispatch',
            status: 'completed',
            detail: `Synced row ${savedComplaint.ticket_id} to public.complaints in Supabase.`,
            durationMs: Math.max(45, dispatchDurationMs),
          },
        ]
      : [];

    return {
      complaint: savedComplaint
        ? {
            ...savedComplaint,
            triage_ms: totalMs,
          }
        : null,
      reply: finalReply,
      detectedLanguage,
      sopReference: sopRef,
      trace,
      liveTrainInfo,
      triageMs: totalMs,
    };
  } catch (error) {
    if (error instanceof ServiceConfigError) {
      throw error;
    }

    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes('API_KEY_INVALID') ||
      msg.includes('PERMISSION_DENIED') ||
      msg.includes('403') ||
      msg.includes('400')
    ) {
      throw new ServiceConfigError(
        'Gemini API authentication failed. Please check GEMINI_API_KEY in Settings > Secrets.',
        502
      );
    }

    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      throw new ServiceConfigError(
        'Gemini API rate limit reached. Please wait a moment and try again.',
        429
      );
    }

    throw new Error(`RailResolve agent failed: ${msg}`);
  }
}
