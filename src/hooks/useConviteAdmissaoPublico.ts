/**
 * O lado PUBLICO do convite de admissao: ler o estado do token e submeter o
 * formulario. Sem sessao nenhuma -- e por isso que fala com a Edge Function
 * `convite-admissao` (accoes "estado" / "submeter"), nunca directamente com a
 * base: essas duas RPCs so `service_role` as executa.
 *
 * O token em si NUNCA fica em `localStorage`/`sessionStorage`: vive so na
 * URL e no estado deste hook, e desaparece quando a aba fecha.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

export interface ConviteEstado {
  nome: string | null;
  email_destino: string | null;
  rascunho: Record<string, unknown> | null;
}

export interface DadosSubmissaoConvite {
  [campo: string]: unknown;
}

export function useConviteAdmissaoPublico(token: string | undefined) {
  const [estado, setEstado] = useState<ConviteEstado | null>(null);
  const [loading, setLoading] = useState(true);
  const [erroInicial, setErroInicial] = useState<string | null>(null);
  const [submetendo, setSubmetendo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!token) {
        setLoading(false);
        setErroInicial("hr.convite.tokenInvalido");
        return;
      }
      setLoading(true);
      setErroInicial(null);
      try {
        const { data, error } = await supabase.functions.invoke("convite-admissao", {
          body: { action: "estado", token },
        });
        if (cancelado) return;
        if (error || data?.error) {
          if (error) captureFlowError(error, "hr-convite-admissao-publico");
          setErroInicial(String(data?.error ?? "hr.convite.tokenInvalido"));
          setEstado(null);
          return;
        }
        setEstado((data?.convite ?? null) as ConviteEstado | null);
      } catch (e) {
        if (cancelado) return;
        captureFlowError(e, "hr-convite-admissao-publico");
        setErroInicial(await getFriendlyErrorMessage(e));
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [token]);

  const submeter = useCallback(
    async (
      dados: DadosSubmissaoConvite,
      assinaturaNome: string,
    ): Promise<{ ok: boolean; erro: string | null; avisos: string[] }> => {
      if (!token) return { ok: false, erro: "hr.convite.tokenInvalido", avisos: [] };
      setSubmetendo(true);
      try {
        const { data, error } = await supabase.functions.invoke("convite-admissao", {
          body: { action: "submeter", token, dados, assinatura_nome: assinaturaNome },
        });
        if (error || data?.error) {
          if (error) captureFlowError(error, "hr-convite-admissao-publico");
          return { ok: false, erro: String(data?.error ?? await getFriendlyErrorMessage(error)), avisos: [] };
        }
        return { ok: true, erro: null, avisos: (data?.avisos ?? []) as string[] };
      } catch (e) {
        captureFlowError(e, "hr-convite-admissao-publico");
        return { ok: false, erro: await getFriendlyErrorMessage(e), avisos: [] };
      } finally {
        setSubmetendo(false);
      }
    },
    [token],
  );

  return { estado, loading, erroInicial, submetendo, submeter };
}
