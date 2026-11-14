export const COMPLAINT_CATEGORIES = [
  'Cleanliness',
  'Train Delay',
  'Electrical',
  'Water Supply',
  'Food Quality',
  'Staff Behaviour',
  'Security',
  'Ticketing',
  'Coach Maintenance',
  'Other',
] as const;

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const COMPLAINT_STATUSES = ['Open', 'In Progress', 'Resolved'] as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;

export type ComplaintPriority = (typeof COMPLAINT_PRIORITIES)[number];

export const COMPLAINT_URGENCIES = ['CRITICAL', 'HIGH', 'NORMAL'] as const;

export type ComplaintUrgency = (typeof COMPLAINT_URGENCIES)[number];

export const COMMAND_DEPARTMENTS = [
  'All',
  'Security/SOS',
  'Medical',
  'Electrical/AC',
  'Housekeeping',
  'Catering',
] as const;

export type CommandDepartmentFilter = (typeof COMMAND_DEPARTMENTS)[number];

export interface ScheduledLanguageOption {
  code: string;
  name: string;
  nativeLabel: string;
  speechLocale: string;
}

export const SCHEDULED_INDIAN_LANGUAGES: readonly ScheduledLanguageOption[] = [
  { code: 'auto', name: 'Auto-Detect', nativeLabel: 'Auto-Detect (All 22 Languages)', speechLocale: 'en-IN' },
  { code: 'en', name: 'English', nativeLabel: 'English', speechLocale: 'en-IN' },
  { code: 'hi', name: 'Hindi', nativeLabel: 'हिन्दी (Hindi)', speechLocale: 'hi-IN' },
  { code: 'bn', name: 'Bengali', nativeLabel: 'বাংলা (Bengali)', speechLocale: 'bn-IN' },
  { code: 'te', name: 'Telugu', nativeLabel: 'తెలుగు (Telugu)', speechLocale: 'te-IN' },
  { code: 'mr', name: 'Marathi', nativeLabel: 'मराठी (Marathi)', speechLocale: 'mr-IN' },
  { code: 'ta', name: 'Tamil', nativeLabel: 'தமிழ் (Tamil)', speechLocale: 'ta-IN' },
  { code: 'ur', name: 'Urdu', nativeLabel: 'اردو (Urdu)', speechLocale: 'ur-IN' },
  { code: 'gu', name: 'Gujarati', nativeLabel: 'ગુજરાતી (Gujarati)', speechLocale: 'gu-IN' },
  { code: 'kn', name: 'Kannada', nativeLabel: 'ಕನ್ನಡ (Kannada)', speechLocale: 'kn-IN' },
  { code: 'or', name: 'Odia', nativeLabel: 'ଓଡ଼ିଆ (Odia)', speechLocale: 'or-IN' },
  { code: 'ml', name: 'Malayalam', nativeLabel: 'മലയാളം (Malayalam)', speechLocale: 'ml-IN' },
  { code: 'pa', name: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ (Punjabi)', speechLocale: 'pa-IN' },
  { code: 'as', name: 'Assamese', nativeLabel: 'অসমীয়া (Assamese)', speechLocale: 'as-IN' },
  { code: 'mai', name: 'Maithili', nativeLabel: 'मैथिली (Maithili)', speechLocale: 'hi-IN' },
  { code: 'sat', name: 'Santali', nativeLabel: 'ᱥᱟᱱᱛᱟᱲᱤ (Santali)', speechLocale: 'hi-IN' },
  { code: 'ks', name: 'Kashmiri', nativeLabel: 'कॉशुर (Kashmiri)', speechLocale: 'ur-IN' },
  { code: 'ne', name: 'Nepali', nativeLabel: 'नेपाली (Nepali)', speechLocale: 'ne-NP' },
  { code: 'kok', name: 'Konkani', nativeLabel: 'कोंकणी (Konkani)', speechLocale: 'mr-IN' },
  { code: 'sd', name: 'Sindhi', nativeLabel: 'سنڌي (Sindhi)', speechLocale: 'hi-IN' },
  { code: 'doi', name: 'Dogri', nativeLabel: 'डोगरी (Dogri)', speechLocale: 'hi-IN' },
  { code: 'mni', name: 'Manipuri', nativeLabel: 'মৈতৈলোন্ (Manipuri)', speechLocale: 'bn-IN' },
  { code: 'brx', name: 'Bodo', nativeLabel: 'बड़ो (Bodo)', speechLocale: 'hi-IN' },
  { code: 'sa', name: 'Sanskrit', nativeLabel: 'संस्कृतम् (Sanskrit)', speechLocale: 'hi-IN' },
] as const;

export interface ComplaintRecord {
  id: string | number;
  ticket_id: string;
  pnr_number: string;
  passenger_name: string;
  passenger_phone: string;
  contact: string;
  train_number: string;
  coach: string;
  seat_number: string;
  category: ComplaintCategory | string;
  description: string;
  priority: ComplaintPriority | string;
  urgency: ComplaintUrgency;
  department: string;
  status: ComplaintStatus | string;
  emergency_call: boolean;
  sos: boolean;
  ai_reasoning: string | null;
  recommended_action: string | null;
  resolution_notes: string | null;
  next_station?: string | null;
  eta_minutes?: number | null;
  triage_ms?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateComplaintPayload {
  passenger_name: string;
  contact: string;
  train_number: string;
  coach: string;
  seat_number: string;
  description: string;
  pnr_number?: string;
}

export interface UpdateComplaintPayload {
  status: ComplaintStatus;
  resolution_notes?: string | null;
}

export interface AIClassificationResult {
  category: ComplaintCategory;
  priority: ComplaintPriority;
  urgency: ComplaintUrgency;
  department: string;
  ai_reasoning: string;
  recommended_action: string;
}

export interface AgentTraceStep {
  step: number;
  title: string;
  status: 'completed' | 'bypassed' | 'alert';
  detail: string;
  durationMs?: number;
}

export interface ChatHistoryItem {
  role: 'user' | 'model';
  text: string;
}

export interface AgentIntakeResponse {
  complaint: ComplaintRecord | null;
  reply: string;
  detectedLanguage: string;
  sopReference: string;
  trace: AgentTraceStep[];
  liveTrainInfo: {
    trainNumber: string;
    trainName: string;
    nextStation: string;
    etaMinutes: number;
    runningStatus: string;
  } | null;
  triageMs: number;
}

export type FastTrackSosType = 'MED' | 'SEC' | 'FIRE' | 'THEFT';

export interface FastTrackSosPayload {
  sosType: FastTrackSosType;
  pnr_number?: string;
  train_number?: string;
  coach?: string;
  seat_number?: string;
  passenger_phone?: string;
  latitude?: number | null;
  longitude?: number | null;
  note?: string;
}

export interface FastTrackSosResponse {
  complaint: ComplaintRecord;
  smsFallbackPayload: string;
  dispatchLatencyMs: number;
}
