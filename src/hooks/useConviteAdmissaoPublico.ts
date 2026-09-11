/**
 * O lado PUBLICO do convite de admissao: ler o estado do token, gravar o
 * rascunho e submeter o formulario. Sem sessao nenhuma -- e por isso que fala
 * com a Edge Function `convite-admissao` (accoes "estado" / "rascunho" /
 * "submeter"), nunca directamente com a base: essas RPCs so `service_role`
 * as executa.
 *
 * A GRAVACAO DE RASCUNHO NUNCA INTERROMPE O PREENCHIMENTO
 * --------------------------------------------------------
 * A accao "rascunho" existe dos dois lados (Edge Function +
 * `rpc_hr_convite_admissao_rascunho`), mas uma falha a gravar e so
 * registada, nunca mostrada: um rascunho e uma conveniencia e nao pode
 * parar quem esta a preencher o formulario.
 *
 * O token em si NUNCA fica em `localStorage`/`sessionStorage`: vive so na
 * URL e no estado deste hook, e desaparece quando a aba fecha.
 */
import { useCallback, useEffect, useRef, useState } from "react";
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

  // Guarda o token mais recente para a versao "sincrona" (pagehide), que nao
  // pode depender de recriar o callback a cada tecla.
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  /**
   * Gravar o rascunho, em segundo plano. NUNCA lanca -- uma falha aqui e so
   * registada, nunca mostrada a quem preenche o formulario.
   */
  const gravarRascunho = useCallback(
    async (rascunho: Record<string, unknown>) => {
      if (!token) return;
      try {
        const { data, error } = await supabase.functions.invoke("convite-admissao", {
          body: { action: "rascunho", token, rascunho },
        });
        if (error || data?.error) {
          captureFlowError(error ?? new Error(String(data?.error)), "hr-convite-admissao-rascunho");
        }
      } catch (e) {
        captureFlowError(e, "hr-convite-admissao-rascunho");
      }
    },
    [token],
  );

  /**
   * A mesma gravacao, mas disparada a fechar a aba (`pagehide` /
   * `visibilitychange`) -- por isso nao pode ser `async/await` bloqueante
   * nem usar `sendBeacon` (que nao deixa escolher o cabecalho `apikey`). Um
   * `fetch` com `keepalive: true` sobrevive ao descarregamento da pagina; o
   * pedido e disparado e esquecido, sem tratar resposta nem erro.
   */
  const gravarRascunhoAoFechar = useCallback((rascunho: Record<string, unknown>) => {
    const tokenActual = tokenRef.current;
    if (!tokenActual) return;
    try {
      const base = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
      const anonKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "");
      if (!base || !anonKey) return;
      void fetch(`${base}/functions/v1/convite-admissao`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ action: "rascunho", token: tokenActual, rascunho }),
        keepalive: true,
      });
    } catch {
      // Best-effort: a aba esta a fechar, nao ha a quem reportar.
    }
  }, []);

  const submeter = useCallback(
    async (
      dados: DadosSubmissaoConvite,
      assinaturaNome: string,
    ): Promise<{ ok: boolean; erro: string | null; avisos: string[] }> => {
      if (!token) return { ok: false, erro: "hr.convite.tokenInvalido", avisos: [] };
      setSubmetendo(true);
      try {
        const { data, error } = await supabase.functions.invoke("convite-admissao", {
          // A conta bancaria vai DENTRO de `dados` desde 28/11: e chave do
          // contrato como as outras, nao um campo a parte que ninguem gravava.
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

  return {
    estado,
    loading,
    erroInicial,
    submetendo,
    submeter,
    gravarRascunho,
    gravarRascunhoAoFechar,
  };
}
