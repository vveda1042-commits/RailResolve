import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateTicketId,
  runRailResolveAgent,
  simulateLiveTrainLookup,
} from './server/agent.ts';
import {
  ensureSeededComplaints,
  insertComplaintRow,
  normalizeComplaintRow,
  updateComplaintRecord,
} from './server/complaintsStore.ts';
import { classifyComplaint } from './server/gemini.ts';
import { getSupabaseAdmin, ServiceConfigError } from './server/supabase.ts';
import {
  COMPLAINT_STATUSES,
  type ComplaintStatus,
  type CreateComplaintPayload,
  type FastTrackSosPayload,
} from './src/types/complaint.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function sendError(res: Response, error: unknown, fallbackStatus = 500) {
  if (error instanceof ServiceConfigError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  const message =
    error instanceof Error
      ? error.message
      : 'An unexpected server error occurred.';
  return res.status(fallbackStatus).json({ error: message });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'railresolve', model: 'RailResolve' });
  });

  // Fast-Track Deterministic SOS Pipeline (Zero LLM / Translation Delay)
  app.post('/api/v1/sos', async (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      const body = (req.body || {}) as Partial<FastTrackSosPayload>;
      const sosType = body.sosType || 'SEC';
      const trainNumber = (body.train_number || '12951').trim();
      const coach = (body.coach || 'General').trim().toUpperCase();
      const seat = (body.seat_number || 'Unassigned').trim();
      const pnr = (body.pnr_number || 'PNR-BYPASSED').trim();
      const phone = (body.passenger_phone || 'Not provided').trim();
      const lat =
        typeof body.latitude === 'number' ? body.latitude.toFixed(4) : 'NA';
      const lon =
        typeof body.longitude === 'number' ? body.longitude.toFixed(4) : 'NA';
      const note = (body.note || '').trim();

      const liveTrain = simulateLiveTrainLookup({
        pnr_number: pnr,
        train_number: trainNumber,
        is_critical: true,
      });

      const department =
        sosType === 'MED'
          ? 'Medical'
          : sosType === 'FIRE'
            ? 'Electrical/AC'
            : 'Security/SOS';

      const typeLabel =
        sosType === 'MED'
          ? 'Medical Emergency'
          : sosType === 'FIRE'
            ? 'Fire / Smoke Hazard'
            : sosType === 'THEFT'
              ? 'Active Theft / Robbery'
              : 'Women Safety / Harassment SOS';

      const smsFallbackPayload = `SOS|TRN:${liveTrain.trainNumber}|COACH:${coach}|BERTH:${seat}|LAT:${lat}|LON:${lon}|TYPE:${sosType}`;

      const description = `[SOS] Fast-Track ${typeLabel} in Coach ${coach} Seat ${seat} (Train ${liveTrain.trainNumber}, GPS: ${lat},${lon})${note ? ` — ${note}` : ''}`;

      const created = await insertComplaintRow({
        ticket_id: generateTicketId('RR-SOS'),
        pnr_number: pnr,
        passenger_name: 'SOS Passenger',
        passenger_phone: phone,
        train_number: `${liveTrain.trainNumber} ${liveTrain.trainName}`,
        coach,
        seat_number: seat,
        category: 'Security',
        department,
        urgency: 'CRITICAL',
        priority: 'Critical',
        status: 'Open',
        description,
        emergency_call: true,
        sos: true,
        ai_reasoning:
          'Fast-Track Deterministic SOS Pipeline executed with zero LLM queue delay.',
        recommended_action: `Dispatch ${department} team & Station Master to ${liveTrain.nextStation} (ETA ${liveTrain.etaMinutes} mins). SMS Fallback: ${smsFallbackPayload}`,
        resolution_notes: null,
        next_station: liveTrain.nextStation,
        eta_minutes: liveTrain.etaMinutes,
      });

      return res.status(201).json({
        complaint: created,
        smsFallbackPayload,
        dispatchLatencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  // Agentic Multimodal + Multi-Turn 22-Language AI Chatbot
  app.post('/api/agent/intake', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        message?: string;
        history?: Array<{ role: 'user' | 'model'; text: string }>;
        recentTicketIds?: string[];
        pnr_number?: string;
        passenger_phone?: string;
        preferredLanguage?: string;
        imageBase64?: string;
        imageMimeType?: string;
      };

      const result = await runRailResolveAgent({
        message: body.message || '',
        history: body.history,
        recentTicketIds: body.recentTicketIds,
        pnr_number: body.pnr_number,
        passenger_phone: body.passenger_phone,
        preferredLanguage: body.preferredLanguage,
        imageBase64: body.imageBase64,
        imageMimeType: body.imageMimeType,
      });

      return res.status(result.complaint ? 201 : 200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  // Standard form complaint submission
  app.post('/api/complaints', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Partial<CreateComplaintPayload>;

      const passenger_name = (body.passenger_name || '').trim();
      const contact = (body.contact || '').trim();
      const train_number = (body.train_number || '').trim();
      const coach = (body.coach || '').trim();
      const seat_number = (body.seat_number || '').trim();
      const description = (body.description || '').trim();
      const pnr_number = (body.pnr_number || '').trim() || 'Not provided';

      if (
        !passenger_name ||
        !contact ||
        !train_number ||
        !coach ||
        !seat_number ||
        !description
      ) {
        return res.status(400).json({
          error:
            'All fields are required: passenger name, contact, train number, coach, seat number, and complaint description.',
        });
      }

      if (description.length < 10) {
        return res.status(400).json({
          error:
            'Please provide a slightly more detailed complaint description (at least 10 characters) for accurate triage.',
        });
      }

      const classification = await classifyComplaint({
        description,
        train_number,
        coach,
        seat_number,
      });

      const isCritical = classification.priority === 'Critical';
      const urgency = isCritical
        ? 'CRITICAL'
        : classification.priority === 'High'
          ? 'HIGH'
          : 'NORMAL';

      const created = await insertComplaintRow({
        ticket_id: generateTicketId(),
        pnr_number,
        passenger_name,
        passenger_phone: contact,
        train_number,
        coach,
        seat_number,
        category: classification.category,
        department: classification.department,
        urgency,
        priority: classification.priority,
        status: 'Open',
        description,
        emergency_call: isCritical,
        sos: isCritical,
        ai_reasoning: classification.ai_reasoning,
        recommended_action: classification.recommended_action,
        resolution_notes: null,
      });

      return res.status(201).json({ complaint: created });
    } catch (error) {
      return sendError(res, error);
    }
  });

  // List complaints for Command Center & Admin Dashboard
  app.get('/api/complaints', async (req: Request, res: Response) => {
    try {
      const allComplaints = await ensureSeededComplaints();

      const statusFilter =
        typeof req.query.status === 'string' ? req.query.status.trim() : '';
      const priorityFilter =
        typeof req.query.priority === 'string' ? req.query.priority.trim() : '';
      const categoryFilter =
        typeof req.query.category === 'string' ? req.query.category.trim() : '';
      const searchFilter =
        typeof req.query.search === 'string'
          ? req.query.search.trim().toLowerCase()
          : '';

      const filtered = allComplaints.filter((item) => {
        if (
          statusFilter &&
          statusFilter !== 'All' &&
          item.status !== statusFilter
        ) {
          return false;
        }
        if (
          priorityFilter &&
          priorityFilter !== 'All' &&
          item.priority !== priorityFilter
        ) {
          return false;
        }
        if (
          categoryFilter &&
          categoryFilter !== 'All' &&
          item.category !== categoryFilter
        ) {
          return false;
        }
        if (searchFilter) {
          const hay = [
            item.ticket_id,
            item.pnr_number,
            item.passenger_name,
            item.train_number,
            item.department,
            item.description,
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(searchFilter)) return false;
        }
        return true;
      });

      return res.json({ complaints: filtered });
    } catch (error) {
      return sendError(res, error);
    }
  });

  // Track complaint by ticket_id
  app.get('/api/complaints/:ticketId', async (req: Request, res: Response) => {
    try {
      const rawTicketId = String(req.params.ticketId || '').trim();
      if (!rawTicketId) {
        return res.status(400).json({ error: 'Ticket ID is required.' });
      }

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('complaints')
        .select('*')
        .ilike('ticket_id', rawTicketId)
        .maybeSingle();

      if (error) {
        return res
          .status(500)
          .json({ error: `Failed to look up ticket: ${error.message}` });
      }

      if (!data) {
        return res.status(404).json({
          error: `No complaint found with Ticket ID "${rawTicketId}". Please verify the ID and try again.`,
        });
      }

      return res.json({
        complaint: normalizeComplaintRow(data as Record<string, unknown>),
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  // Admin / Command Center status update
  app.patch(
    '/api/complaints/:ticketId',
    async (req: Request, res: Response) => {
      try {
        const rawTicketId = String(req.params.ticketId || '').trim();
        if (!rawTicketId) {
          return res.status(400).json({ error: 'Ticket ID is required.' });
        }

        const body = (req.body || {}) as {
          status?: string;
          resolution_notes?: string | null;
        };

        const requestedStatus = (body.status || '').trim();
        const validStatus = COMPLAINT_STATUSES.find(
          (s) => s === requestedStatus
        ) as ComplaintStatus | undefined;

        if (!validStatus) {
          return res.status(400).json({
            error: `Invalid status. Allowed values: ${COMPLAINT_STATUSES.join(', ')}.`,
          });
        }

        const resolution_notes =
          typeof body.resolution_notes === 'string'
            ? body.resolution_notes.trim() || null
            : undefined;

        const updated = await updateComplaintRecord(rawTicketId, {
          status: validStatus,
          resolution_notes,
        });

        if (!updated) {
          return res.status(404).json({
            error: `Complaint with Ticket ID "${rawTicketId}" was not found.`,
          });
        }

        return res.json({ complaint: updated });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  // Vite dev middleware or production static assets
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RailResolve server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
