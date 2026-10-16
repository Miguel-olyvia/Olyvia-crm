/**
 * As accoes do RH sobre um processo de admissao aberto: prolongar o acesso,
 * cancelar e reenviar o convite. Chamam a Edge Function `convite-admissao`
 * (accoes "prolongar", "cancelar" e "reenviar"), que corre as RPCs com o JWT do
 * RH: a permissao, a organizacao do processo e o estado em que a accao e
 * permitida sao decididos na base.
 *
 * REENVIAR (V3a) manda o MESMO link, sem mudar a validade nem o estado: o
 * pedido leva so o convite e a organizacao (o ator sai do JWT, na Edge). O token
 * nunca sai da Edge, e por isso nunca chega aqui. Regenerar o link e da V3b.
 *
 * O pedido leva a organizacao activa (`organization_id`): a base recusa se nao
 * for a do processo. O ecra so recebe um TEXTO traduzido -- nunca o codigo em
 * bruto, nunca `error.details` -- e o Sentry so recebe DEFEITOS (sem codigo
 * legivel, ou `erro_inesperado`), como um `Error` sintetico sem corpo.
 */
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { chaveDeErroAdmissao, codigoDeErroEdge } from "@/lib/hr/errosAdmissao";
import { MOTIVO_CANCELAR_MAX } from "@/lib/hr/estadoAdmissao";
import { getLocalizedFallback } from "@/utils/friendlyError";

/** Forma plana (como `ResultadoConvite`): sem `strictNullChecks` uma uniao por `ok` nao estreita. */
export interface ResultadoAccaoConvite {
  ok: boolean;
  /** A nova validade (ISO), so em `prolongar`. */
  validUntil: string | null;
  /** O codigo da recusa, para quem precisar de decidir; NUNCA se mostra. */
  codigo: string | null;
  /** O texto traduzido para o RH; `null` quando correu bem. */
  erro: string | null;
}

/** `demasiadas_tentativas` e o limite da Edge Function; diz o mesmo que `limite_excedido`, o da base. */
const CODIGOS_COM_O_TEXTO_DO_LIMITE: ReadonlySet<string> = new Set(["demasiadas_tentativas"]);

type Accao = "prolongar" | "cancelar" | "reenviar";

/**
 * Ao reenviar, um link revogado ou expirado diz-se ao RH (o texto de `chaveDeErroAdmissao` fala com quem recebeu o
 * convite: "peca um novo link ao RH").
 */
const CHAVE_AO_REENVIAR: Readonly<Record<string, string>> = {
  convite_revogado: "hr.convite.reenviar.revogado",
  convite_expirado: "hr.convite.reenviar.expirado",
};

function textoDoCodigo(codigo: string | null, accao: Accao): string {
  if (codigo && CODIGOS_COM_O_TEXTO_DO_LIMITE.has(codigo)) {
    return getLocalizedFallback("hr.convite.erro.limiteExcedido");
  }
  if (accao === "reenviar" && codigo && CHAVE_AO_REENVIAR[codigo]) {
    return getLocalizedFallback(CHAVE_AO_REENVIAR[codigo]);
  }
  const entrada = codigo ? chaveDeErroAdmissao(codigo) : null;
  // `pedido_invalido`, os codigos de token e os desconhecidos: texto generico.
  return getLocalizedFallback(entrada ? entrada.chave : "hr.convite.erro.accaoFalhou");
}

function falha(codigo: string | null, accao: Accao): ResultadoAccaoConvite {
  return { ok: false, validUntil: null, codigo, erro: textoDoCodigo(codigo, accao) };
}

function eDefeito(codigo: string | null): boolean {
  return codigo === null || codigo === "erro_inesperado";
}

export function useAcoesConviteAdmissao() {
  const [aExecutar, setAExecutar] = useState(false);
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;

  const executar = useCallback(
    async (accao: Accao, corpo: Record<string, unknown>): Promise<ResultadoAccaoConvite> => {
      if (!organizationId) return falha(null, accao);
      setAExecutar(true);
      try {
        const { data, error } = await supabase.functions.invoke("convite-admissao", {
          body: { action: accao, organization_id: organizationId, ...corpo },
        });
        if (error || data?.error) {
          const codigo = await codigoDeErroEdge(error, data);
          if (eDefeito(codigo)) {
            captureFlowError(new Error(`${accao}: ${codigo ?? "falha_de_rede"}`), `hr-convite-admissao-${accao}`);
          }
          return falha(codigo, accao);
        }
        const validade = data?.valid_until;
        return {
          ok: true,
          validUntil: typeof validade === "string" && validade !== "" ? validade : null,
          codigo: null,
          erro: null,
        };
      } catch {
        captureFlowError(new Error(`${accao}: falha_de_rede`), `hr-convite-admissao-${accao}`);
        return falha(null, accao);
      } finally {
        setAExecutar(false);
      }
    },
    [organizationId],
  );

  const prolongar = useCallback(
    (conviteId: string, dias: number) => executar("prolongar", { convite_id: conviteId, dias }),
    [executar],
  );

  const cancelar = useCallback(
    async (conviteId: string, motivo: string): Promise<ResultadoAccaoConvite> => {
      const limpo = motivo.trim();
      // O motivo e obrigatorio: nem chega a Edge Function sem ele.
      if (limpo === "" || limpo.length > MOTIVO_CANCELAR_MAX) return falha("motivo_invalido", "cancelar");
      return executar("cancelar", { convite_id: conviteId, motivo: limpo });
    },
    [executar],
  );

  const reenviar = useCallback((conviteId: string) => executar("reenviar", { convite_id: conviteId }), [executar]);

  return { prolongar, cancelar, reenviar, aExecutar };
}
