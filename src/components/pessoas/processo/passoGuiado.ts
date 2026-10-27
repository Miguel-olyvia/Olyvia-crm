// O guia do passo seguinte, como dados: dado o item do processo (uma pessoa em abordagem ou um negócio) e o que o ecrã sabe, diz em que fase se
// está, o título e o subtítulo do passo, a lista de verificação da fase, o que o botão primário faz (ou porque não pode) e a fase anterior, só para
// ler. Funções puras, sem JSX nem hooks: nada aqui grava. O passo vem de `passoDoItem` (a regra não se duplica) e os textos são chaves de tradução.
import type { EstadoFase, FaseDoNegocio } from "../fasesDoNegocio";
import type { ResultadoContacto } from "../pessoasTipos";
import { passoDoItem } from "./passosProcesso";
import type { ItemProcesso, PassoProcesso } from "./tiposProcesso";

const G = "pessoasPagina.guia.";

export interface FaseGuia {
  id: string;
  rotuloChave: string;
  estado: EstadoFase;
}

/** Uma linha do resumo de um passo: o rótulo já traduzido e o valor (`null`: nada guardado, o ecrã diz «Por preencher»). */
export interface LinhaResumo {
  rotulo: string;
  valor: string | null;
}

export interface ItemChecklist {
  id: string;
  rotuloChave: string;
  feito: boolean;
  /** O que ficou registado neste passo, já em texto («Atendeu · interessado · 25/10/2026»); só existe quando o ecrã sabe o facto. */
  detalhe?: string;
  /** O resumo de leitura do passo, em rótulo e valor; só existe quando o ecrã sabe ler o passo (`DadosDoGuia.resumos`). */
  linhas?: readonly LinhaResumo[];
}

/** O que o ecrã sabe da pessoa e dos seus registos: só factos, para a lista de verificação (nada se inventa). */
export interface DadosDoGuia {
  nome: string;
  temContacto: boolean;
  /** Há campanha ou formulário de onde veio (os únicos campos de origem que a ficha tem). */
  temOrigem: boolean;
  /** Chamadas registadas. */
  chamadas: number;
  /** Visitas que ainda contam (não canceladas). */
  visitasAtivas: number;
  /** Levantamentos ligados ao negócio (ou, numa pessoa, os que tem). */
  levantamentos: number;
  /** O resultado da chamada mais recente (`null`/ausente: nao ha chamadas, ou o resultado nao se conhece). */
  ultimoResultado?: ResultadoContacto | null;
  /** O que ficou registado em cada item da lista, por id do item (`quemPede`, `chamada`...), já em texto; falta o que o ecrã não sabe. */
  detalhes?: Readonly<Record<string, string>>;
  /** O resumo de leitura de cada item (rótulo e valor), por id do item; um item sem entrada não tem resumo e cai no `detalhe`. */
  resumos?: Readonly<Record<string, readonly LinhaResumo[]>>;
}

export type EstadoAcaoGuia = "pronta" | "desativada" | "semAcao";

export interface AcaoGuiada {
  passo: PassoProcesso;
  estado: EstadoAcaoGuia;
  rotuloChave: string;
  /** Só numa ação desativada: a razão, como texto (nunca só a cor). */
  razaoChave?: string;
}

export interface FaseAnterior {
  id: string;
  rotuloChave: string;
  itens: ItemChecklist[];
}

/** Uma fase já feita, para ler: a lista dos seus passos com o que ficou registado em cada um. */
export interface FaseFeita extends FaseAnterior {
  estado: "feita";
}

export interface PassoGuiado {
  passo: PassoProcesso;
  faseId: string;
  faseRotuloChave: string;
  tituloChave: string;
  subtituloChave: string;
  itens: ItemChecklist[];
  acao: AcaoGuiada;
  anterior: FaseAnterior | null;
  /** TODAS as fases já feitas, pela ordem da barra (a última é a `anterior`): é o que a coluna da esquerda deixa escolher. */
  feitas: FaseFeita[];
}

export interface ContextoDoGuia {
  dados: DadosDoGuia;
  /** As fases da barra, pela ordem, com a atual marcada. */
  fases: readonly FaseGuia[];
  /** `pessoas.edit` (e, num negócio, o âmbito dele). */
  podeEditar: boolean;
  /** `pessoas.create`: criar um negócio. */
  podeCriar: boolean;
  /**
   * As permissões de criar documentos. Sem a lista (a página ainda não a leu, ou a leitura falhou) os passos de documento ficam desativados «a carregar»
   * (gravam sem outra página no meio); os outros passos não se restringem e a base decide.
   */
  permissoesFecho?: readonly string[];
  /** A pessoa está perdida ou com a abordagem encerrada: nada se escreve até a reativar. */
  pessoaFechada: boolean;
  /** Os passos que este ecrã sabe executar (com o painel ou o diálogo à mão). Um passo fora daqui não tem botão que faça alguma coisa. */
  ligados: ReadonlySet<PassoProcesso>;
}

