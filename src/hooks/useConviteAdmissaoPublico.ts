/**
 * O lado PUBLICO do convite de admissao: ler o estado do token, gravar o
 * rascunho e submeter o formulario. Sem sessao nenhuma -- e por isso que fala
 * com a Edge Function `convite-admissao` (accoes "estado" / "rascunho" /
 * "submeter"), nunca directamente com a base: essas RPCs so `service_role`
 * as executa.
 *
 * OS MOTIVOS DE RECUSA CHEGAM EM `error.context`
 * ------------------------------------------------
 * Quando a Edge Function responde 401/409/429, o supabase-js devolve
 * `data = null` e o corpo `{ error: "convite_expirado" }` fica na `Response`
 * de `error.context`. Ler so `data?.error` perdia sempre o motivo e mostrava a
 * mensagem generica; `corpoDeErroEdge` le os dois sitios.
 *
 * A GRAVACAO DE RASCUNHO NUNCA INTERROMPE O PREENCHIMENTO
 * --------------------------------------------------------
 * A accao "rascunho" existe dos dois lados (Edge Function +
 * `rpc_hr_convite_admissao_rascunho`), mas uma falha a gravar e so
 * registada, nunca mostrada: um rascunho e uma conveniencia e nao pode
 * parar quem esta a preencher o formulario.
 *
 * O token em si NUNCA fica em `localStorage`/`sessionStorage`: vive so na
 * URL e no estado deste hook, e desaparece quando a aba fecha. Tambem nunca
 * vai para o registo de erros, nem o corpo das respostas.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import {
  corpoDeErroEdge,
  motivoDoCodigo,
  type CorpoErroEdge,
  type MotivoConvite,
} from "@/lib/hr/errosAdmissao";

export interface ConviteEstado {
  pessoa_nome: string | null;
  email_pessoal: string | null;
  /** O NIF ja registado na ficha, por inteiro (decisao de produto: e o que o documento diz). */
  nif: string | null;
  niss_ultimos4: string | null;
  conta_ultimos4: string | null;
  formato_conta: string | null;
  rascunho: Record<string, unknown> | null;
  /** Ate quando o link serve (ISO). */
  valid_until: string;
  /**
   * Os codigos que a pessoa TEM de preencher no convite (posicao "convite",
   * so origem "pessoa"), tal como `rpc_hr_convite_admissao_estado` os devolve
   * para ESTA organizacao. Um array VAZIO e uma resposta valida (nada na
   * posicao convite). `null`/ausente so em convites que a RPC ainda nao anota
   * (ou numa falha): o ecra cai na lista estatica de `admissaoObrigatorios.ts`
   * apenas nesse caso, ver `obrigatoriosResolvidos`.
   */
  campos_obrigatorios: { codigo: string; condicional: boolean }[] | null;
}

export interface DadosSubmissaoConvite {
  [campo: string]: unknown;
}

export type ResultadoSubmissao =
  | { ok: true; avisos: string[]; corpoErro?: undefined }
  | { ok: false; corpoErro: CorpoErroEdge; avisos: string[] };

/**
 * O registo de erros recebe so o tipo de falha, nunca o objecto original: o
 * `FunctionsHttpError` traz a `Response` e o corpo, e o corpo e a fronteira
 * onde o token e os dados da pessoa viajam.
 */
function erroSemDados(origem: string, codigo: string | null): Error {
  return new Error(`${origem}: ${codigo ?? "falha_de_rede"}`);
}

/** Recusas de negocio nao sao defeitos: so o inesperado ou sem corpo vai para o registo. */
function eDefeito(codigo: string | null): boolean {
  return codigo === null || codigo === "erro_inesperado";
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
        setErroInicial("convite_invalido");
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
          const corpo = await corpoDeErroEdge(error, data);
          const codigo = corpo?.error ?? null;
          if (eDefeito(codigo)) {
            captureFlowError(erroSemDados("estado", codigo), "hr-convite-admissao-publico");
          }
          if (cancelado) return;
          setErroInicial(codigo ?? "convite_invalido");
          setEstado(null);
          return;
        }
        setEstado((data?.convite ?? null) as ConviteEstado | null);
      } catch {
        if (cancelado) return;
        captureFlowError(erroSemDados("estado", null), "hr-convite-admissao-publico");
        setErroInicial("convite_invalido");
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
          const corpo = await corpoDeErroEdge(error, data);
          captureFlowError(
            erroSemDados("rascunho", corpo?.error ?? null),
            "hr-convite-admissao-rascunho",
          );
        }
      } catch {
        captureFlowError(erroSemDados("rascunho", null), "hr-convite-admissao-rascunho");
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

  /**
   * Devolve o CORPO do erro (e nao uma mensagem): quem traduz e o ecra, que
   * conhece a lingua. Um motivo de convite (`convite_*`) faz o ecra trocar para
   * o cartao de link invalido -- o link ja nao serve, insistir nao adianta.
   */
  const submeter = useCallback(
    async (dados: DadosSubmissaoConvite, assinaturaNome: string): Promise<ResultadoSubmissao> => {
      if (!token) return { ok: false, corpoErro: { error: "convite_invalido" }, avisos: [] };
      setSubmetendo(true);
      try {
        const { data, error } = await supabase.functions.invoke("convite-admissao", {
          // A conta bancaria vai DENTRO de `dados` desde 28/11: e chave do
          // contrato como as outras, nao um campo a parte que ninguem gravava.
          body: { action: "submeter", token, dados, assinatura_nome: assinaturaNome },
        });
        if (error || data?.error) {
          const corpo = (await corpoDeErroEdge(error, data)) ?? { error: "erro_inesperado" };
          if (eDefeito(corpo.error ?? null)) {
            captureFlowError(erroSemDados("submeter", corpo.error ?? null), "hr-convite-admissao-publico");
          }
          if (typeof corpo.error === "string" && corpo.error.startsWith("convite_")) {
            setErroInicial(corpo.error);
          }
          return { ok: false, corpoErro: corpo, avisos: [] };
        }
        return { ok: true, avisos: (data?.avisos ?? []) as string[] };
      } catch {
        captureFlowError(erroSemDados("submeter", null), "hr-convite-admissao-publico");
        return { ok: false, corpoErro: { error: "erro_inesperado" }, avisos: [] };
      } finally {
        setSubmetendo(false);
      }
    },
    [token],
  );

  // O motivo so existe quando o link ja nao serve: nasce do codigo guardado.
  const motivo: MotivoConvite | null = erroInicial ? motivoDoCodigo(erroInicial) : null;

  return {
    estado,
    loading,
    erroInicial,
    motivo,
    submetendo,
    submeter,
    gravarRascunho,
    gravarRascunhoAoFechar,
  };
}
