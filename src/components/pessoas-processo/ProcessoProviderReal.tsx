// O processo (orçamento, proposta e contrato) na ficha REAL. O botão do «A fazer» de um negócio abre o ecrã real da app que faz o passo e liga o
// resultado ao negócio: criar o orçamento e a proposta abre o editor e o diálogo que a app já tem (`PainelOrcamentoReal`, `PainelPropostaReal`);
// enviar e responder à proposta, criar o contrato e assiná-lo vão por ligação ao ecrã da app com `?voltar=` para regressar à ficha (o contrato
// novo volta ligado por `useLigarAoVoltar`); ganhar abre o diálogo de ganhar. Os passos que o exemplo simula (verificar o orçamento, a Direção)
// não existem em modo real, e o levantamento é do P5: um passo que a ficha não sabe executar não tem botão (`podeExecutar`). Sem as
// mutações da ficha real (o exemplo) não faz nada: os filhos ficam como estavam.
//
// RISCO LATENTE (partilhado com a Mudelar, por isso NÃO alterado aqui): «criar contrato» abre `/client-contracts?newContract=true&proposalId=`
// e o seletor de propostas dessa página só lista as propostas com `status` em approved, accepted, sent e draft (`ClientContracts.tsx`, a
// consulta «proposals-for-contracts»). Uma organização cujas etapas de proposta tenham nome em português («aceite», «enviada») grava esse
// nome em `proposals.status`: a proposta aceite não entra na lista, o seletor fica vazio e o botão de criar fica desativado (agora com uma
// mensagem a explicar). Não confirmado na base: ver os valores de `proposals.status` que cada organização grava antes de ligar isto a produção.
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { adaptarNegocios } from "@/hooks/pessoas/adaptarNegociosFicha";
import { contratoVivo, orcamentoParaProposta, propostaAceite, propostaViva } from "@/hooks/pessoas/documentosDoNegocio";
import type { FichaDb, NegocioFichaDb } from "@/hooks/pessoas/fichaTipos";
import { hojeLisboa } from "@/hooks/pessoas/tempoLisboa";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { enderecoDeRegresso, ligacaoComVoltar } from "@/lib/voltarParaPessoas";
import { GanharNegocioDialogo } from "@/components/negocio-metas/GanharNegocioDialogo";
import { useMutacoesDaFicha } from "@/components/negocio-metas/mutacoesNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { useAvisarNegocio } from "@/components/negocio-metas/useAvisarNegocio";
import { passoDoItem } from "@/components/pessoas/processo/passosProcesso";
import { ProcessoContext, type ProcessoValor } from "@/components/pessoas/processo/processoContexto";
import type { ItemProcesso } from "@/components/pessoas/processo/tiposProcesso";
import type { NegocioDoOrcamento } from "./PainelOrcamentoReal";
import type { NegocioDaProposta } from "./PainelPropostaReal";

// Os editores de orçamentos e de propostas são ecrãs enormes: só se carregam quando se abrem (a ficha não os paga a quem não os usa).
const PainelOrcamentoReal = lazy(() => import("./PainelOrcamentoReal").then((m) => ({ default: m.PainelOrcamentoReal })));
const PainelPropostaReal = lazy(() => import("./PainelPropostaReal").then((m) => ({ default: m.PainelPropostaReal })));

type TipoDocumento = "orcamento" | "proposta" | "contrato";
type Painel = "orcamento" | "proposta" | "ganhar";

/** O que um passo faz: abre um painel nesta ficha, ou leva a um ecrã da app (o destino ainda sem `?voltar=`). */
type Plano = { tipo: "painel"; painel: Painel; negocio: NegocioFichaDb } | { tipo: "ir"; destino: string; negocio: NegocioFichaDb };

const codificar = encodeURIComponent;

/** O plano do passo de um item, ou `null` se a ficha real não o sabe executar (ou falta o documento ou a permissão que ele pede). */
function planear(item: ItemProcesso, ficha: FichaDb | null): Plano | null {
  if (!ficha || item.tipo !== "negocio") return null;
  const negocio = ficha.negocios?.itens.find((n) => n.id === item.id);
  if (!negocio) return null;
  const editar = ficha.permissoes.editar === true;
  switch (passoDoItem(item).id) {
    case "criarOrcamento":
      return editar ? { tipo: "painel", painel: "orcamento", negocio } : null;
    case "criarProposta":
      return editar && orcamentoParaProposta(negocio) !== null ? { tipo: "painel", painel: "proposta", negocio } : null;
    case "enviarProposta":
    case "registarRespostaCliente": {
      const proposta = propostaViva(negocio);
      return proposta ? { tipo: "ir", destino: `/proposals?open=${codificar(proposta.id)}`, negocio } : null;
    }
    case "criarContrato": {
      const proposta = propostaAceite(negocio);
      return editar && proposta ? { tipo: "ir", destino: `/client-contracts?newContract=true&proposalId=${codificar(proposta.id)}`, negocio } : null;
    }
    case "registarAssinatura": {
      const contrato = contratoVivo(negocio);
      return contrato ? { tipo: "ir", destino: `/client-contracts?open=${codificar(contrato.id)}`, negocio } : null;
    }
    case "ganharNegocio":
      return editar ? { tipo: "painel", painel: "ganhar", negocio } : null;
    default:
      return null;
  }
}

