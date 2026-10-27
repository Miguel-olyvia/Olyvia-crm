/**
 * O convite de admissão visto por quem o recebe (página pública), em memória. O token abre o formulário enquanto a
 * admissão a que pertence estiver «a preencher» e o login temporário (7 dias) servir; os outros estados (submetida,
 * contrato, expirada, revogada...) têm o seu ecrã no portal (`PortalFicha`, `PortalDocumentos`). O rascunho guarda-se na admissão e a submissão
 * não envia nada para lado nenhum: passa a admissão a «submetida» e a ficha fica bloqueada para a pessoa.
 *
 * SÓ PRÉ-VISUALIZAÇÃO (links de demonstração). NÃO há equivalente real a ligar: o hook real `@/hooks/useConviteAdmissaoPublico` do portal real
 * (V3a) não tem rascunho nem submissão, e a Edge `convite-admissao` responde 410 `portal_em_atualizacao` a `rascunho`, `submeter` e aos
 * anexos (`portalAntigoAtivo` nunca é ligado em `index.ts`). Os links reais usam `PortalReal`, que fala com a Edge.
 */
import { useCallback, useMemo, useState } from "react";
import { useFichaRh } from "@/components/rh-exemplo/dados/loja";
import { useGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { gravarRascunhoDoLink, submeterPeloLink } from "@/components/rh-exemplo/dados/accoesAdmissao";
import { useAdmissaoPublica } from "@/components/rh-exemplo/hooks/useAdmissaoPublica";
import { motivoDoCodigo, type CorpoErroEdge, type MotivoConvite } from "@/components/rh-exemplo/lib/errosAdmissao";
import type { AnexoConvite } from "@/components/rh-exemplo/lib/conviteAnexos";

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
  const campos = useGestao((g) => g.admissaoCampos);
  const [submetendo, setSubmetendo] = useState(false);
  const [erroRascunho, setErroRascunho] = useState<string | null>(null);
  const { admissao, vista, nome } = useAdmissaoPublica(token);
  const ficha = useFichaRh(admissao?.pessoaId);

  const valido = admissao !== null && vista === "preencher";

  const estado = useMemo<ConviteEstado | null>(() => {
    if (!valido || !admissao) return null;
    return {
      pessoa_nome: nome,
      email_pessoal: admissao.emailConvite || ficha?.pessoa.email_pessoal || null,
      nif: null,
      niss_ultimos4: null,
      conta_ultimos4: null,
      formato_conta: null,
      rascunho: Object.keys(admissao.rascunho).length > 0 ? admissao.rascunho : null,
      valid_until: admissao.login.expiraEm,
      campos_obrigatorios: campos
        .filter((c) => c.origem === "pessoa" && c.posicao === "convite")
        .map((c) => ({ codigo: c.codigo, condicional: c.condicional })),
      anexos: [],
    };
  }, [valido, admissao, nome, ficha, campos]);

  // Gravar sem token que resolva (ou sem admissão) não guarda nada: diz-se, em vez de parecer que ficou guardado.
  const gravarRascunho = useCallback(async (rascunho: Record<string, unknown>): Promise<void> => {
    setErroRascunho(gravarRascunhoDoLink(token, rascunho) ? null : "convite_invalido");
  }, [token]);

  const gravarRascunhoAoFechar = useCallback((rascunho: Record<string, unknown>): void => {
    setErroRascunho(gravarRascunhoDoLink(token, rascunho) ? null : "convite_invalido");
  }, [token]);

  const submeter = useCallback(
    async (dados: DadosSubmissaoConvite, _assinaturaNome: string): Promise<ResultadoSubmissao> => {
      setSubmetendo(true);
      try {
        await Promise.resolve();
        const resultado = submeterPeloLink(token, dados);
        // O motivo real da recusa segue para o ecrã (que o traduz); nunca um genérico que o esconde.
        return resultado.ok
          ? { ok: true, avisos: [] }
          : { ok: false, corpoErro: { error: resultado.erro }, avisos: [] };
      } catch {
        return { ok: false, corpoErro: { error: "erro_inesperado" }, avisos: [] };
      } finally {
        setSubmetendo(false);
      }
    },
    [token],
  );

  const erroInicial = valido ? null : "convite_invalido";
  const motivo: MotivoConvite | null = erroInicial ? motivoDoCodigo(erroInicial) : null;

  return {
    estado,
    loading: false,
    erroInicial,
    motivo,
    submetendo,
    erroRascunho,
    submeter,
    gravarRascunho,
    gravarRascunhoAoFechar,
  };
}
