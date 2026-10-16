// Proposta de 16/10/2026 para simplificar Pessoas e Negócios no V1 (ver docs-design/proposta-v1-pessoas.md).
// Só lógica, sem React e sem mudar o Estado: reaproveita as regras da V2 (pessoasDocs, negociosApp, perfilDocs) e junta-as
// no que um comercial precisa de ver: quem tratar, o que fazer a seguir e em que documento está cada negócio.
import { PAPEIS, aberto, eur, type Estado, type Negocio, type Papel } from "./motor";
import { docFase, ehGanho, semPaginaPropria, type DocFase, type NegocioApp } from "./negociosApp";
import { clientesApp, leadsApp, perdidasApp, proximoNegocio, type PessoaApp } from "./pessoasDocs";
import { localDe } from "./leadsDocs";

/** Atrasada como no Hoje e no quadro do V1: o atraso da seed só conta enquanto a lead está por contactar (registar a chamada resolve-o). */
const atrasada = (p: PessoaApp): boolean => p.negocios.some((d) => !!d.atraso && d.fase === 0);
import { atividadeDe, estadoDe, perfilDe, type ItemAtividade } from "./perfilDocs";

/* ---------------------------------------------------------------- a lista */

/** Três grupos, nada mais: quem está a ser tratado, quem já é cliente e quem se perdeu. */
export type GrupoV1 = "curso" | "clientes" | "perdidas";
export const GRUPOS_V1: { id: GrupoV1; nome: string }[] = [
  { id: "curso", nome: "Em curso" }, { id: "clientes", nome: "Clientes" }, { id: "perdidas", nome: "Perdidas" },
];

export interface LinhaV1 {
  nome: string;
  papel: "Lead" | "Cliente" | "Perdida";
  /** "Remodelação de casa de banho · Amadora" */
  oQue: string;
  /** A frase do próximo passo (ou o motivo da perda). */
  proximo: string;
  atrasada: boolean;
  exemplo: boolean;
}

const papelDe = (p: PessoaApp): LinhaV1["papel"] => (p.perdida !== null ? "Perdida" : p.papel === "cliente" ? "Cliente" : "Lead");

/** Um cliente só aparece "Em curso" quando tem um negócio novo por fechar; os outros clientes ficam em Clientes. */
function doGrupo(S: Estado, g: GrupoV1): PessoaApp[] {
  if (g === "clientes") return clientesApp(S);
  if (g === "perdidas") return perdidasApp(S);
  return [...leadsApp(S), ...clientesApp(S).filter((p) => p.novoNegocio)];
}

/** O negócio novo de um cliente: o primeiro aberto e ainda não ganho (a mesma regra de `novoNegocio` em pessoasDocs). */
export const negocioNovo = (p: PessoaApp): NegocioApp | undefined =>
  p.papel === "cliente" ? p.todos.find((n) => n.perdido === null && !ehGanho(n.deal)) : undefined;

export function linhaV1(S: Estado, p: PessoaApp): LinhaV1 {
  const d = p.principal, nv = proximoNegocio(d, S).done ? negocioNovo(p) : undefined; // a mesma prioridade da ficha
  return {
    nome: p.nome, papel: papelDe(p), oQue: [d.servico, localDe(d)].filter(Boolean).join(" · "),
    // num cliente com um negócio novo, conta o negócio novo (o antigo pode estar "Concluído")
    proximo: p.perdida !== null ? "Perdida · " + p.perdida
      : nv ? `Novo negócio · ${nv.titulo} · ${semPaginaPropria(nv) ? estadoDe(nv) : proximoNegocio(nv.deal, S).t}`
      : proximoNegocio(d, S).t,
    atrasada: p.perdida === null && atrasada(p), exemplo: p.exemplo,
  };
}

const bate = (p: PessoaApp, q: string): boolean =>
  (p.nome + " " + p.tel + " " + p.principal.servico + " " + localDe(p.principal)).toLowerCase().includes(q);

/** A lista como se vê. Com pesquisa, procura nos três grupos (quem procura um nome não sabe em que grupo está). */
export function listaV1(S: Estado, g: GrupoV1, q = ""): LinhaV1[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return doGrupo(S, g).map((p) => linhaV1(S, p));
  const vistos = new Set<string>();
  return (["curso", "clientes", "perdidas"] as GrupoV1[]).flatMap((x) => doGrupo(S, x))
    .filter((p) => !vistos.has(p.nome) && (vistos.add(p.nome), bate(p, ql)))
    .map((p) => linhaV1(S, p));
}

export function contagensV1(S: Estado): Record<GrupoV1, number> {
  return { curso: doGrupo(S, "curso").length, clientes: doGrupo(S, "clientes").length, perdidas: doGrupo(S, "perdidas").length };
}

export function pessoaV1(S: Estado, nome: string): PessoaApp | undefined {
  return [...leadsApp(S), ...clientesApp(S), ...perdidasApp(S)].find((p) => p.nome === nome);
}

/* ---------------------------------------------------------------- a ficha (uma página, sem separadores) */

/** Vários orçamentos num negócio são alternativas (decisão de 13/10): nunca se somam. Um só dá o valor; vários dão o intervalo. */
export function valorAlternativas(n: Pick<NegocioApp, "orcamentos">): string {
  const vs = n.orcamentos.map((o) => o.valor).filter((v) => v > 0);
  if (!vs.length) return "Sem valor ainda";
  const min = Math.min(...vs), max = Math.max(...vs);
  return min === max ? eur(min) + " €" : `${eur(min)} € a ${eur(max)} €`;
}

