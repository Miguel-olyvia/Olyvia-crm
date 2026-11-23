// 23/11 (pedido do dono): as versões de idioma do template no passo «Proposta» do negócio.
//  · A proposta real do negócio (a mesma leitura que o documento do passo usa), lida UMA vez por quem embrulha o passo.
//  · Os idiomas que o template do documento tem (idiomasDisponiveisProposta): com um só, nada aparece e tudo fica como sempre.
//  · A escolha (ver e enviar são a mesma: o que se vê na folha é o que vai para o portal): o que a proposta já tem gravado em
//    proposals.language, senão o último idioma usado com este template (localStorage, idiomaPreferido), senão o idioma base.
//  · Antes do envio ao portal, a escolha grava-se em proposals.language (o portal lê-a). Se a gravação não passar, NÃO se envia.
//    A base (RH, lida a 23/11): o UPDATE passa pela RLS «Users with permission can update proposals» (proposals.edit com âmbito) e
//    pelo gatilho fn_neg_documento_exigir_permissao (negocios.proposta.enviar, por a proposta ser de um negócio). Uma RLS que filtra
//    devolve 0 linhas sem erro: por isso o UPDATE pede as linhas de volta e 0 linhas é uma recusa.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEscolhaDeIdiomas } from "@/components/contracts/idiomaPreferido";
import { PREFIXO_PREFERENCIA_PROPOSTA, languageParaGravar } from "@/components/proposals/idiomaDaProposta";
import { loadProposalPortalData, type ProposalPortalData } from "@/components/proposals/proposalPortalData";
import { useDadosDaProposta, type TemplateDeAspeto } from "@/hooks/pessoas/useTemplatesDeDocumento";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import {
  idiomaBaseDoTemplate, idiomasDisponiveisProposta, ordenarPorRegisto, parseEscolha, serializarEscolha, type TemplatePropostaLike,
} from "@/lib/idiomaDocumento";

/* ------------------------------------------------------------------------------------------------ a proposta real */
export interface LeituraDaProposta { estado: "sem-proposta" | "a-ler" | "pronta" | "erro"; dados: ProposalPortalData | null; erro: string | null }

/** A proposta real (o documento do portal), lida pelo mesmo caminho do «Preview Portal». Sem id não lê. */
function usePropostaReal(propostaId: string | null): LeituraDaProposta {
  const [l, setL] = useState<LeituraDaProposta>({ estado: propostaId ? "a-ler" : "sem-proposta", dados: null, erro: null });
  useEffect(() => {
    if (!propostaId) { setL({ estado: "sem-proposta", dados: null, erro: null }); return; }
    let vivo = true;
    setL({ estado: "a-ler", dados: null, erro: null });
    loadProposalPortalData(propostaId)
      .then((dados) => { if (vivo) setL(dados?.proposal ? { estado: "pronta", dados, erro: null } : { estado: "sem-proposta", dados: null, erro: null }); })
      .catch((e: unknown) => {
        captureFlowError(e, "proposal-workflow");
        if (vivo) setL({ estado: "erro", dados: null, erro: e instanceof Error ? e.message : "erro desconhecido" });
      });
    return () => { vivo = false; };
  }, [propostaId]);
  return l;
}

/** A proposta real do negócio (proposals.negocio_id, a mais recente com número). Com `negocioId` null não lê nada. */
export function usePropostaDoPasso(negocioId: string | null): LeituraDaProposta {
  const dadosDaProposta = useDadosDaProposta(negocioId);
  return usePropostaReal(negocioId ? dadosDaProposta.data?.id ?? null : null);
}

/* ------------------------------------------------------------------------------------------------ a gravação */
export type FalhaDoIdioma = { tipo: "sem-utilizador" } | { tipo: "sem-permissao"; detalhe: string | null } | { tipo: "erro"; detalhe: string };

interface RespostaDaEscrita { data: unknown; error: { message: string; code?: string } | null }
interface TabelaParaAtualizar {
  update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => { select: (c: string) => PromiseLike<RespostaDaEscrita> } };
}
// `language` ainda não consta dos tipos gerados de proposals.
const proposals = (): TabelaParaAtualizar => (supabase as unknown as { from: (n: string) => TabelaParaAtualizar }).from("proposals");

