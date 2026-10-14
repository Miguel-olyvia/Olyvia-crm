// Lógica pura das Visitas de "Novo negócio": o negócio tem uma LISTA de visitas (a visita concluída que vem de Pessoas
// chega como Feita). Nada aqui lê o relógio: o dia de hoje chega por parâmetro. Só exemplo, em memória.
import type {
  EstadoLevantamento, EstadoVisitaNegocio, MoradaObraNegocio, NegocioMes, TipoVisitaNegocio, VisitaNegocio,
} from "./negocioMetas";
import { MORADA_VAZIA, moradaAparada } from "./moradaObra";
import { somarDias, type ValoresIniciaisNegocio } from "./novoNegocio";
import { formatarData } from "./negocioPainel";

export const TIPOS_VISITA = ["levantamento", "medicao", "materiais", "revisita"] as const satisfies readonly TipoVisitaNegocio[];
export const ESTADOS_VISITA = ["porFazer", "feita", "cancelada"] as const satisfies readonly EstadoVisitaNegocio[];

/** A nova visita fica daqui a 2 dias (como o primeiro prazo de um negócio novo). */
export const DIAS_ATE_NOVA_VISITA = 2;

/** O id da visita que vem de Pessoas (só há uma). */
export const ID_VISITA_DA_PESSOA = "v-pessoa";

type VisitaInicial = NonNullable<ValoresIniciaisNegocio["visita"]>;

/** Uma visita Por fazer do tipo Revisita, daqui a 2 dias; a morada (e a origem) é a da visita anterior, se a houver. */
export function novaVisita(id: string, hoje: string, comercial: string, anterior?: VisitaNegocio): VisitaNegocio {
  return {
    id, data: somarDias(hoje, DIAS_ATE_NOVA_VISITA), hora: "", feitoPor: comercial, estado: "porFazer", tipo: "revisita",
    quemVaiEstar: "", duracao: "", morada: anterior ? { ...anterior.morada } : { ...MORADA_VAZIA },
    igualALead: anterior ? anterior.igualALead : false, veioDaPessoa: false, nota: "",
  };
}

/** A visita concluída de uma pessoa: Feita, do tipo Levantamento, marcada como vinda da pessoa; a morada é uma cópia. */
export function visitaDaPessoa(id: string, inicial: VisitaInicial): VisitaNegocio {
  return {
    id, data: inicial.data, hora: inicial.hora ?? "", feitoPor: inicial.quemFez, estado: "feita", tipo: "levantamento",
    quemVaiEstar: "", duracao: "", morada: { ...inicial.moradaObra }, igualALead: inicial.igualALead, veioDaPessoa: true,
    nota: inicial.nota ?? "",
  };
}

/** A lista com que o painel abre: vazia, ou só com a visita concluída que veio de Pessoas. */
export function visitasIniciais(inicial: VisitaInicial | undefined): VisitaNegocio[] {
  return inicial ? [visitaDaPessoa(ID_VISITA_DA_PESSOA, inicial)] : [];
}

const SEM_DATA = "9999-99-99";
const SEM_HORA = "99:99";
const chaveDeOrdem = (v: VisitaNegocio): string => `${v.data || SEM_DATA} ${v.hora || SEM_HORA}`;

/** Por data e hora (sem hora, depois das que têm; sem data, no fim); à mesma hora, a ordem em que foram acrescentadas. */
export function ordenarVisitas(visitas: readonly VisitaNegocio[]): VisitaNegocio[] {
  return visitas
    .map((v, i) => ({ v, i }))
    .sort((a, b) => chaveDeOrdem(a.v).localeCompare(chaveDeOrdem(b.v)) || a.i - b.i)
    .map(({ v }) => v);
}

export const acrescentarVisita = (visitas: readonly VisitaNegocio[], nova: VisitaNegocio): VisitaNegocio[] => [...visitas, nova];

export const alterarVisita = (visitas: readonly VisitaNegocio[], id: string, parcial: Partial<VisitaNegocio>): VisitaNegocio[] =>
  visitas.map((v) => (v.id === id ? { ...v, ...parcial } : v));

/** Tira a visita; a que veio de Pessoas só se edita (devolve a mesma lista). */
export function removerVisita(visitas: readonly VisitaNegocio[], id: string): VisitaNegocio[] {
  if (visitas.some((v) => v.id === id && v.veioDaPessoa)) return visitas as VisitaNegocio[];
  return visitas.filter((v) => v.id !== id);
}

