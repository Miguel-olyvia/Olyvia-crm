// 25/11 (Obra Viva, etapa 3b): no pacote do servidor, o «@/integrations/supabase/client» da app é este. O cliente é o da conta robô,
// posto pela função antes de cada volta (definirClienteServidor). As leituras da app que usam o cliente global passam a usar este.
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let supabase: SupabaseClient<any> = null as unknown as SupabaseClient;
export function definirClienteServidor(c: SupabaseClient): void { supabase = c; }