/** A ficha a que o orçamento fica ligado: a lead, ou o cliente quando a pessoa já o é; `null` se a pessoa não tem nenhuma das duas. */
function origemDoOrcamento(ficha: FichaDb): NegocioDoOrcamento["origem"] | null {
  const { papel, client_id: cliente, lead_id: lead } = ficha.pessoa;
  if (papel === "cliente" && cliente) return { tipo: "client", id: cliente };
  if (lead) return { tipo: "lead", id: lead };
  return cliente ? { tipo: "client", id: cliente } : null;
}

/** O destino de um documento do negócio no ecrã da app. */
function destinoDoDocumento(tipo: TipoDocumento, negocio: NegocioFichaDb): string | null {
  if (tipo === "orcamento") {
    const id = orcamentoParaProposta(negocio);
    return id ? `/quotes?open=${codificar(id)}` : null;
  }
  const id = tipo === "proposta" ? propostaViva(negocio)?.id : contratoVivo(negocio)?.id;
  if (!id) return null;
  return tipo === "proposta" ? `/proposals?open=${codificar(id)}` : `/client-contracts?open=${codificar(id)}`;
}

interface ProcessoProviderRealProps {
  /** A ficha da pessoa aberta (a que a base devolveu). */
  ficha: FichaDb | null;
  children: ReactNode;
}

export function ProcessoProviderReal({ ficha, children }: ProcessoProviderRealProps) {
  const fonte = useFontePessoas();
  const mutacoes = useMutacoesDaFicha();
  const navegar = useNavigate();
  const avisar = useAvisarNegocio();
  const [aberto, setAberto] = useState<{ painel: Painel; negocio: string; pessoa: string } | null>(null);
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  // Trocar de pessoa (ou fechar a ficha) larga o painel: sem isto voltar à pessoa em que ele se abriu voltava a abri-lo.
  const pessoaDaFicha = ficha?.pessoa.id ?? null;
  useEffect(() => {
    setAberto((atual) => (atual !== null && atual.pessoa !== pessoaDaFicha ? null : atual));
  }, [pessoaDaFicha]);

  const valor = useMemo<ProcessoValor>(() => {
    const ir = (destino: string, negocio: string): void => {
      if (ficha) navegar(ligacaoComVoltar(destino, enderecoDeRegresso(ficha.pessoa.id, negocio)));
    };
    const podeExecutar = (item: ItemProcesso): boolean => {
      const plano = planear(item, ficha);
      if (!plano || !organizationId) return false;
      return plano.tipo === "ir" || plano.painel !== "orcamento" || !!(ficha && origemDoOrcamento(ficha));
    };
    return {
      podeExecutar,
      executar: (item) => {
        const plano = planear(item, ficha);
        if (!plano || !ficha || !podeExecutar(item)) return;
        if (plano.tipo === "ir") ir(plano.destino, plano.negocio.id);
        else setAberto({ painel: plano.painel, negocio: plano.negocio.id, pessoa: ficha.pessoa.id });
      },
      abrirVisitaLevantamento: () => undefined,
      abrirDocumento: (tipo, negocioId) => {
        const negocio = ficha?.negocios?.itens.find((n) => n.id === negocioId);
        const destino = negocio ? destinoDoDocumento(tipo, negocio) : null;
        if (destino) ir(destino, negocioId);
      },
    };
  }, [ficha, navegar, organizationId]);

  if (!mutacoes) return <>{children}</>;

  // Um painel aberto só vale para a pessoa em que se abriu (trocar de pessoa nunca deixa o painel de uma sobre a ficha de outra).
  const doPainel = ficha && aberto && aberto.pessoa === ficha.pessoa.id ? ficha.negocios?.itens.find((n) => n.id === aberto.negocio) : undefined;
  const fechar = (): void => setAberto(null);
  const origem = ficha ? origemDoOrcamento(ficha) : null;
  const orcamento: NegocioDoOrcamento | null = doPainel && aberto?.painel === "orcamento" && ficha && origem && organizationId
    ? { id: doPainel.id, nome: ficha.pessoa.nome ?? "", entityId: ficha.pessoa.id, organizationId, origem }
    : null;
  const proposta: NegocioDaProposta | null = doPainel && aberto?.painel === "proposta" && ficha
    ? { id: doPainel.id, entityId: ficha.pessoa.id, orcamentoId: orcamentoParaProposta(doPainel) }
    : null;
  const paraGanhar: NegocioMes | null = doPainel && aberto?.painel === "ganhar" && ficha
    ? adaptarNegocios(ficha, hojeLisboa(), fonte.modo === "real" ? fonte.momentoGanho : null).find((n) => n.id === doPainel.id && n.estadoReal === "aberto") ?? null
    : null;

  return (
    <ProcessoContext.Provider value={valor}>
      {children}
      {orcamento && <Suspense fallback={null}><PainelOrcamentoReal negocio={orcamento} mutacoes={mutacoes} aoFechar={fechar} /></Suspense>}
      {proposta && <Suspense fallback={null}><PainelPropostaReal negocio={proposta} mutacoes={mutacoes} aoFechar={fechar} /></Suspense>}
      <GanharNegocioDialogo negocio={paraGanhar} aoFechar={fechar} aoGanho={avisar} />
    </ProcessoContext.Provider>
  );
}
