// O negócio como o ecrã o vê, e a ÚNICA função que diz quais são os negócios de uma pessoa (negociosDe): o da seed, mapeado para esta forma,
// e os de exemplo de exemplosDocs.ts. A V2 de Negócios (um cartão por negócio) e a página Pessoas (um bloco por negócio) leem daqui.
// Um negócio tem FASES e UM OU MAIS orçamentos (cada um com título e valor); os orçamentos geram UMA proposta e, se exigido, um contrato.
// Funções puras: nada aqui muda o Estado. Os exemplos são cópias do negócio base da pessoa; nunca entram no Estado.
import { aberto, eur, r2, tot, type Estado, type LinhaId, type Negocio, type Orcamento } from "./motor";
import { EXEMPLOS, type EstadoContrato, type EstadoProposta, type ExemploNegocio } from "./exemplosDocs";

export type { EstadoContrato, EstadoProposta } from "./exemplosDocs";

export type DocFase = "orcamento" | "proposta" | "contrato" | "financeiro";
/** Em que fase está o negócio. `levantamento` é antes do orçamento; `obra` já não entra nestas páginas. */
export type FaseNegocio = "levantamento" | DocFase | "obra";

export interface OrcamentoApp { id: string; titulo: string; valor: number }

export interface NegocioApp {
  /** Único por negócio: `neg-1031` no da seed, `ex-90101` nos de exemplo. */
  id: string;
  /** O negócio base da pessoa na seed: é o que se abre (os de exemplo abrem o da mesma pessoa). */
  negocioId: number;
  nome: string;
  titulo: string;
  fase: FaseNegocio;
  orcamentos: OrcamentoApp[];
  /** A proposta gerada a partir de TODOS os orçamentos do negócio. */
  proposta: EstadoProposta;
  /** `null`: não exige contrato (venda direta); o ganho é a proposta aceite. */
  contrato: EstadoContrato | null;
  vendaDireta: boolean;
  /** O motivo, se o negócio foi perdido; `null` se está aberto. */
  perdido: string | null;
  demo: boolean;
  linhas: LinhaId[];
  /** O negócio no formato do motor, para o percurso, o estado e o próximo passo: o real, ou (nos exemplos) uma cópia do negócio base. */
  deal: Negocio;
}

export interface DocNegocio {
  id: string;
  negocioId: number;
  tipo: "Orçamento" | "Proposta" | "Contrato" | "Fatura" | "Recibo";
  /** O nome do documento: o título do orçamento, ou o do negócio. */
  titulo: string;
  /** O título do negócio a que pertence. */
  servico: string;
  estado: string;
  valor: number | null;
  referencia: string | null;
  data: string | null;
  /** Só na proposta: quantos orçamentos inclui. */
  inclui: number | null;
}

/** Em que fase de documento está o negócio; null se fica fora da V2 de Negócios. */
export function docFase(d: Negocio): DocFase | null {
  if (d.perdido || d.fase < 3) return null;
  if (d.fase === 4) return "financeiro";
  if (d.fase === 5) return null; // a obra vê-se em Operações
  const o = d.orc;
  if (!o || !o.enviada) return "orcamento";
  if (!o.aceite) return "proposta";
  return o.vendaDireta ? "financeiro" : "contrato"; // sem contrato exigido, a proposta aceite passa direta ao Financeiro
}

/** Negócio GANHO: o contrato assinado; ou, quando o negócio não exige contrato (venda direta, só proposta), a proposta aceite.
 *  Financeiro e Obra (fases 4 e 5) já passaram pelo ganho. Um negócio perdido nunca está ganho. A pessoa vira cliente com o primeiro. */
export function ehGanho(d: Negocio): boolean {
  if (d.perdido) return false;
  const o = d.orc;
  return d.fase >= 4 || o?.contrato === "assinado" || (!!o?.vendaDireta && !!o.aceite);
}

function faseDe(d: Negocio): FaseNegocio {
  if (d.fase < 3) return "levantamento";
  if (d.fase >= 5) return "obra";
  return docFase({ ...d, perdido: false })!;
}

/** A soma dos orçamentos do negócio; `null` quando ainda não há nenhum. */
export function valorNegocio(n: NegocioApp): number | null {
  return n.orcamentos.length ? r2(n.orcamentos.reduce((a, o) => a + o.valor, 0)) : null;
}

/** "2 orçamentos" quando há mais de um; vazio com um só. */
export function textoOrcamentos(n: NegocioApp): string {
  return n.orcamentos.length > 1 ? `${n.orcamentos.length} orçamentos` : "";
}

/* ---------------------------------------------------------------- o negócio da seed */

function deSeed(d: Negocio, S: Estado): NegocioApp {
  const o = d.orc;
  return {
    id: `neg-${d.id}`, negocioId: d.id, nome: d.nome, titulo: d.servico, fase: faseDe(d), demo: false, perdido: null, linhas: [d.linha], deal: d,
    orcamentos: o ? [{ id: `neg-${d.id}-o1`, titulo: d.servico, valor: tot(d, S).pf }] : [],
    proposta: !o ? "por gerar" : o.aceite ? "aceite" : o.enviada ? "enviada" : "por gerar",
    contrato: o?.vendaDireta ? null : o?.contrato ?? "por gerar", vendaDireta: !!o?.vendaDireta,
  };
}

