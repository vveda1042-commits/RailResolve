import { getSupabaseAdmin } from './supabase.ts';
import type {
  ComplaintRecord,
  ComplaintStatus,
  ComplaintUrgency,
} from '../src/types/complaint.ts';

let cachedColumns: Set<string> | null = null;
let seededThisSession = false;

function getSupabaseRestConfig(): { url: string; key: string } | null {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  ).trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

export async function getComplaintsTableColumns(): Promise<Set<string>> {
  if (cachedColumns) return cachedColumns;

  const cfg = getSupabaseRestConfig();
  if (cfg) {
    try {
      const res = await fetch(`${cfg.url}/rest/v1/`, {
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${cfg.key}`,
          Accept: 'application/openapi+json',
        },
      });
      if (res.ok) {
        const spec = (await res.json()) as {
          definitions?: {
            complaints?: { properties?: Record<string, unknown> };
          };
        };
        const props = spec?.definitions?.complaints?.properties;
        if (props && typeof props === 'object') {
          cachedColumns = new Set(Object.keys(props));
          return cachedColumns;
        }
      }
    } catch {
      // Fallback to inspecting existing row or probing
    }
  }

  // Fallback: inspect one row if available
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('complaints').select('*').limit(1);
    if (data && data.length > 0) {
      cachedColumns = new Set(Object.keys(data[0]));
      return cachedColumns;
    }
  } catch {
    // Ignore
  }

  // Ultimate fallback: support Turn 2 + Turn 1 common columns
  return new Set([
    'id',
    'ticket_id',
    'pnr_number',
    'passenger_phone',
    'department',
    'urgency',
    'description',
    'emergency_call',
    'sos',
    'status',
    'created_at',
    'updated_at',
  ]);
}

function mapPriorityToUrgency(
  priority: string | null | undefined,
  sos?: boolean,
  emergencyCall?: boolean
): ComplaintUrgency {
  if (sos || emergencyCall) return 'CRITICAL';
  const p = String(priority || '').toUpperCase();
  if (p === 'CRITICAL') return 'CRITICAL';
  if (p === 'HIGH') return 'HIGH';
  return 'NORMAL';
}

function mapUrgencyToPriority(urgency: string | null | undefined): string {
  const u = String(urgency || '').toUpperCase();
  if (u === 'CRITICAL') return 'Critical';
  if (u === 'HIGH') return 'High';
  return 'Medium';
}

export function normalizeComplaintRow(
  raw: Record<string, unknown>
): ComplaintRecord {
  const rawDescription = String(raw.description || '');
  const rawCategory = String(raw.category || '');
  const rawDepartment = String(raw.department || 'Passenger Grievance');
  const rawPriority = String(raw.priority || '');
  const rawUrgency = String(raw.urgency || '').toUpperCase();

  const sos =
    typeof raw.sos === 'boolean'
      ? raw.sos
      : rawUrgency === 'CRITICAL' ||
        rawPriority.toLowerCase() === 'critical' ||
        /\[SOS\]/i.test(rawDescription) ||
        /security|sos|medical/i.test(rawDepartment);

  const emergency_call =
    typeof raw.emergency_call === 'boolean'
      ? raw.emergency_call
      : sos || /\[EMERGENCY_CALL\]/i.test(rawDescription);

  const urgency: ComplaintUrgency =
    rawUrgency === 'CRITICAL' || rawUrgency === 'HIGH' || rawUrgency === 'NORMAL'
      ? (rawUrgency as ComplaintUrgency)
      : mapPriorityToUrgency(rawPriority, sos, emergency_call);

  const priority = rawPriority || mapUrgencyToPriority(urgency);

  let status: ComplaintStatus = 'Open';
  if (typeof raw.status === 'string' && raw.status.trim()) {
    const s = raw.status.trim();
    if (s === 'Resolved' || s === 'In Progress' || s === 'Open') {
      status = s;
    } else if (s.toLowerCase() === 'resolved' || s.toLowerCase() === 'closed') {
      status = 'Resolved';
    } else if (s.toLowerCase().includes('progress')) {
      status = 'In Progress';
    }
  } else if (typeof raw.resolved === 'boolean') {
    status = raw.resolved ? 'Resolved' : 'Open';
  }

  // Extract coach/seat from description if columns are absent in Turn 2 schema
  const coachMatch = rawDescription.match(/\bCoach\s+([A-Z]{1,2}\d{1,2})\b/i);
  const seatMatch = rawDescription.match(/\bSeat\s+(\d{1,3}[A-Z]?)\b/i);
  const pnrMatch = rawDescription.match(/\bPNR[:\s#]*(\d{10})\b/i);

  const contactStr = String(
    raw.passenger_phone || raw.contact || 'Not provided'
  );

  return {
    id: (raw.id as string | number) ?? String(raw.ticket_id || ''),
    ticket_id: String(raw.ticket_id || ''),
    pnr_number: String(
      raw.pnr_number || (pnrMatch ? pnrMatch[1] : '') || '—'
    ),
    passenger_name: String(raw.passenger_name || 'Passenger'),
    passenger_phone: contactStr,
    contact: contactStr,
    train_number: String(raw.train_number || 'IR Express'),
    coach: String(raw.coach || (coachMatch ? coachMatch[1].toUpperCase() : '—')),
    seat_number: String(
      raw.seat_number || (seatMatch ? seatMatch[1].toUpperCase() : '—')
    ),
    category: rawCategory || rawDepartment,
    description: rawDescription,
    priority,
    urgency,
    department: rawDepartment,
    status,
    emergency_call,
    sos,
    ai_reasoning:
      typeof raw.ai_reasoning === 'string' ? raw.ai_reasoning : null,
    recommended_action:
      typeof raw.recommended_action === 'string'
        ? raw.recommended_action
        : null,
    resolution_notes:
      typeof raw.resolution_notes === 'string' ? raw.resolution_notes : null,
    next_station:
      typeof raw.next_station === 'string' ? raw.next_station : null,
    eta_minutes:
      typeof raw.eta_minutes === 'number' ? raw.eta_minutes : null,
    triage_ms: typeof raw.triage_ms === 'number' ? raw.triage_ms : null,
    created_at: String(raw.created_at || new Date().toISOString()),
    updated_at: String(
      raw.updated_at || raw.created_at || new Date().toISOString()
    ),
  };
}

export interface StoreInsertInput {
  ticket_id: string;
  pnr_number: string;
  passenger_name: string;
  passenger_phone: string;
  train_number: string;
  coach: string;
  seat_number: string;
  category: string;
  department: string;
  urgency: ComplaintUrgency;
  priority: string;
  status: ComplaintStatus;
  description: string;
  emergency_call: boolean;
  sos: boolean;
  ai_reasoning: string | null;
  recommended_action: string | null;
  resolution_notes: string | null;
  next_station?: string | null;
  eta_minutes?: number | null;
}

export async function insertComplaintRow(
  input: StoreInsertInput
): Promise<ComplaintRecord> {
  const supabase = getSupabaseAdmin();
  const cols = await getComplaintsTableColumns();
  const nowIso = new Date().toISOString();

  const fullCandidate: Record<string, unknown> = {
    ticket_id: input.ticket_id,
    pnr_number: input.pnr_number,
    passenger_name: input.passenger_name,
    passenger_phone: input.passenger_phone,
    contact: input.passenger_phone,
    train_number: input.train_number,
    coach: input.coach,
    seat_number: input.seat_number,
    category: input.category,
    department: input.department,
    urgency: input.urgency,
    priority: input.priority,
    status: input.status,
    resolved: input.status === 'Resolved',
    description: input.description,
    emergency_call: input.emergency_call,
    sos: input.sos,
    ai_reasoning: input.ai_reasoning,
    recommended_action: input.recommended_action,
    resolution_notes: input.resolution_notes,
    next_station: input.next_station ?? null,
    eta_minutes: input.eta_minutes ?? null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const payload: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fullCandidate)) {
    if (cols.has(key)) {
      payload[key] = val;
    }
  }

  // Ensure ticket_id & description are always included even if OpenAPI discovery missed
  payload.ticket_id = input.ticket_id;
  payload.description = input.description;
  if (!payload.department && cols.has('department')) {
    payload.department = input.department;
  }

  const { data, error } = await supabase
    .from('complaints')
    .insert(payload)
    .select('*')
    .single();

  if (error || !data) {
    // If cachedColumns was stale and a column didn't exist, retry once without unknown column
    const msg = error?.message || 'Failed to insert complaint into Supabase.';
    throw new Error(msg);
  }

  const normalized = normalizeComplaintRow(data as Record<string, unknown>);
  // Preserve rich runtime fields that might not have dedicated DB columns
  return {
    ...normalized,
    pnr_number:
      normalized.pnr_number && normalized.pnr_number !== '—'
        ? normalized.pnr_number
        : input.pnr_number,
    coach:
      normalized.coach && normalized.coach !== '—'
        ? normalized.coach
        : input.coach,
    seat_number:
      normalized.seat_number && normalized.seat_number !== '—'
        ? normalized.seat_number
        : input.seat_number,
    emergency_call: cols.has('emergency_call')
      ? normalized.emergency_call
      : input.emergency_call,
    sos: cols.has('sos') ? normalized.sos : input.sos,
    next_station: input.next_station ?? normalized.next_station,
    eta_minutes: input.eta_minutes ?? normalized.eta_minutes,
  };
}

export async function ensureSeededComplaints(): Promise<ComplaintRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data: existing, error } = await supabase
    .from('complaints')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to read complaints from Supabase: ${error.message}`);
  }

  if (existing && existing.length > 0) {
    return existing.map((row) =>
      normalizeComplaintRow(row as Record<string, unknown>)
    );
  }

  if (seededThisSession) {
    return [];
  }
  seededThisSession = true;

  const sampleSeeds: StoreInsertInput[] = [
    {
      ticket_id: 'RR-261113-MED01',
      pnr_number: '4829104412',
      passenger_name: 'Meera Nair',
      passenger_phone: '+91 98201 44120',
      train_number: '12951 Mumbai Rajdhani',
      coach: 'A1',
      seat_number: '12',
      category: 'Security',
      department: 'Medical',
      urgency: 'CRITICAL',
      priority: 'Critical',
      status: 'Open',
      description:
        'Coach A1 Seat 12 (PNR 4829104412): Elderly passenger experiencing acute chest pain and dizziness. Immediate medical team requested at next station.',
      emergency_call: true,
      sos: true,
      ai_reasoning:
        'Acute cardiac symptoms in an elderly passenger require immediate emergency medical dispatch and priority station halt coordination.',
      recommended_action:
        'Alert Railway Medical Unit and Station Master at Vadodara Jn for stretcher & paramedic boarding on arrival.',
      resolution_notes: null,
      next_station: 'Vadodara Jn (BRC)',
      eta_minutes: 9,
    },
    {
      ticket_id: 'RR-261113-ELC02',
      pnr_number: '4521890123',
      passenger_name: 'Rohan Verma',
      passenger_phone: '+91 98112 33908',
      train_number: '12627 Karnataka Express',
      coach: 'B2',
      seat_number: '34',
      category: 'Electrical',
      department: 'Electrical/AC',
      urgency: 'HIGH',
      priority: 'High',
      status: 'In Progress',
      description:
        'Coach B2 Seat 34 (PNR 4521890123): AC unit blowing warm air and temperature rising rapidly in sealed 3AC compartment.',
      emergency_call: false,
      sos: false,
      ai_reasoning:
        'HVAC cooling failure in a sealed AC coach impacts multiple passengers and requires onboard AC mechanic intervention.',
      recommended_action:
        'Dispatch onboard AC technician to inspect Coach B2 compressor relay and auxiliary power panel before Bhopal Jn.',
      resolution_notes: 'Onboard electrical technician dispatched to Coach B2.',
      next_station: 'Bhopal Jn (BPL)',
      eta_minutes: 18,
    },
    {
      ticket_id: 'RR-261113-HSK03',
      pnr_number: '6104928371',
      passenger_name: 'Ananya Kulkarni',
      passenger_phone: '+91 97650 88214',
      train_number: '12002 Bhopal Shatabdi',
      coach: 'S4',
      seat_number: '56',
      category: 'Cleanliness',
      department: 'Housekeeping',
      urgency: 'NORMAL',
      priority: 'Medium',
      status: 'Open',
      description:
        'Coach S4 Seat 56 (PNR 6104928371): Washroom near rear vestibule is clogged and overflowing with water on corridor floor.',
      emergency_call: false,
      sos: false,
      ai_reasoning:
        'Sanitation and plumbing blockage requires OBHS cleaning crew and vacuum drain clearing at upcoming maintenance halt.',
      recommended_action:
        'Assign On-Board Housekeeping (OBHS) supervisor to sanitize Coach S4 washroom and clear drain line at Jhansi Jn.',
      resolution_notes: null,
      next_station: 'VGL Jhansi Jn (VGLJ)',
      eta_minutes: 24,
    },
  ];

  const inserted: ComplaintRecord[] = [];
  for (const seed of sampleSeeds) {
    try {
      const record = await insertComplaintRow(seed);
      inserted.push(record);
    } catch {
      // Ignore individual seed duplicate if concurrent load occurred
    }
  }

  return inserted;
}

export async function updateComplaintRecord(
  ticketId: string,
  updates: { status: ComplaintStatus; resolution_notes?: string | null }
): Promise<ComplaintRecord | null> {
  const supabase = getSupabaseAdmin();
  const cols = await getComplaintsTableColumns();

  const patchPayload: Record<string, unknown> = {};
  if (cols.has('status')) {
    patchPayload.status = updates.status;
  }
  if (cols.has('resolved')) {
    patchPayload.resolved = updates.status === 'Resolved';
  }
  if (cols.has('resolution_notes') && updates.resolution_notes !== undefined) {
    patchPayload.resolution_notes = updates.resolution_notes;
  }
  if (cols.has('updated_at')) {
    patchPayload.updated_at = new Date().toISOString();
  }

  // Fallback if neither status nor resolved appeared in discovered cols
  if (Object.keys(patchPayload).length === 0) {
    patchPayload.status = updates.status;
  }

  const { data, error } = await supabase
    .from('complaints')
    .update(patchPayload)
    .ilike('ticket_id', ticketId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update complaint in Supabase: ${error.message}`);
  }
  if (!data) return null;

  return normalizeComplaintRow(data as Record<string, unknown>);
}

export async function getComplaintByTicketId(
  ticketId: string
): Promise<ComplaintRecord | null> {
  const cleaned = ticketId.trim();
  if (!cleaned) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('complaints')
    .select('*')
    .ilike('ticket_id', cleaned)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up ticket: ${error.message}`);
  }
  if (!data) return null;

  return normalizeComplaintRow(data as Record<string, unknown>);
}