export interface NegocioFichaV1 {
  id: string;
  titulo: string;
  /** Em palavras: "Proposta", "Contrato", "Perdido"… */
  estado: string;
  valor: string;
  /** "2 orçamentos alternativos" quando há mais de um. */
  nota: string;
  /** O negócio do motor que abre (null nos exemplos, que não têm página própria). */
  abre: number | null;
}

export interface FichaV1 {
  nome: string;
  papel: LinhaV1["papel"];
  /** "Lead · Amadora" */
  sub: string;
  tel: string;
  email: string;
  /** O que fazer agora: a frase, a explicação e o botão (sem botão quando o passo é de espera ou de outro papel). */
  agora: { t: string; sub?: string; btn?: string; act?: string; id: number | null; atrasada: boolean; de?: string };
  negocios: NegocioFichaV1[];
  historico: ItemAtividade[];
  dados: { rotulo: string; valor: string }[];
  exemplo: boolean;
}

const temPagina = (S: Estado, id: number): boolean => S.deals.some((d) => d.id === id);

export function fichaV1(S: Estado, p: PessoaApp): FichaV1 {
  const f = perfilDe(p, S), d = p.principal, pr = proximoNegocio(d, S), real = temPagina(S, d.id);
  // O principal manda enquanto não estiver concluído (ex.: a fatura por emitir). Concluído, e com um negócio novo, passa a ser desse.
  const nv = pr.done ? negocioNovo(p) : undefined, novo = nv && !semPaginaPropria(nv) && temPagina(S, nv.deal.id) ? nv : undefined;
  const alvo = novo?.deal ?? d, prA = novo ? proximoNegocio(alvo, S) : pr;
  const perdida = p.perdida !== null;
  // um negócio novo de exemplo não tem página: diz-se o que é, sem botão
  const soExemplo = nv && !novo ? { t: "Novo negócio: " + nv.titulo, sub: estadoDe(nv) + " · exemplo, sem página própria", id: null, atrasada: false } : null;
  // uma pessoa criada à mão nesta demonstração não tem as notas e chamadas inventadas (eram de antes de ela chegar)
  const aMao = p.negocios.some((x) => x.hist.some((e) => e.t === "Negócio criado à mão"));
  return {
    nome: p.nome, papel: papelDe(p), sub: [papelDe(p), f.morada.localidade].filter(Boolean).join(" · "),
    tel: f.telefone, email: f.email,
    agora: perdida
      ? { t: "Perdida", sub: "Motivo: " + p.perdida, id: null, atrasada: false }
      : soExemplo ?? {
        t: prA.t, sub: real ? prA.sub : "Pessoa de exemplo, sem página própria: o passo vê-se, mas não se faz aqui.", act: prA.act, id: real ? alvo.id : null, atrasada: atrasada(p),
        // o botão só para quem faz o passo; de outro papel diz-se de quem é (guidelines C27)
        btn: real && !prA.wait && !prA.done && (!prA.who || prA.who === S.role) ? prA.btn : undefined,
        de: prA.who && prA.who !== S.role && !prA.wait && !prA.done ? (prA.who === "cliente" ? "do cliente" : "de " + PAPEIS[prA.who as Papel].nome) : undefined,
      },
    negocios: p.todos.map((n) => ({
      id: n.id, titulo: n.titulo, estado: estadoDe(n) + (n.perdido ? " · " + n.perdido : ""), valor: valorAlternativas(n),
      nota: n.orcamentos.length > 1 ? `${n.orcamentos.length} orçamentos alternativos` : "",
      abre: semPaginaPropria(n) || !temPagina(S, n.deal.id) ? null : n.deal.id,
    })),
    historico: atividadeDe(p, S, f).filter((h) => !aMao || !h.exemplo),
    dados: [
      { rotulo: "Morada", valor: f.morada.completa.trim() || "Por indicar" },
      { rotulo: "Origem", valor: f.campanha ? `${f.origem} · ${f.campanha}` : f.origem },
      { rotulo: "Comercial", valor: f.comercial },
      { rotulo: "Chegou", valor: `${f.criada} (${f.criadaHa})` },
      ...(f.nif ? [{ rotulo: "NIF", valor: f.nifExemplo ? `${f.nif} (exemplo)` : f.nif }] : []),
    ],
    exemplo: p.exemplo,
  };
}

/* ---------------------------------------------------------------- Negócios por documento */

/** Quatro colunas, só do orçamento ao pagamento. Antes disso a pessoa está em Pessoas; depois, a obra está em Operações. */
export const COLUNAS_V1: { id: DocFase; nome: string }[] = [
  { id: "orcamento", nome: "Orçamento" }, { id: "proposta", nome: "Proposta" }, { id: "contrato", nome: "Contrato" }, { id: "financeiro", nome: "Pagamento" },
];

/** Os negócios do motor (todos abrem) por coluna. */
export function colunasV1(S: Estado, ds: Negocio[] = aberto(S)): Record<DocFase, Negocio[]> {
  const r: Record<DocFase, Negocio[]> = { orcamento: [], proposta: [], contrato: [], financeiro: [] };
  for (const d of ds) { const c = docFase(d); if (c) r[c].push(d); }
  return r;
}

/** Quantos estão antes (em Pessoas) e depois (em obra): a frase que diz onde estão os outros. */
export function foraDoQuadro(S: Estado): { antes: number; obra: number } {
  const ab = aberto(S);
  return { antes: ab.filter((d) => d.fase < 3).length, obra: ab.filter((d) => d.fase === 5).length };
}
