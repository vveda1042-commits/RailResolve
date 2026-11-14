import type {
  AgentIntakeResponse,
  ComplaintRecord,
  CreateComplaintPayload,
  FastTrackSosPayload,
  FastTrackSosResponse,
  UpdateComplaintPayload,
} from '../types/complaint';

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const message =
      (data && typeof data.error === 'string' && data.error) ||
      `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  return data as T;
}

export async function triggerFastTrackSos(
  payload: FastTrackSosPayload
): Promise<FastTrackSosResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch('/api/v1/sos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return await parseJsonResponse<FastTrackSosResponse>(res);
  } finally {
    clearTimeout(timeout);
  }
}

export async function submitAgentIntake(payload: {
  message: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  recentTicketIds?: string[];
  pnr_number?: string;
  passenger_phone?: string;
  preferredLanguage?: string;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<AgentIntakeResponse> {
  const res = await fetch('/api/agent/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<AgentIntakeResponse>(res);
}

export async function createComplaint(
  payload: CreateComplaintPayload
): Promise<ComplaintRecord> {
  const res = await fetch('/api/complaints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse<{ complaint: ComplaintRecord }>(res);
  return data.complaint;
}

export async function fetchComplaintByTicketId(
  ticketId: string
): Promise<ComplaintRecord> {
  const encoded = encodeURIComponent(ticketId.trim());
  const res = await fetch(`/api/complaints/${encoded}`);
  const data = await parseJsonResponse<{ complaint: ComplaintRecord }>(res);
  return data.complaint;
}

export async function fetchComplaints(filters?: {
  status?: string;
  priority?: string;
  category?: string;
  search?: string;
}): Promise<ComplaintRecord[]> {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'All') {
    params.set('status', filters.status);
  }
  if (filters?.priority && filters.priority !== 'All') {
    params.set('priority', filters.priority);
  }
  if (filters?.category && filters.category !== 'All') {
    params.set('category', filters.category);
  }
  if (filters?.search && filters.search.trim()) {
    params.set('search', filters.search.trim());
  }

  const queryString = params.toString();
  const url = queryString ? `/api/complaints?${queryString}` : '/api/complaints';
  const res = await fetch(url);
  const data = await parseJsonResponse<{ complaints: ComplaintRecord[] }>(res);
  return data.complaints;
}

export async function updateComplaintStatus(
  ticketId: string,
  payload: UpdateComplaintPayload
): Promise<ComplaintRecord> {
  const encoded = encodeURIComponent(ticketId.trim());
  const res = await fetch(`/api/complaints/${encoded}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse<{ complaint: ComplaintRecord }>(res);
  return data.complaint;
}