/** Grava `language` na proposta `propostaId`. null = gravou; senão, porquê não. Nunca lança. */
export async function gravarIdiomaAntesDoEnvio(propostaId: string, language: string | null): Promise<FalhaDoIdioma | null> {
  try {
    const utilizador = await resolveCurrentBusinessUserId();
    if (!utilizador) return { tipo: "sem-utilizador" };
    await supabase.rpc("set_audit_context", { p_user_id: utilizador, p_source: "ui" });
    const { data, error } = await proposals().update({ language }).eq("id", propostaId).select("id");
    if (error) {
      captureFlowError(error, "proposal-lifecycle");
      return error.code === "42501" ? { tipo: "sem-permissao", detalhe: error.message } : { tipo: "erro", detalhe: error.message };
    }
    // a RLS de UPDATE filtra sem erro: 0 linhas é uma recusa (sem proposals.edit no âmbito desta proposta)
    if (!Array.isArray(data) || data.length === 0) return { tipo: "sem-permissao", detalhe: null };
    return null;
  } catch (e: unknown) {
    captureFlowError(e, "proposal-lifecycle");
    return { tipo: "erro", detalhe: e instanceof Error ? e.message : "erro desconhecido" };
  }
}

/* ------------------------------------------------------------------------------------------------ a escolha */
export interface VersoesDaPropostaNoPasso {
  leitura: LeituraDaProposta;
  /** Os idiomas que o template do documento tem (o base primeiro). */
  disponiveis: string[];
  temVersoes: boolean;
  escolha: string[];
  mudar: (escolha: string[]) => void;
  /** Os idiomas da folha: só com versões (sem versões, undefined: a folha fica como sempre). */
  idiomasDaFolha: string[] | undefined;
  aGravar: boolean;
  falha: FalhaDoIdioma | null;
  /** Corre antes do envio ao portal com o id real: true = pode enviar. Sem versões, true sem tocar em nada. */
  antesDeEnviar: (propostaId: string) => Promise<boolean>;
}

type ComId = TemplatePropostaLike & { id?: string | null };

/** `tpl`: o template escolhido no passo (com a cópia congelada por cima). Com a proposta real, manda o template dela. */
export function useVersoesDaPropostaNoPasso(negocioId: string | null, tpl: TemplateDeAspeto | null): VersoesDaPropostaNoPasso {
  const leitura = usePropostaDoPasso(negocioId);
  const doDocumento = ((leitura.dados ? leitura.dados.template : tpl) ?? null) as ComId | null;
  const disponiveis = useMemo(() => idiomasDisponiveisProposta(doDocumento), [doDocumento]);
  const base = idiomaBaseDoTemplate(doDocumento);
  const temVersoes = disponiveis.length >= 2;
  const preferida = useEscolhaDeIdiomas(doDocumento?.id ?? null, disponiveis, base, PREFIXO_PREFERENCIA_PROPOSTA);

  // o que a proposta tem gravado: undefined = não se sabe (ainda a ler, erro, sem proposta)
  const lida = leitura.dados?.proposal as { id?: string; language?: string | null } | undefined;
  const [gravadoAgora, setGravadoAgora] = useState<{ id: string; language: string | null } | null>(null);
  const gravado = (id: string | undefined): string | null | undefined => {
    if (!id) return undefined;
    if (gravadoAgora?.id === id) return gravadoAgora.language;
    return lida?.id === id && "language" in lida ? lida.language ?? null : undefined;
  };
  const gravadoDaLida = gravado(lida?.id);

  const [tocado, setTocado] = useState(false);
  const escolha = useMemo(() => {
    if (tocado || !gravadoDaLida) return preferida.escolha;
    const daProposta = ordenarPorRegisto(parseEscolha(gravadoDaLida)).filter((c) => disponiveis.includes(c));
    return daProposta.length > 0 ? daProposta : preferida.escolha;
  }, [tocado, gravadoDaLida, preferida.escolha, disponiveis]);

  const [aGravar, setAGravar] = useState(false);
  const [falha, setFalha] = useState<FalhaDoIdioma | null>(null);
  const { mudar: mudarPreferida } = preferida;
  const mudar = useCallback((nova: string[]) => { setTocado(true); setFalha(null); mudarPreferida(nova); }, [mudarPreferida]);

  const chaveEscolha = escolha.join("+");
  const antesDeEnviar = async (propostaId: string): Promise<boolean> => {
    if (!temVersoes) return true;
    const antes = gravado(propostaId);
    // a mesma escolha que a proposta já tem: nada a gravar (quem não pode editar propostas continua a poder enviar)
    if (antes !== undefined && serializarEscolha(parseEscolha(antes)) === serializarEscolha(parseEscolha(chaveEscolha))) return true;
    const language = languageParaGravar(escolha);
    setFalha(null);
    setAGravar(true);
    const f = await gravarIdiomaAntesDoEnvio(propostaId, language);
    setAGravar(false);
    if (f) { setFalha(f); return false; }
    setGravadoAgora({ id: propostaId, language });
    return true;
  };

  return {
    leitura, disponiveis, temVersoes, escolha, mudar, idiomasDaFolha: temVersoes ? escolha : undefined, aGravar, falha, antesDeEnviar,
  };
}