const chave = (sufixo: string): string => `${G}${sufixo}`;

/** As fases da barra de uma pessoa em abordagem: as colunas do quadro e, no fim, o negócio (que se cria depois da visita). */
export function fasesDaPessoa(fase: string): FaseGuia[] {
  const ids = ["porContactar", "contactado", "visita", "negocio"];
  const atual = ids.indexOf(fase);
  return ids.map((id, i) => ({
    id, rotuloChave: id === "negocio" ? chave("fase.negocio") : `pessoasPagina.board.col.${id}`,
    estado: i < atual ? "feita" : i === atual ? "atual" : "porFazer",
  }));
}

/**
 * A barra de fases de uma pessoa que não tem passo de abordagem a fazer (um cliente, uma perdida, uma encerrada, ou com um negócio aberto): as mesmas
 * quatro fases, com `indice` (0 a 3) a dizer onde a pessoa está. `concluida` (um cliente) dá todas por feitas; `perdida` marca a fase onde ficou a vermelho.
 */
export function fasesDaPessoaSemPasso(indice: number, modo: "atual" | "perdida" | "concluida"): FaseGuia[] {
  const fases = fasesDaPessoa("porContactar");
  const i = Math.max(0, Math.min(indice, fases.length - 1));
  return fases.map((f, n) => ({
    ...f,
    estado: modo === "concluida" || n < i ? "feita" : n === i ? (modo === "perdida" ? "perdida" : "atual") : "porFazer",
  }));
}

/** As fases REAIS do negócio (as que o código tem: sem Financeiro nem Obra) para a barra. */
export function fasesDoNegocioParaGuia(fases: readonly FaseDoNegocio[]): FaseGuia[] {
  return fases.map((f) => ({ id: f.id, rotuloChave: `pessoasPagina.phases.${f.id}`, estado: f.estado }));
}

interface EntradaChecklist {
  item: ItemProcesso;
  dados: DadosDoGuia;
  /** A fase já passou: o que depende do item (e não de um registo) conta como feito. */
  passada: boolean;
}

/** A lista de verificação de uma fase, só de dados reais. Uma fase que não se conhece não tem lista. */
function checklistDaFase(fase: string, { item, dados, passada }: EntradaChecklist): ItemChecklist[] {
  const feito = (id: string, ok: boolean): ItemChecklist => {
    const detalhe = dados.detalhes?.[id];
    const linhas = dados.resumos?.[id];
    return { id, rotuloChave: chave(`check.${id}`), feito: ok, ...(detalhe ? { detalhe } : {}), ...(linhas ? { linhas } : {}) };
  };
  // A qualificação não é um item da lista da fase atual (o assistente tem o seu passo): só entra, em leitura, numa fase já feita e se há o que ler.
  const qualificacao = passada && dados.resumos?.qualificacao ? [feito("qualificacao", true)] : [];
  switch (fase) {
    case "porContactar":
      return [feito("quemPede", dados.nome.trim() !== ""), feito("contacto", dados.temContacto), feito("origem", dados.temOrigem)];
    case "contactado":
    case "contacto":
      return [feito("chamada", dados.chamadas > 0 || passada), ...qualificacao, feito("visitaMarcada", dados.visitasAtivas > 0 || passada)];
    case "visita":
      return [feito("visitaMarcada", dados.visitasAtivas > 0 || passada), feito("visitaFeita", item.visitaFeita || passada)];
    case "levantamento":
      return [feito("levantamento", dados.levantamentos > 0 || passada)];
    case "orcamento":
      return [feito("orcamento", item.orcamentos > 0 || passada)];
    case "proposta":
      return [feito("propostaCriada", true), feito("propostaEnviada", !item.propostaRascunho || passada), feito("respostaCliente", item.propostaAceite === true || passada)];
    case "contrato":
      return [feito("contratoCriado", true), feito("contratoAssinado", item.prontoAGanhar === true || passada)];
    default:
      return [];
  }
}

const PERMISSAO_DO_PASSO: Partial<Record<PassoProcesso, string>> = {
  criarOrcamento: "quotes.create", criarProposta: "proposals.create", criarContrato: "client_contracts.create",
  // O mesmo que as páginas de origem exigem: proposals.edit para enviar e responder, client_contracts.edit para a assinatura.
  enviarProposta: "proposals.edit", registarRespostaCliente: "proposals.edit", registarAssinatura: "client_contracts.edit",
};

/** Os passos de documento do ecrã guiado (a proposta e o contrato), feitos num diálogo por cima do guia; sem o documento ficam desativados. */
const PASSOS_DE_DOCUMENTO: ReadonlySet<PassoProcesso> = new Set<PassoProcesso>([
  "enviarProposta", "registarRespostaCliente", "criarContrato", "registarAssinatura",
]);

