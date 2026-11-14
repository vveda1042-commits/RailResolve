import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class ServiceConfigError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = 'ServiceConfigError';
    this.statusCode = statusCode;
  }
}

let cachedClient: SupabaseClient | null = null;
let cachedKeySignature = '';

export function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  ).trim();

  const supabaseKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY ||
    ''
  ).trim();

  if (
    !supabaseUrl ||
    supabaseUrl === 'MY_SUPABASE_URL' ||
    !supabaseKey ||
    supabaseKey === 'MY_SUPABASE_SERVICE_ROLE_KEY' ||
    supabaseKey === 'MY_SUPABASE_ANON_KEY'
  ) {
    throw new ServiceConfigError(
      'Supabase credentials are not configured. Please add SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in Settings > Secrets.',
      503
    );
  }

  const signature = `${supabaseUrl}::${supabaseKey.slice(0, 8)}`;
  if (!cachedClient || cachedKeySignature !== signature) {
    cachedClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    cachedKeySignature = signature;
  }

  return cachedClient;
}
