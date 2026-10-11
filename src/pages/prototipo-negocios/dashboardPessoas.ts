// Os números do dashboard de Pessoas: cartões e gráficos. Funções puras sobre as mesmas linhas e os mesmos filtros da lista,
// por isso o que o dashboard mostra bate sempre com o que a lista mostra. Nada aqui muda o Estado.
// Regra de ouro: cada cartão e cada barra traz a `acao` que se aplica ao carregar nele, e o número que mostra é o da lista depois dessa ação.
import { somarDias } from "./leadsDocs";
import type { SeparadorLista } from "./pessoasDocs";
import { ETAPAS_PESSOA } from "./listaDocs";
import { selecionar, type FiltrosP, type LinhaP } from "./filtrosPessoas";
import { contarPor, porNumero, type BarraG, type CartaoG } from "./graficosTipos";

/** O que acontece ao carregar num cartão ou numa barra: eventualmente muda de separador e junta filtros aos que já há. */
export interface AcaoP { aba?: SeparadorLista; f?: Partial<FiltrosP> }

export type BarraP = BarraG<AcaoP>;
export type CartaoP = CartaoG<AcaoP>;

/** "Hoje" do protótipo: 10/10. */
const HOJE = "10/10";
/** O período de "últimos 30 dias" (inclusive o dia de hoje e o de há 30 dias, como o filtro Período). */
export const DIAS_TENDENCIA = 30;

/** Os filtros e o separador depois de uma ação. */
export function aplicarAcao(aba: SeparadorLista, f: FiltrosP, acao: AcaoP | undefined): { aba: SeparadorLista; f: FiltrosP } {
  return { aba: acao?.aba ?? aba, f: { ...f, ...acao?.f } };
}

/** As pessoas que a lista mostraria depois da ação. */
export function depoisDaAcao(linhas: readonly LinhaP[], aba: SeparadorLista, f: FiltrosP, acao: AcaoP | undefined): LinhaP[] {
  const r = aplicarAcao(aba, f, acao);
  return selecionar(linhas, r.aba, r.f);
}

/* ---------------------------------------------------------------- cartões */

type Soma = "emJogo" | "contratado";

/** O período que a ação "últimos 30 dias" junta: se já há um período mais curto, esse fica (juntar um filtro nunca alarga a lista). */
const periodoAte30 = (f: FiltrosP): FiltrosP["periodo"] => (f.periodo !== "" && Number(f.periodo) < DIAS_TENDENCIA ? f.periodo : "30");
/** O mesmo para a qualificação: com MQL ou SQL escolhido, esse fica. */
const qualificadas = (f: FiltrosP): FiltrosP["qualificacao"] => (f.qualificacao === "MQL" || f.qualificacao === "SQL" ? f.qualificacao : "qualificada");

function cartao(linhas: readonly LinhaP[], aba: SeparadorLista, f: FiltrosP, id: string, rotulo: string, acao: AcaoP, soma?: Soma): CartaoP {
  const pessoas = depoisDaAcao(linhas, aba, f, acao);
  const n = pessoas.length;
  return {
    id, rotulo, valor: soma ? pessoas.reduce((a, l) => a + l[soma], 0) : n, euros: soma !== undefined, acao,
    acaoRotulo: `Filtrar por ${rotulo}: ${n === 1 ? "1 pessoa" : `${n} pessoas`}`,
  };
}

/** Os cartões de métricas, que mudam com o separador. Cada número é o da lista que se abre ao carregar no cartão. */
export function cartoesPessoas(linhas: readonly LinhaP[], aba: SeparadorLista, f: FiltrosP): CartaoP[] {
  const c = (id: string, rotulo: string, acao: AcaoP, soma?: Soma) => cartao(linhas, aba, f, id, rotulo, acao, soma);
  if (aba === "leads") {
    return [
      c("ativas", "Leads ativas", { f: { estado: "ativas" } }), c("por_contactar", "Por contactar", { f: { porContactar: true } }),
      c("atrasadas", "Atrasadas", { f: { atrasadas: true } }), c("qualificadas", "Qualificadas (MQL ou SQL)", { f: { qualificacao: qualificadas(f) } }),
      c("voltou", "Voltaram a contactar", { f: { voltou: true } }), c("perdidas", "Perdidas", { f: { estado: "perdidas" } }),
    ];
  }
  if (aba === "clientes") {
    return [
      c("clientes", "Clientes", { f: {} }), c("contratado", "Valor contratado", { f: {} }, "contratado"),
      c("novo", "Com negócio novo em curso", { f: { novoNegocio: true } }), c("aberto", "Valor em aberto", { f: { novoNegocio: true } }, "emJogo"),
      c("novos30", "Novos nos últimos 30 dias", { f: { periodo: periodoAte30(f) } }),
    ];
  }
  return [
    c("pessoas", "Pessoas", { f: {} }), c("leads", "Leads", { aba: "leads", f: { estado: "ativas" } }), c("clientes", "Clientes", { aba: "clientes", f: { estado: "ativas" } }),
    c("empresas", "Empresas", { f: { tipo: "empresa" } }), c("perdidas", "Perdidas", { f: { estado: "perdidas" } }), c("jogo", "Valor em jogo", { f: {} }, "emJogo"),
  ];
}

/** A nota dos cartões em dinheiro: de quantas pessoas é a soma (as mesmas que a lista mostra depois de carregar no cartão). */
export function notaDoCartao(c: CartaoP, aba: SeparadorLista, linhas: readonly LinhaP[], f: FiltrosP): string | undefined {
  if (!c.euros) return undefined;
  const n = depoisDaAcao(linhas, aba, f, c.acao).length;
  return n === 1 ? "de 1 pessoa" : `de ${n} pessoas`;
}