/** Os passos de escrita do ecrã guiado: sem ligação ou permissão ficam à vista, desativados, com a razão. */
const PASSOS_DO_GUIA: ReadonlySet<PassoProcesso> = new Set<PassoProcesso>([
  "registarChamada", "marcarVisita", "marcarVisitaFeita", "criarNegocio", "fazerLevantamento", "criarOrcamento", ...PASSOS_DE_DOCUMENTO,
]);

function rotuloDaAcao(passo: PassoProcesso): string {
  return passo === "ganharNegocio" ? chave("acao.ganharNegocio") : `pessoasPagina.todo.step.${passo}`;
}

const desativada = (passo: PassoProcesso, razao: string): AcaoGuiada => ({ passo, estado: "desativada", rotuloChave: rotuloDaAcao(passo), razaoChave: chave(`razao.${razao}`) });

/** O que o botão primário faz, ou porque não pode. */
function acaoDoPasso(passo: PassoProcesso, c: ContextoDoGuia): AcaoGuiada {
  const base: AcaoGuiada = { passo, estado: "pronta", rotuloChave: rotuloDaAcao(passo) };
  if (!PASSOS_DO_GUIA.has(passo)) return c.ligados.has(passo) ? base : { ...base, estado: "semAcao" };
  if (c.pessoaFechada) return { passo, estado: "desativada", rotuloChave: rotuloDaAcao(passo), razaoChave: "pessoasPagina.gate.pessoaPerdida" };
  // Sem interesse ou numero errado: avisa-se e a visita nao se marca; novo contacto continua sempre possivel (nao e este botao).
  const ultimo = c.dados.ultimoResultado;
  if (passo === "marcarVisita" && (ultimo === "semInteresse" || ultimo === "numeroErrado")) return desativada(passo, ultimo);
  if (passo === "criarNegocio") {
    if (!c.podeCriar) return desativada(passo, "semPermissaoCriar");
  } else if (passo !== "registarChamada" && !c.podeEditar) {
    return desativada(passo, "semPermissao");
  }
  const codigo = PERMISSAO_DO_PASSO[passo];
  if (codigo && c.permissoesFecho !== undefined && !c.permissoesFecho.includes(codigo)) return desativada(passo, "semPermissao");
  // Os passos de documento gravam sem passar por outra página: sem a lista conhecida (a carregar, ou a leitura falhou) o botão não faz nada, e diz porquê.
  if (PASSOS_DE_DOCUMENTO.has(passo) && c.permissoesFecho === undefined && c.ligados.has(passo)) return desativada(passo, "aCarregarPermissoes");
  return c.ligados.has(passo) ? base : desativada(passo, PASSOS_DE_DOCUMENTO.has(passo) ? "semDocumento" : "indisponivel");
}

function faseAnterior(c: ContextoDoGuia, item: ItemProcesso): FaseAnterior | null {
  const indice = c.fases.findIndex((f) => f.estado === "atual" || f.estado === "perdida");
  const anterior = indice > 0 ? c.fases[indice - 1] : undefined;
  if (!anterior) return null;
  return { id: anterior.id, rotuloChave: anterior.rotuloChave, itens: checklistDaFase(anterior.id, { item, dados: c.dados, passada: true }) };
}

/** Todas as fases já feitas, cada uma com a sua lista lida como feita e o que ficou registado. */
function fasesFeitas(c: ContextoDoGuia, item: ItemProcesso): FaseFeita[] {
  return c.fases
    .filter((f) => f.estado === "feita")
    .map((f) => ({ id: f.id, rotuloChave: f.rotuloChave, estado: "feita" as const, itens: checklistDaFase(f.id, { item, dados: c.dados, passada: true }) }));
}

/** O título do passo: «Está tudo. Registar a chamada.» quando a lista da fase está completa, senão o título simples. */
function tituloDoPasso(passo: PassoProcesso, itens: readonly ItemChecklist[]): string {
  const pronto = passo === "registarChamada" && itens.length > 0 && itens.every((i) => i.feito);
  return chave(`titulo.${passo}${pronto ? ".pronto" : ""}`);
}

export function calcularPassoGuiado(item: ItemProcesso, contexto: ContextoDoGuia): PassoGuiado {
  const passo = passoDoItem(item).id;
  const faseAtual = contexto.fases.find((f) => f.estado === "atual" || f.estado === "perdida");
  const itens = checklistDaFase(item.fase, { item, dados: contexto.dados, passada: false });
  return {
    passo,
    faseId: item.fase,
    faseRotuloChave: faseAtual?.rotuloChave ?? `pessoasPagina.board.col.${item.fase}`,
    tituloChave: tituloDoPasso(passo, itens),
    subtituloChave: chave(`subtitulo.${passo}`),
    itens,
    acao: acaoDoPasso(passo, contexto),
    anterior: faseAnterior(contexto, item),
    feitas: fasesFeitas(contexto, item),
  };
}
