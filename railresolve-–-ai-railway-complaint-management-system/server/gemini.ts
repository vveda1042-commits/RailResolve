import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_PRIORITIES,
  type AIClassificationResult,
  type ComplaintCategory,
  type ComplaintPriority,
} from '../src/types/complaint.ts';
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

function normalizePriority(raw: unknown): ComplaintPriority {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const matched = COMPLAINT_PRIORITIES.find(
      (p) => p.toLowerCase() === trimmed.toLowerCase()
    );
    if (matched) return matched;
  }
  return 'Medium';
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isAuthOrClientError =
        msg.includes('400') ||
        msg.includes('403') ||
        msg.includes('API_KEY_INVALID') ||
        msg.includes('PERMISSION_DENIED') ||
        error instanceof ServiceConfigError;

      if (isAuthOrClientError || attempt === maxRetries) {
        throw error;
      }

      const delayMs = 400 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

export async function classifyComplaint(input: {
  description: string;
  train_number?: string;
  coach?: string;
  seat_number?: string;
}): Promise<AIClassificationResult> {
  const ai = getGeminiClient();

  const systemInstruction = `You are a railway operations complaint triage assistant for RailResolve.
Your task is to analyze a passenger's railway complaint and return structured JSON triage metadata.

Allowed categories (choose strictly one):
${COMPLAINT_CATEGORIES.map((c) => `- ${c}`).join('\n')}

Allowed priorities (choose strictly one):
- Critical: Immediate safety, security, fire/smoke/sparks, medical distress, assault/harassment, theft in progress, open coach door while moving, unattended suspicious item, or derailment/track hazard. Must be escalated immediately to human dispatchers/RPF/Train Captain.
- High: Severe service disruption affecting multiple passengers or vulnerable travelers (e.g., total AC failure in extreme heat, complete water outage across coach, severe staff misconduct, major delay without information).
- Medium: Standard operational issue requiring timely maintenance or service recovery (e.g., dirty washroom, faulty reading light, food quality issue, minor seat damage, ticketing discrepancy).
- Low: Minor inconvenience, feedback, or general suggestion with no immediate operational impact.

Department assignment guidelines:
Use clear, realistic railway department names such as:
- Railway Protection Force (RPF)
- On-Board Housekeeping (OBHS)
- Electrical & AC Maintenance
- Watering & Sanitation
- Catering & Hospitality
- Commercial & Ticketing
- Carriage & Wagon Maintenance
- Train Operations & Control
- Personnel & Vigilance
- Passenger Grievance Cell

Safety & Human Escalation Rule:
Never present AI classification as emergency assistance. For any safety or urgent hazard, assign priority "Critical", explicitly state in recommended_action to escalate immediately to human railway control / RPF / Train Guard, and remind staff to verify directly with onboard personnel.`;

  const prompt = `Classify the following passenger railway complaint:
Train: ${input.train_number || 'Not specified'}
Coach: ${input.coach || 'Not specified'}
Seat: ${input.seat_number || 'Not specified'}
Complaint Description:
"""
${input.description.trim()}
"""`;

  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                description:
                  'One of: Cleanliness, Train Delay, Electrical, Water Supply, Food Quality, Staff Behaviour, Security, Ticketing, Coach Maintenance, Other.',
              },
              priority: {
                type: Type.STRING,
                description: 'One of: Critical, High, Medium, Low.',
              },
              department: {
                type: Type.STRING,
                description:
                  'Target railway department responsible for resolving this issue.',
              },
              ai_reasoning: {
                type: Type.STRING,
                description:
                  'Concise 1-2 sentence explanation of the category, priority, and department selection.',
              },
              recommended_action: {
                type: Type.STRING,
                description:
                  'Clear, actionable next step for railway staff or human dispatch.',
              },
            },
            required: [
              'category',
              'priority',
              'department',
              'ai_reasoning',
              'recommended_action',
            ],
          },
        },
      })
    );

    const rawText = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawText) as Record<string, unknown>;

    const category = normalizeCategory(parsed.category);
    const priority = normalizePriority(parsed.priority);
    const urgency =
      priority === 'Critical'
        ? 'CRITICAL'
        : priority === 'High'
          ? 'HIGH'
          : 'NORMAL';
    const department =
      typeof parsed.department === 'string' && parsed.department.trim()
        ? parsed.department.trim()
        : 'Passenger Grievance Cell';
    const ai_reasoning =
      typeof parsed.ai_reasoning === 'string' && parsed.ai_reasoning.trim()
        ? parsed.ai_reasoning.trim()
        : 'Classified automatically based on complaint description.';
    const recommended_action =
      typeof parsed.recommended_action === 'string' &&
      parsed.recommended_action.trim()
        ? parsed.recommended_action.trim()
        : 'Review complaint details and assign to the relevant station or onboard team.';

    return {
      category,
      priority,
      urgency,
      department,
      ai_reasoning,
      recommended_action,
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

    throw new Error(`AI classification failed: ${msg}`);
  }
}