/* ---------------------------------------------------------------- gráficos */

/** As pessoas do dashboard: as que a lista mostra para estes filtros. */
export const populacao = (linhas: readonly LinhaP[], aba: SeparadorLista, f: FiltrosP): LinhaP[] => selecionar(linhas, aba, f);

/** Uma barra por valor distinto; a ação junta esse valor ao filtro `campo`. */
function barrasPor(F: readonly LinhaP[], chave: (l: LinhaP) => string, campo: keyof FiltrosP): BarraP[] {
  const grupos = [...contarPor(F, chave).entries()].map(([rotulo, ls]) => ({ rotulo, n: ls.length }));
  return porNumero(grupos).map((g) => ({ id: g.rotulo, rotulo: g.rotulo, n: g.n, acao: { f: { [campo]: g.rotulo } } }));
}

export const porFormulario = (F: readonly LinhaP[]): BarraP[] => barrasPor(F, (l) => l.formulario, "formulario");
export const porDistrito = (F: readonly LinhaP[]): BarraP[] => barrasPor(F, (l) => l.distrito, "distrito");
export const porResultado = (F: readonly LinhaP[]): BarraP[] => barrasPor(F, (l) => l.resultado, "resultado");

export function porTipo(F: readonly LinhaP[]): BarraP[] {
  const empresas = F.filter((l) => l.empresa).length, pessoas = F.length - empresas;
  // Uma barra a zero fica só como texto: carregar nela mudaria o filtro para um valor que a lista atual não tem.
  return [
    { id: "pessoa", rotulo: "Pessoa", n: pessoas, ...(pessoas > 0 ? { acao: { f: { tipo: "pessoa" as const } } } : {}) },
    { id: "empresa", rotulo: "Empresa", n: empresas, ...(empresas > 0 ? { acao: { f: { tipo: "empresa" as const } } } : {}) },
  ];
}

/** Os motivos da perda das pessoas perdidas que passam nos filtros, e o total. Com o filtro "Ativas", ou nos Clientes, não há perdidas: fica vazio. */
export function motivosDaPerda(linhas: readonly LinhaP[], aba: SeparadorLista, f: FiltrosP): { barras: BarraP[]; total: number } {
  const perdidas = f.estado === "ativas" || aba === "clientes" ? [] : selecionar(linhas, aba, { ...f, estado: "perdidas" });
  const barras = barrasPor(perdidas, (l) => l.p.perdida ?? "", "motivo").map((b) => ({ ...b, acao: { f: { motivo: b.rotulo, estado: "perdidas" as const } } }));
  return { barras, total: perdidas.length };
}

export interface GrupoCanal { canal: string; n: number; acao: AcaoP; barras: BarraP[] }

/** A origem agrupada por canal: cada canal com o seu total e, por baixo, as origens dele. */
export function porOrigemECanal(F: readonly LinhaP[]): GrupoCanal[] {
  const canais = [...contarPor(F, (l) => l.canal).entries()].map(([rotulo, ls]) => ({ rotulo, n: ls.length, ls }));
  return porNumero(canais).map((c) => ({
    canal: c.rotulo, n: c.n, acao: { f: { canal: c.rotulo } },
    barras: barrasPor(c.ls, (l) => l.origem, "origem"),
  }));
}

export interface EtapaFunil { id: string; rotulo: string; chegaram: number; agora: number; passagem: number | null; acao: AcaoP }

/** O funil: quantas pessoas já chegaram a cada etapa (Lead, Contacto, Visita, Negócio, Cliente), quantas estão nela agora e que parte do passo anterior passou.
 *  A ação junta "já chegou a esta etapa" sem nunca baixar uma etapa que o filtro já exija. */
export function funil(F: readonly LinhaP[], f: FiltrosP): EtapaFunil[] {
  const minima = Number(f.etapa || 0);
  return ETAPAS_PESSOA.map((nome, i): EtapaFunil => {
    const chegaram = F.filter((l) => l.etapa >= i).length, antes = i === 0 ? 0 : F.filter((l) => l.etapa >= i - 1).length;
    const etapa = Math.max(minima, i);
    return {
      id: nome, rotulo: nome, chegaram, agora: F.filter((l) => l.etapa === i).length,
      passagem: i === 0 ? null : antes > 0 ? Math.round((100 * chegaram) / antes) : 0,
      acao: { f: { etapa: (etapa === 0 ? "" : String(etapa)) as FiltrosP["etapa"] } },
    };
  });
}

export interface PontoDia { dia: number; rotulo: string; n: number }

/** As entradas por dia nos últimos 30 dias (do dia de há 30 dias até hoje), pela data em que a pessoa chegou. O total só conta quem chegou nesse período. */
export function entradasPorDia(F: readonly LinhaP[]): { pontos: PontoDia[]; total: number } {
  const pontos: PontoDia[] = [];
  for (let dia = DIAS_TENDENCIA; dia >= 0; dia--) pontos.push({ dia, rotulo: somarDias(HOJE, -dia), n: F.filter((l) => l.dias === dia).length });
  return { pontos, total: pontos.reduce((a, p) => a + p.n, 0) };
}

/** A ação do gráfico das entradas: só os últimos 30 dias (ou menos, se o filtro já o pede). */
export const acaoEntradas = (f: FiltrosP): AcaoP => ({ f: { periodo: periodoAte30(f) } });