/* ---------------------------------------------------------------- os negócios de exemplo */

const DATA_ENVIO = "08/10";
const DATA_ACEITE = "09/10";

/** O negócio de exemplo no formato do motor: uma cópia do negócio base com a fase e o estado da proposta e do contrato do exemplo. */
function dealDeExemplo(base: Negocio, ex: ExemploNegocio): Negocio {
  const aceite = ex.proposta === "aceite";
  const ganho = aceite && (ex.contrato === null || ex.contrato === "assinado");
  const orc: Orcamento = {
    modelo: base.orc?.modelo ?? "", linhas: [], desconto: 0, vendaDireta: ex.contrato === null, verif: ex.proposta !== "por gerar", aprov: null,
    enviada: ex.proposta === "por gerar" ? null : DATA_ENVIO, aceite: aceite ? DATA_ACEITE : null,
    contrato: ex.contrato === "enviado" || ex.contrato === "assinado" ? ex.contrato : null, avisosVistos: {},
  };
  return {
    ...structuredClone(base), id: ex.id, linha: ex.linhas[0] ?? base.linha, servico: ex.titulo, quando: ex.quando, atraso: false, valida: null,
    fase: ganho ? 4 : 3, perdido: ex.perdido !== undefined, orc, hist: [],
    fin: { fatura: null, pago: false, recibo: null }, obra: { plano: null, enc: null, mats: null, real: null, aprendido: false },
  };
}

function deExemplo(base: Negocio, ex: ExemploNegocio): NegocioApp {
  const deal = dealDeExemplo(base, ex);
  return {
    id: `ex-${ex.id}`, negocioId: base.id, nome: base.nome, titulo: ex.titulo, fase: faseDe(deal), demo: true, perdido: ex.perdido ?? null,
    linhas: [...ex.linhas], deal, orcamentos: ex.orcamentos.map((o, i) => ({ id: `ex-${ex.id}-o${i + 1}`, titulo: o.titulo, valor: o.valor })),
    proposta: ex.proposta, contrato: ex.contrato, vendaDireta: ex.contrato === null,
  };
}

/** Os negócios de uma pessoa: primeiro os da seed (abertos), depois os de exemplo. Sem negócio aberto na seed não há exemplos, porque não há a que ligá-los. */
export function negociosDe(S: Estado, nome: string): NegocioApp[] {
  const reais = aberto(S).filter((d) => d.nome === nome);
  if (!reais.length) return [];
  return [...reais.map((d) => deSeed(d, S)), ...(EXEMPLOS[nome] ?? []).map((ex) => deExemplo(reais[0], ex))];
}

/* ---------------------------------------------------------------- os documentos do negócio */

const ESTADO_PROPOSTA: Record<EstadoProposta, string> = { "por gerar": "Por gerar", enviada: "Enviada", aceite: "Aceite" };
const ESTADO_CONTRATO: Record<EstadoContrato, string> = { "por gerar": "Por gerar", enviado: "Enviado ao cliente", assinado: "Assinado" };

/** Os documentos que o negócio tem de facto: cada orçamento, a proposta (quando há orçamentos) e o contrato (só se exigido e a proposta está aceite). */
export function documentosDoNegocio(n: NegocioApp): DocNegocio[] {
  const d = n.deal, o = d.orc, valor = valorNegocio(n);
  const doc = (tipo: DocNegocio["tipo"], chave: string, titulo: string, estado: string, v: number | null, data: string | null, inclui: number | null = null): DocNegocio => ({
    id: `doc-${n.id}-${chave}`, negocioId: n.negocioId, tipo, titulo, servico: n.titulo, estado, valor: v, referencia: null, data, inclui,
  });
  const docs = n.orcamentos.map((x) => doc("Orçamento", x.id, x.titulo, n.proposta === "por gerar" ? "A compor" : "Na proposta", x.valor, null));
  if (n.orcamentos.length) docs.push(doc("Proposta", "proposta", n.titulo, ESTADO_PROPOSTA[n.proposta], valor, o?.aceite ?? o?.enviada ?? null, n.orcamentos.length));
  if (n.contrato !== null && n.proposta === "aceite") {
    const quando = d.hist.find((e) => /^contrato/i.test(e.t))?.q ?? o?.aceite ?? null;
    docs.push(doc("Contrato", "contrato", n.titulo, ESTADO_CONTRATO[n.contrato], valor, quando));
  }
  return docs;
}

/** A linha de detalhe de um documento: estado, "inclui 2 orçamentos", valor, referência e data, só o que existe. */
export function resumoDoc(d: DocNegocio): string {
  const inclui = d.inclui ? `inclui ${d.inclui} ${d.inclui === 1 ? "orçamento" : "orçamentos"}` : null;
  return [d.estado, inclui, d.valor !== null ? `${eur(d.valor)} €` : null, d.referencia, d.data].filter(Boolean).join(" · ");
}
