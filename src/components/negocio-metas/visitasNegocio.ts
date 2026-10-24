// Lógica pura das Visitas de "Novo negócio": o negócio tem uma LISTA de visitas (as do pedido de onde vem, se vier de um). Nada
// aqui lê o relógio: o dia de hoje chega por parâmetro. Só exemplo, em memória.
import type {
  EstadoLevantamento, EstadoVisitaNegocio, MoradaObraNegocio, NegocioMes, TipoVisitaNegocio, VisitaNegocio,
} from "./negocioMetas";
import { MORADA_VAZIA, moradaAparada, temMorada, validarCodigoPostal } from "./moradaObra";
import { somarDias } from "./novoNegocio";
import { formatarData } from "./negocioPainel";

export const TIPOS_VISITA = ["levantamento", "medicao", "materiais", "revisita"] as const satisfies readonly TipoVisitaNegocio[];
export const ESTADOS_VISITA = ["porFazer", "feita", "cancelada"] as const satisfies readonly EstadoVisitaNegocio[];

/** A nova visita fica daqui a 2 dias (como o primeiro prazo de um negócio novo). */
export const DIAS_ATE_NOVA_VISITA = 2;

/** Uma visita Por fazer do tipo Revisita, daqui a 2 dias; a morada (e a origem) é a da visita anterior, se a houver. */
export function novaVisita(id: string, hoje: string, comercial: string, anterior?: VisitaNegocio): VisitaNegocio {
  return {
    id, data: somarDias(hoje, DIAS_ATE_NOVA_VISITA), hora: "", feitoPor: comercial, estado: "porFazer", tipo: "revisita",
    quemVaiEstar: "", duracao: "", morada: anterior ? { ...anterior.morada } : { ...MORADA_VAZIA },
    igualALead: anterior ? anterior.igualALead : false, nota: "",
  };
}

/** A lista com que o painel abre: a do pedido (uma cópia, moradas incluídas); sem pedido, vazia. */
export function visitasIniciais(doPedido?: readonly VisitaNegocio[]): VisitaNegocio[] {
  return doPedido ? doPedido.map((v) => ({ ...v, morada: { ...v.morada } })) : [];
}

/** A visita que abre aberta para se ver: a primeira Feita, por ordem cronológica; `null` sem nenhuma. */
export const visitaParaAbrir = (visitas: readonly VisitaNegocio[]): string | null =>
  ordenarVisitas(visitas).find((v) => v.estado === "feita")?.id ?? null;

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

/** Tira a visita (qualquer uma: nenhuma visita é obrigatória). */
export const removerVisita = (visitas: readonly VisitaNegocio[], id: string): VisitaNegocio[] => visitas.filter((v) => v.id !== id);

/** Marca como Feita só uma visita Por fazer (as Canceladas e as Feitas ficam como estavam). */
export function marcarFeita(visitas: readonly VisitaNegocio[], id: string): VisitaNegocio[] {
  const alvo = visitas.find((v) => v.id === id);
  return alvo?.estado === "porFazer" ? alterarVisita(visitas, id, { estado: "feita" }) : (visitas as VisitaNegocio[]);
}

export function contarVisitas(visitas: readonly VisitaNegocio[]): { total: number; feitas: number } {
  return { total: visitas.length, feitas: visitas.filter((v) => v.estado === "feita").length };
}

/**
 * Os estados que uma visita pode ter agora. Uma que ainda não existe na base escolhe qualquer um; uma que já existe e está por fazer pode ficar
 * por fazer ou passar a feita (cancela-se pelo botão, com confirmação); uma já feita ou cancelada não muda (só se lê).
 */
export function estadosPermitidos(gravada: boolean, atual: EstadoVisitaNegocio): readonly EstadoVisitaNegocio[] {
  if (!gravada) return ESTADOS_VISITA;
  return atual === "porFazer" ? ["porFazer", "feita"] : [atual];
}

/** Uma visita que já existe na base e já está feita ou cancelada: só se lê. */
export const visitaSoLeitura = (gravada: boolean, estado: EstadoVisitaNegocio): boolean => gravada && estado !== "porFazer";

/**
 * Os ids das visitas (por ordem cronológica) com um código postal escrito fora do formato 0000-000. Não contam as canceladas (não se enviam) nem as
 * que já existem na base (`gravadas`) e só se leem (feitas ou canceladas): um código antigo, fora do formato, não se consegue corrigir e bloquearia o guardar.
 */
export const visitasComCodigoPostalInvalido = (visitas: readonly VisitaNegocio[], gravadas: ReadonlySet<string> = new Set()): string[] =>
  ordenarVisitas(visitas)
    .filter((v) => v.estado !== "cancelada" && !visitaSoLeitura(gravadas.has(v.id), v.estado) && validarCodigoPostal(v.morada.codigoPostal) !== null)
    .map((v) => v.id);

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

/** A visita que representa o levantamento: a Feita de Levantamento, outra Feita, a Por fazer, o resto; `undefined` sem visitas. */
export const visitaDoLevantamento = (visitas: readonly VisitaNegocio[]): VisitaNegocio | undefined =>
  [...ordenarVisitas(visitas)].sort((a, b) => pesoDoLevantamento(a) - pesoDoLevantamento(b))[0];

/** Há uma visita que representa o levantamento (uma cancelada nunca o representa): então ele herda dela a data, o estado e quem fez. */
export const visitaRepresentaLevantamento = (visitas: readonly VisitaNegocio[]): boolean =>
  visitaDoLevantamento(visitas.filter((v) => v.estado !== "cancelada")) !== undefined;

/**
 * O que o levantamento do negócio leva (data, quem fez, estado) quando há visitas: o da visita que o representa. Basta uma
 * visita Feita para o estado ser "feito" (e então pedem-se linhas de levantamento, como sempre). Sem visita ligada, o levantamento tem
 * os seus próprios (`proprios`, o que está no formulário); o que ainda não está preenchido preenche-se: hoje e o comercial da sessão. Sem `proprios`,
 * é o de hoje, do comercial, por fazer (e uma visita cancelada conta como a que o representa, só para o estado).
 */
export function camposDoLevantamento(
  visitas: readonly VisitaNegocio[], hoje: string, comercial: string, proprios?: { data: string; feitoPor: string; estado: EstadoLevantamento },
): { data: string; feitoPor: string; estado: EstadoLevantamento } {
  if (proprios && !visitaRepresentaLevantamento(visitas)) {
    return { data: proprios.data || hoje, feitoPor: proprios.feitoPor || comercial, estado: proprios.estado };
  }
  const principal = visitaDoLevantamento(visitas);
  if (!principal) return { data: hoje, feitoPor: comercial, estado: "porFazer" };
  return { data: principal.data, feitoPor: principal.feitoPor, estado: principal.estado === "feita" ? "feito" : "porFazer" };
}

/**
 * A morada da obra que as visitas sugerem: a da visita que representa o levantamento (a primeira com morada escrita, pelo mesmo
 * critério de `camposDoLevantamento`) e a sua origem. `undefined` quando nenhuma tem morada.
 */
export function moradaDasVisitas(visitas: readonly VisitaNegocio[]): { moradaObra: MoradaObraNegocio; igualALead: boolean | null } | undefined {
  const [principal] = [...ordenarVisitas(visitas)].filter((v) => temMorada(v.morada)).sort((a, b) => pesoDoLevantamento(a) - pesoDoLevantamento(b));
  return principal ? { moradaObra: { ...principal.morada }, igualALead: principal.igualALead } : undefined;
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
    morada: u.morada ? { ...u.morada } : { ...MORADA_VAZIA }, igualALead: false, nota: "",
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
