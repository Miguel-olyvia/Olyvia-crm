import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!url || !anonKey) {
  // Falha cedo e claro se o .env não estiver preenchido.
  // eslint-disable-next-line no-console
  console.error(
    "[DUC] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY em falta. Verifica o duc-app/.env"
  );
}

// Cliente Supabase próprio da app DUC. Usa uma storage key própria para NÃO
// colidir com a sessão da app Olyvia caso corram no mesmo browser/origem.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "duc-app-auth",
  },
});