/** Marca como Feita só uma visita Por fazer (as Canceladas e as Feitas ficam como estavam). */
export function marcarFeita(visitas: readonly VisitaNegocio[], id: string): VisitaNegocio[] {
  const alvo = visitas.find((v) => v.id === id);
  return alvo?.estado === "porFazer" ? alterarVisita(visitas, id, { estado: "feita" }) : (visitas as VisitaNegocio[]);
}

export function contarVisitas(visitas: readonly VisitaNegocio[]): { total: number; feitas: number } {
  return { total: visitas.length, feitas: visitas.filter((v) => v.estado === "feita").length };
}

/** A próxima visita: a primeira Por fazer por ordem cronológica. */
export const proximaVisitaDoNegocio = (visitas: readonly VisitaNegocio[]): VisitaNegocio | undefined =>
  ordenarVisitas(visitas).find((v) => v.estado === "porFazer");

/** "Feita · 15/10/2026 · 10:00 · Bruno Costa · Levantamento": o que não existe (data, hora, quem fez) salta-se. */
export function resumoDaVisita(v: VisitaNegocio, rotulos: { estado: string; tipo: string }): string {
  return [rotulos.estado, v.data && formatarData(v.data), v.hora, v.feitoPor, rotulos.tipo].filter(Boolean).join(" · ");
}

/** Quanto mais baixo, mais a visita representa o levantamento do negócio: Feita de Levantamento, outra Feita, Por fazer, o resto. */
function pesoDoLevantamento(v: VisitaNegocio): number {
  if (v.estado === "feita") return v.tipo === "levantamento" ? 0 : 1;
  return v.estado === "porFazer" ? 2 : 3;
}

/**
 * O que o levantamento do negócio leva (data, quem fez, estado) quando há visitas: o da visita que o representa. Basta uma
 * visita Feita para o estado ser "feito" (e então pedem-se linhas de levantamento, como sempre). Sem visitas, é o de hoje.
 */
export function camposDoLevantamento(
  visitas: readonly VisitaNegocio[], hoje: string, comercial: string,
): { data: string; feitoPor: string; estado: EstadoLevantamento } {
  const [principal] = [...ordenarVisitas(visitas)].sort((a, b) => pesoDoLevantamento(a) - pesoDoLevantamento(b));
  if (!principal) return { data: hoje, feitoPor: comercial, estado: "porFazer" };
  return { data: principal.data, feitoPor: principal.feitoPor, estado: principal.estado === "feita" ? "feito" : "porFazer" };
}

/** A visita única de antes: os campos do levantamento e as escolhas da secção Visitas (chaves das opções). */
export interface VisitaUnica {
  data: string;
  feitoPor: string;
  estado: EstadoLevantamento;
  tipo?: TipoVisitaNegocio;
  /** "h14" (a chave da opção antiga) ou já "HH:MM". */
  hora?: string;
  quemVaiEstar?: string;
  duracao?: string;
  morada?: MoradaObraNegocio;
}

const HORA_ANTIGA = /^h(\d{2})$/;
const horaEmTexto = (hora: string | undefined): string => {
  const antiga = HORA_ANTIGA.exec(hora ?? "");
  return antiga ? `${antiga[1]}:00` : hora ?? "";
};

/** Passa a visita única de antes à primeira visita da lista, sem perder nenhum dos campos. */
export function migrarVisitaUnica(id: string, u: VisitaUnica): VisitaNegocio {
  return {
    id, data: u.data, hora: horaEmTexto(u.hora), feitoPor: u.feitoPor, estado: u.estado === "feito" ? "feita" : "porFazer",
    tipo: u.tipo ?? "levantamento", quemVaiEstar: u.quemVaiEstar ?? "", duracao: u.duracao ?? "",
    morada: u.morada ? { ...u.morada } : { ...MORADA_VAZIA }, igualALead: false, veioDaPessoa: false, nota: "",
  };
}

/** As visitas de um negócio: as que tem; senão a visita única que o levantamento já guardava; os de exemplo não têm nenhuma. */
export function visitasDoNegocio(negocio: NegocioMes): VisitaNegocio[] {
  if (negocio.visitas) return negocio.visitas;
  const { levantamento } = negocio;
  return levantamento ? [migrarVisitaUnica("v1", { data: levantamento.data, feitoPor: levantamento.feitoPor, estado: levantamento.estado })] : [];
}

/** A lista a guardar no negócio: textos aparados e por ordem cronológica. */
export function visitasParaGuardar(visitas: readonly VisitaNegocio[]): VisitaNegocio[] {
  return ordenarVisitas(visitas).map((v) => ({ ...v, nota: v.nota.trim(), morada: moradaAparada(v.morada) }));
}
