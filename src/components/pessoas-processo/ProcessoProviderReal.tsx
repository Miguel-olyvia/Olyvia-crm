// O processo (orçamento, proposta e contrato) na ficha REAL. O botão do «A fazer» de um negócio abre o ecrã real da app que faz o passo e liga o
// resultado ao negócio: criar o orçamento e a proposta abre o editor e o diálogo que a app já tem (`PainelOrcamentoReal`, `PainelPropostaReal`);
// enviar e responder à proposta, criar o contrato e assiná-lo vão por ligação ao ecrã da app com `?voltar=` para regressar à ficha (o contrato
// novo volta ligado por `useLigarAoVoltar`); ganhar já não tem passo aqui (o ganho é o fecho do negócio, no detalhe). Os passos que o exemplo simula (verificar o orçamento, a Direção)
// não existem em modo real, e o passo «Fazer o levantamento» de um negócio é do P3: um passo que a ficha não sabe executar não tem botão
// (`podeExecutar`). O painel «Visita e levantamento» (menu «Mais» da ficha) abre daqui e grava na base (`PainelVisitaLevantamentoReal`) a quem pode
// editar a ficha. Sem as mutações da ficha real (o exemplo) não faz nada: os filhos ficam como estavam.
//
// RISCO LATENTE (partilhado com a Mudelar, por isso NÃO alterado aqui): «criar contrato» abre `/client-contracts?newContract=true&proposalId=`
// e o seletor de propostas dessa página só lista as propostas com `status` em approved, accepted, sent e draft (`ClientContracts.tsx`, a
// consulta «proposals-for-contracts»). Uma organização cujas etapas de proposta tenham nome em português («aceite», «enviada») grava esse
// nome em `proposals.status`: a proposta aceite não entra na lista, o seletor fica vazio e o botão de criar fica desativado (agora com uma
// mensagem a explicar). Não confirmado na base: ver os valores de `proposals.status` que cada organização grava antes de ligar isto a produção.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { adaptarPessoa } from "@/hooks/pessoas/adaptarFichaPessoa";
import { contratoVivo, orcamentoParaProposta, propostaAceite, propostaViva, temPropostaEnviadaOuAceite } from "@/hooks/pessoas/documentosDoNegocio";
import type { FichaDb, NegocioFichaDb } from "@/hooks/pessoas/fichaTipos";
import { hojeLisboa } from "@/hooks/pessoas/tempoLisboa";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useTranslation } from "@/hooks/useTranslation";
import { enderecoDeRegresso, ligacaoComVoltar } from "@/lib/voltarParaPessoas";
import { useFechoV4 } from "@/components/negocio-metas/bandeiraFecho";
import { useMutacoesDaFicha } from "@/components/negocio-metas/mutacoesNegocio";
import { MarcarVisitaProvider } from "@/components/pessoas/MarcarVisita";
import type { AberturaVisita } from "@/components/pessoas/marcarVisitaContexto";
import { moradaDaLead } from "@/components/pessoas/moradaVisita";
import { passoDoItem } from "@/components/pessoas/processo/passosProcesso";
import { ProcessoContext, type ProcessoValor } from "@/components/pessoas/processo/processoContexto";
import type { ItemProcesso } from "@/components/pessoas/processo/tiposProcesso";
import type { NegocioDoOrcamento } from "./PainelOrcamentoReal";
import type { NegocioDaProposta } from "./PainelPropostaReal";

// Os editores de orçamentos e de propostas são ecrãs enormes: só se carregam quando se abrem (a ficha não os paga a quem não os usa).
const PainelOrcamentoReal = lazy(() => import("./PainelOrcamentoReal").then((m) => ({ default: m.PainelOrcamentoReal })));
const PainelPropostaReal = lazy(() => import("./PainelPropostaReal").then((m) => ({ default: m.PainelPropostaReal })));
// O painel «Visita e levantamento» (formulário, perguntas da base e gravação) também só se carrega quando se abre pela primeira vez.
const PainelVisitaLevantamentoReal = lazy(() => import("./PainelVisitaLevantamentoReal").then((m) => ({ default: m.PainelVisitaLevantamentoReal })));

type TipoDocumento = "orcamento" | "proposta" | "contrato";
type Painel = "orcamento" | "proposta";

/** O que um passo faz: abre um painel nesta ficha, ou leva a um ecrã da app (o destino ainda sem `?voltar=`). */
type Plano = { tipo: "painel"; painel: Painel; negocio: NegocioFichaDb } | { tipo: "ir"; destino: string; negocio: NegocioFichaDb };

const codificar = encodeURIComponent;
const SEM_EFEITO = (): void => undefined;

/** Uma visita da ficha que ainda conta (não está cancelada): a base marca as canceladas com `cancelada` ou o estado `cancelled`. */
const visitaViva = (v: { status: string; cancelada?: boolean }): boolean => v.cancelada !== true && v.status !== "cancelled";

