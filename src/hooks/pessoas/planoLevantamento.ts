// O levantamento do painel «Visita e levantamento» no formato de neg_guardar_levantamento (p_dados, p_linhas) e a decisão de o gravar ou não.
// Funções puras. Os nomes e os limites vêm do contrato da função: nada aqui inventa um parâmetro. Uma chave que falta em p_dados LIMPA o campo
// (a visita, a morada, as notas), por isso um levantamento que já existe conserva a data, a visita e o estado que tinha quando nenhuma visita o
// representa.
import { lerMedida, type LinhaForm } from "@/components/negocio-metas/levantamento";
import { OUTRO } from "@/components/negocio-metas/levantamentoExemplo";
import type { MoradaObraNegocio, VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { moradaAparada, MORADA_VAZIA, temMorada } from "@/components/negocio-metas/moradaObra";
import type { DadosProprios, RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import type { Respostas } from "@/components/negocio-metas/perguntasTipos";
import { moradaDasVisitas, visitaDoLevantamento } from "@/components/negocio-metas/visitasNegocio";

const CODIGO_POSTAL = /^\d{4}-\d{3}$/;
const MAX_NOTAS = 5000;
const MAX_TRABALHO_OUTRO = 60;
const MAX_OBSERVACAO_LINHA = 1000;

/** Uma linha de medidas como a base a pede (`p_linhas`). */
export interface LinhaDb {
  divisao: string;
  trabalho: string;
  trabalho_outro?: string;
  medida: number;
  unidade: string;
  observacoes?: string;
}

/** O levantamento livre (sem negócio) que a ficha já tem: o que o painel edita. */
export interface LevantamentoLivre {
  id: string;
  /** O que o painel mostrou ao abrir (as linhas, as observações e as respostas gravadas). */
  rascunho: RascunhoLevantamento;
  visitaId: string | null;
  /** AAAA-MM-DD. */
  data: string;
  /** `por_fazer` ou `feito`, como a base o guarda. */
  estado: string | null;
  /** O comercial que fez (`feito_por`), quando se conhece. */
  feitoPorId?: string | null;
  morada: MoradaObraNegocio | null;
}

export interface PassoLevantamento {
  tipo: "levantamento";
  levantamentoId: string;
  negocioId: string | null;
  /** O id, no painel, da visita a que o levantamento se liga: só se sabe o uuid da base depois de a visita estar gravada. */
  visitaPainelId: string | null;
  /** p_dados sem `visita_id` quando é uma visita do painel (preenche-se ao gravar); com o `visita_id` de um levantamento que já tinha visita. */
  dados: Record<string, unknown>;
  linhas: LinhaDb[];
  respostas: Respostas;
}

const cortar = (texto: string, limite: number): string => Array.from(texto).slice(0, limite).join("");

/** As linhas do formulário no formato da base: sem o id local, `trabalho_outro` só com «Outro», medida às três casas, texto vazio fora. */
export function linhasParaBase(linhas: readonly LinhaForm[]): LinhaDb[] {
  return linhas.map((l) => {
    const outro = l.trabalho === OUTRO ? cortar(l.trabalhoOutro.trim(), MAX_TRABALHO_OUTRO) : null;
    const observacoes = cortar(l.observacoes.trim(), MAX_OBSERVACAO_LINHA);
    return {
      divisao: l.divisao, trabalho: l.trabalho, ...(outro !== null ? { trabalho_outro: outro } : {}),
      medida: Math.round(lerMedida(l.medida) * 1000) / 1000, unidade: l.unidade, ...(observacoes ? { observacoes } : {}),
    };
  });
}

/** A morada da obra em `morada_*`: aparada, sem campos vazios e sem código postal fora do formato (a base recusaria o levantamento inteiro). */
function moradaParaBase(m: MoradaObraNegocio | undefined): Record<string, string> {
  const a = moradaAparada(m ?? MORADA_VAZIA);
  return {
    ...(a.rua ? { morada_rua: a.rua } : {}),
    ...(a.codigoPostal && CODIGO_POSTAL.test(a.codigoPostal) ? { morada_codigo_postal: a.codigoPostal } : {}),
    ...(a.localidade ? { morada_localidade: a.localidade } : {}),
    ...(a.andar ? { morada_andar: a.andar } : {}),
  };
}

const mesmaMorada = (a: MoradaObraNegocio | null | undefined, b: MoradaObraNegocio | null | undefined): boolean => {
  const x = moradaAparada(a ?? MORADA_VAZIA);
  const y = moradaAparada(b ?? MORADA_VAZIA);
  return x.rua === y.rua && x.codigoPostal === y.codigoPostal && x.localidade === y.localidade && x.andar === y.andar;
};

const respostasEmTexto = (r: Respostas): string => JSON.stringify(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)));

