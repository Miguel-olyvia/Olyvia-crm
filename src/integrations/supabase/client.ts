import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// localStorage intencional: sem servidor SSR não há como emitir cookies httpOnly.
// A protecção CSRF vem do Bearer token em Authorization header (nunca enviado automaticamente pelo browser).
// @supabase/ssr guarda o token de sessão num cookie por baixo, independentemente da opção `storage`
// acima — sem `cookieOptions.secure`, esse cookie nunca inclui o atributo Secure (a lib não deteta
// HTTPS automaticamente). `location.protocol` em vez de import.meta.env.PROD para refletir o
// ambiente real, não o modo de build (evita marcar Secure num preview servido por http local).
const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

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
    cookieOptions: {
      secure: isHttps,
      sameSite: 'lax',
    },
  }
);