/** O plano do passo de um item, ou `null` se a ficha real não o sabe executar (ou falta o documento ou a permissão que ele pede). */
// `fechoV4`: o contrato nasce dentro do negócio (`&negocio=` no endereço) e um negócio que fecha na proposta não oferece contratos.
function planear(item: ItemProcesso, ficha: FichaDb | null, permissoes?: readonly string[], fechoV4 = false): Plano | null {
  if (!ficha || item.tipo !== "negocio") return null;
  const negocio = ficha.negocios?.itens.find((n) => n.id === item.id);
  if (!negocio) return null;
  const editar = ficha.permissoes.editar === true;
  // Criar um documento pede pessoas.edit E a permissão do documento. Sem a lista (a página ainda não a leu) nada se restringe: a base decide.
  const podeCriar = (codigo: string): boolean => editar && (permissoes === undefined || permissoes.includes(codigo));
  switch (passoDoItem(item).id) {
    case "criarOrcamento":
      return podeCriar("quotes.create") ? { tipo: "painel", painel: "orcamento", negocio } : null;
    case "criarProposta":
      return podeCriar("proposals.create") && orcamentoParaProposta(negocio) !== null ? { tipo: "painel", painel: "proposta", negocio } : null;
    case "enviarProposta":
    case "registarRespostaCliente": {
      const proposta = propostaViva(negocio);
      return proposta ? { tipo: "ir", destino: `/proposals?open=${codificar(proposta.id)}`, negocio } : null;
    }
    case "criarContrato": {
      const proposta = propostaAceite(negocio);
      if (fechoV4 && negocio.fecho === "proposta") return null;
      const nasceLigado = fechoV4 ? `&negocio=${codificar(negocio.id)}` : "";
      return podeCriar("client_contracts.create") && proposta ? { tipo: "ir", destino: `/client-contracts?newContract=true&proposalId=${codificar(proposta.id)}${nasceLigado}`, negocio } : null;
    }
    case "registarAssinatura": {
      const contrato = contratoVivo(negocio);
      return contrato ? { tipo: "ir", destino: `/client-contracts?open=${codificar(contrato.id)}`, negocio } : null;
    }
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

/** O que se vê (e se ouve) enquanto o painel «Visita e levantamento» carrega à primeira abertura: sem isto o clique no menu parecia morto. */
function AbrindoPainel() {
  const { t } = useTranslation();
  return <p role="status" className="sr-only">{t("pessoasPagina.process.visitSurvey.loading")}</p>;
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
  const fechoV4 = useFechoV4();
  const [aberto, setAberto] = useState<{ painel: Painel; negocio: string; pessoa: string } | null>(null);
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  // As permissões do fecho (criar orçamento, proposta e contrato): sem a lista nada se restringe; a base decide.
  const permissoesFecho = fonte.modo === "real" ? fonte.permissoesFecho : undefined;
  // Trocar de pessoa (ou fechar a ficha) larga o painel: sem isto voltar à pessoa em que ele se abriu voltava a abri-lo.
  const pessoaDaFicha = ficha?.pessoa.id ?? null;
  // O painel «Visita e levantamento»: `pessoa` é a de quem está aberto (`null` fechado) e `n` conta as aberturas (0: nunca abriu, e nada se monta).
  const [visita, setVisita] = useState<{ pessoa: string | null; n: number }>({ pessoa: null, n: 0 });
  const origemDoFoco = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setAberto((atual) => (atual !== null && atual.pessoa !== pessoaDaFicha ? null : atual));
    setVisita((atual) => (atual.pessoa !== null && atual.pessoa !== pessoaDaFicha ? { ...atual, pessoa: null } : atual));
  }, [pessoaDaFicha]);
  // Só quem pode editar a ficha vê o item «Visita e levantamento»: visitas e levantamento escrevem-se na pessoa (quem só pode criar recebe recusa).
  // Uma pessoa perdida ou com a abordagem encerrada não: abrir não faria nada (`abrirVisitaLevantamento` recusa), e o item não pode estar lá a fingir.
  const pessoaFechada = useMemo(() => {
    if (!ficha) return false;
    const pessoa = adaptarPessoa(ficha, hojeLisboa());
    return !!pessoa.perdida || !!pessoa.encerrada;
  }, [ficha]);
  const podeVisita = organizationId !== null && ficha?.permissoes.editar === true && !pessoaFechada;

  // O diálogo de marcar visita (ligado à base), montado uma vez por ficha: serve o botão «Marcar visita» de um negócio. Completa a abertura com o que o
  // botão não sabe (a morada da lead e o responsável, que dá o recurso por omissão) e diz que a pessoa já tem uma visita (então é uma revisita).
  const completar = useMemo(() => {
    if (!ficha) return undefined;
    const moradaLead = moradaDaLead(adaptarPessoa(ficha, hojeLisboa()));
    const responsavel = ficha.pessoa.responsavel_id ?? null;
    return (a: AberturaVisita): AberturaVisita => ({ ...a, moradaLead: a.moradaLead ?? moradaLead, responsavelUserId: a.responsavelUserId ?? responsavel });
  }, [ficha]);
  const jaComVisita = useMemo(
    () => (ficha && (ficha.visitas?.itens ?? []).some(visitaViva) ? new Set([ficha.pessoa.id]) : undefined),
    [ficha],
  );

  const valor = useMemo<ProcessoValor>(() => {
    const ir = (destino: string, negocio: string): void => {
      if (ficha) navegar(ligacaoComVoltar(destino, enderecoDeRegresso(ficha.pessoa.id, negocio)));
    };
    const podeExecutar = (item: ItemProcesso): boolean => {
      const plano = planear(item, ficha, permissoesFecho, fechoV4);
      if (!plano || !organizationId) return false;
      return plano.tipo === "ir" || plano.painel !== "orcamento" || !!(ficha && origemDoOrcamento(ficha));
    };
    return {
      podeExecutar,
      executar: (item) => {
        const plano = planear(item, ficha, permissoesFecho, fechoV4);
        if (!plano || !ficha || !podeExecutar(item)) return;
        if (plano.tipo === "ir") ir(plano.destino, plano.negocio.id);
        else setAberto({ painel: plano.painel, negocio: plano.negocio.id, pessoa: ficha.pessoa.id });
      },
      abrirVisitaLevantamento: (pessoaId, origem) => {
        if (!ficha || !podeVisita || ficha.pessoa.id !== pessoaId) return;
        origemDoFoco.current = origem;
        setVisita((atual) => ({ pessoa: pessoaId, n: atual.n + 1 }));
      },
      comPainelVisita: podeVisita,
      abrirDocumento: (tipo, negocioId) => {
        const negocio = ficha?.negocios?.itens.find((n) => n.id === negocioId);
        const destino = negocio ? destinoDoDocumento(tipo, negocio) : null;
        if (destino) ir(destino, negocioId);
      },
    };
  }, [ficha, navegar, organizationId, podeVisita, permissoesFecho, fechoV4]);

  if (!mutacoes) return <>{children}</>;

  // Um painel aberto só vale para a pessoa em que se abriu (trocar de pessoa nunca deixa o painel de uma sobre a ficha de outra).
  const doPainel = ficha && aberto && aberto.pessoa === ficha.pessoa.id ? ficha.negocios?.itens.find((n) => n.id === aberto.negocio) : undefined;
  const fechar = (): void => setAberto(null);
  const devolverFoco = (): boolean => {
    const origem = origemDoFoco.current;
    origemDoFoco.current = null;
    if (!origem?.isConnected) return false;
    origem.focus();
    return true;
  };
  const origem = ficha ? origemDoOrcamento(ficha) : null;
  const orcamento: NegocioDoOrcamento | null = doPainel && aberto?.painel === "orcamento" && ficha && origem && organizationId
    ? { id: doPainel.id, nome: ficha.pessoa.nome ?? "", entityId: ficha.pessoa.id, organizationId, origem }
    : null;
  const proposta: NegocioDaProposta | null = doPainel && aberto?.painel === "proposta" && ficha
    ? { id: doPainel.id, entityId: ficha.pessoa.id, orcamentoId: orcamentoParaProposta(doPainel), propostaViva: temPropostaEnviadaOuAceite(doPainel) }
    : null;

  return (
    <ProcessoContext.Provider value={valor}>
      <MarcarVisitaProvider hoje={hojeLisboa()} aoMarcar={SEM_EFEITO} naBase jaComVisita={jaComVisita} completar={completar}>
        {children}
      </MarcarVisitaProvider>
      {orcamento && <Suspense fallback={null}><PainelOrcamentoReal negocio={orcamento} mutacoes={mutacoes} aoFechar={fechar} /></Suspense>}
      {proposta && <Suspense fallback={null}><PainelPropostaReal negocio={proposta} mutacoes={mutacoes} aoFechar={fechar} /></Suspense>}
      {ficha && visita.n > 0 && (
        <Suspense fallback={<AbrindoPainel />}>
          <PainelVisitaLevantamentoReal
            ficha={ficha} aberto={visita.pessoa !== null && visita.pessoa === ficha.pessoa.id} abertura={visita.n} aoDevolverFoco={devolverFoco}
            aoMudarAberto={(abre) => { if (!abre) setVisita((atual) => ({ ...atual, pessoa: null })); }}
          />
        </Suspense>
      )}
    </ProcessoContext.Provider>
  );
}
