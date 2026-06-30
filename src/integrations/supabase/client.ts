import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// localStorage intencional: sem servidor SSR não há como emitir cookies httpOnly.
// A protecção CSRF vem do Bearer token em Authorization header (nunca enviado automaticamente pelo browser).
export const supabase = createBrowserClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);