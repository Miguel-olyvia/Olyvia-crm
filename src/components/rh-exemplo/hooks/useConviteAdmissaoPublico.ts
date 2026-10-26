/**
 * O convite de admissão visto por quem o recebe (página pública), delegando ao
 * hook real que comunica com Supabase via Edge Function.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 *
 * Nota: O hook real usa um fluxo OTP; esta camada de adaptação expõe os tipos
 * usados pelos componentes de /rh-exemplo que dependem da interface original.
 */
import { useConviteAdmissaoPublico as useConviteAdmissaoPublicoReal } from "@/hooks/useConviteAdmissaoPublico";
import type { CorpoErroEdge } from "@/lib/hr/errosAdmissao";
import type { MotivoConvite } from "@/lib/hr/errosAdmissao";
import type { AnexoConvite } from "@/lib/hr/conviteAnexos";

export const TOKEN_CONVITE_EXEMPLO = "exemplo";

export interface ConviteEstado {
  pessoa_nome: string | null;
  email_pessoal: string | null;
  nif: string | null;
  niss_ultimos4: string | null;
  conta_ultimos4: string | null;
  formato_conta: string | null;
  rascunho: Record<string, unknown> | null;
  valid_until: string;
  campos_obrigatorios: { codigo: string; condicional: boolean }[] | null;
  anexos?: AnexoConvite[];
}

export interface DadosSubmissaoConvite {
  [campo: string]: unknown;
}

export type ResultadoSubmissao =
  | { ok: true; avisos: string[]; corpoErro?: undefined }
  | { ok: false; corpoErro: CorpoErroEdge; avisos: string[] };

export function useConviteAdmissaoPublico(token: string | undefined) {
  return useConviteAdmissaoPublicoReal(token);
}