/** Há alguma coisa escrita que valha um levantamento novo: linhas, observações, respostas, ou uma morada que não é só a que as visitas sugerem. */
function moradaEscrita(r: RascunhoLevantamento, todas: readonly VisitaNegocio[]): boolean {
  return temMorada(r.moradaObra) && !mesmaMorada(r.moradaObra, moradaDasVisitas(todas)?.moradaObra);
}

interface Contexto {
  rascunho: RascunhoLevantamento;
  /** As visitas do painel que não ficam canceladas (as que podem representar o levantamento). */
  vivas: readonly VisitaNegocio[];
  /** Todas as visitas do painel, canceladas incluídas: o formulário sugere a morada da obra a partir de todas. */
  todas: readonly VisitaNegocio[];
  hoje: string;
  /** O comercial com que o formulário abre quando o levantamento gravado não tem um. */
  comercial: string;
  negocioId: string | null;
  livre: LevantamentoLivre | null;
  /** O uuid da base de uma visita do painel que já existe (ou foi criada nesta sessão); `undefined` se ainda não existe. */
  idRealDe: (idNoPainel: string) => string | undefined;
  novoId: () => string;
}

const estadoParaBase = (estado: "porFazer" | "feito"): string => (estado === "feito" ? "feito" : "por_fazer");

/** Sem visita a representá-lo, a data, o estado ou o comercial próprios mudaram em relação ao que está gravado (um estado gravado em falta conta como por fazer). */
function mudouDadosProprios(livre: LevantamentoLivre, dados: DadosProprios | undefined, comercial: string): boolean {
  if (!dados) return false;
  if (dados.data !== "" && dados.data !== livre.data) return true;
  if (estadoParaBase(dados.estado) !== (livre.estado === "feito" ? "feito" : "por_fazer")) return true;
  if (dados.feitoPorId === undefined) return false;
  // Gravado sem comercial, o formulário abre com o da pessoa (`comercial`): só conta como mudança se se escolheu outro.
  if (livre.feitoPorId == null) return dados.feitoPor !== comercial;
  return dados.feitoPorId !== livre.feitoPorId;
}

function mudouFace(livre: LevantamentoLivre, c: Contexto, principal: VisitaNegocio | undefined): boolean {
  const antes = livre.rascunho;
  const r = c.rascunho;
  if (JSON.stringify(linhasParaBase(r.linhas)) !== JSON.stringify(linhasParaBase(antes.linhas))) return true;
  if (r.observacoes.trim() !== antes.observacoes.trim() || respostasEmTexto(r.respostas) !== respostasEmTexto(antes.respostas)) return true;
  if (moradaEscrita(r, c.todas) && !mesmaMorada(r.moradaObra, livre.morada)) return true;
  if (!principal) return mudouDadosProprios(livre, r.dados, c.comercial);
  return (c.idRealDe(principal.id) ?? null) !== livre.visitaId || principal.data !== livre.data || (principal.estado === "feita" && livre.estado !== "feito");
}

/**
 * O passo do levantamento, ou `null` se não há nada a gravar: sem levantamento livre e sem conteúdo não se cria um (marcar uma visita não cria um
 * levantamento); com um que já existe, só se grava se algo mudou (não se reescreve o que a pessoa não mexeu).
 */
export function passoLevantamento(c: Contexto): PassoLevantamento | null {
  const { livre, rascunho } = c;
  const principal = visitaDoLevantamento(c.vivas);
  const comConteudo = rascunho.linhas.length > 0 || rascunho.observacoes.trim() !== "" || Object.keys(rascunho.respostas).length > 0 || moradaEscrita(rascunho, c.todas);
  if (livre ? !mudouFace(livre, c, principal) : !comConteudo) return null;
  const notas = cortar(rascunho.observacoes.trim(), MAX_NOTAS);
  const feita = principal?.estado === "feita";
  // Sem visita a representá-lo o levantamento tem a data, o estado e o comercial próprios (os que estão no formulário); com visita herda-os dela.
  const proprios = principal ? undefined : rascunho.dados;
  const dados: Record<string, unknown> = {
    data_levantamento: principal?.data || (proprios?.data ? proprios.data : "") || livre?.data || c.hoje,
    ...(feita ? { estado: "feito" } : proprios ? { estado: estadoParaBase(proprios.estado) } : livre ? {} : { estado: "por_fazer" }),
    ...(proprios?.feitoPorId ? { feito_por: proprios.feitoPorId } : {}),
    ...(!principal && livre?.visitaId ? { visita_id: livre.visitaId } : {}),
    ...(notas ? { notas } : {}),
    ...moradaParaBase(rascunho.moradaObra),
  };
  return {
    tipo: "levantamento", levantamentoId: livre?.id ?? c.novoId(), negocioId: c.negocioId, visitaPainelId: principal?.id ?? null,
    dados, linhas: linhasParaBase(rascunho.linhas), respostas: rascunho.respostas,
  };
}
