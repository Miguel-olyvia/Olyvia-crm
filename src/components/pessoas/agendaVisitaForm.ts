// A parte pura do formulário de uma visita ligada à base: o que o utilizador escolhe na agenda, a validação (a hora é obrigatória), o intervalo
// em instantes e a entrada que o hook `useAcoesVisita` envia. Sem relógio (o dia de hoje chega por parâmetro) nem rede.
import type { TipoVisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { instanteLisboa, minutosDaDuracao, type EntradaVisita } from "@/hooks/pessoas/visitaDb";
import { resolverDestino, validarDestino, type DestinoVisita, type ErroMoradaVisita } from "./moradaVisita";
import type { MoradaVisita } from "./pessoasTipos";
import { MAX_NOTA_VISITA, validarVisita } from "./visitaPessoa";

/** As quatro durações que o formulário oferece; vazia vale esta. */
export const DURACOES_VISITA = ["m30", "h1", "h1m30", "h2"] as const;
export const DURACAO_POR_OMISSAO = "h1";
/** O valor da opção «duração da base fora das quatro» (os minutos preservam-se em `duracaoMinutos`). */
export const DURACAO_DA_BASE = "custom";

const MS_MINUTO = 60_000;

/** O que se escolhe na agenda: quadro, quem vai, dia, hora e duração. */
export interface ValorAgenda {
  boardId: string | null;
  recursos: readonly string[];
  /** AAAA-MM-DD. */
  data: string;
  /** HH:MM; obrigatória. */
  hora: string;
  /** A chave da duração (`m30`, `h1`, `h1m30`, `h2`); vazia com `duracaoMinutos` é uma duração da base. */
  duracao: string;
  duracaoMinutos?: number;
  /** Quem vai estar na visita (`cliente`, `casal`, `familia` ou `outra`); ausente ou vazio = nao se disse. */
  quemVaiEstar?: string;
}

export type ErroAgenda = "quadroEmFalta" | "recursoEmFalta" | "dataVazia" | "dataPassada" | "horaVazia" | "horaInvalida";
export type ErroFormVisita = ErroAgenda | "notaComprida" | ErroMoradaVisita;

const ERROS_DA_AGENDA: readonly string[] = ["quadroEmFalta", "recursoEmFalta", "dataVazia", "dataPassada", "horaVazia", "horaInvalida"];
const ERROS_DA_MORADA: readonly string[] = ["ruaVazia", "codigoPostalInvalido", "notaAcessoComprida"];

/** O erro é da agenda (quadro, recursos, dia ou hora)? */
export const ehErroAgenda = (erro: ErroFormVisita | null): erro is ErroAgenda => erro !== null && ERROS_DA_AGENDA.includes(erro);

/** O erro é da morada da visita? */
export const ehErroMorada = (erro: ErroFormVisita | null): erro is ErroMoradaVisita => erro !== null && ERROS_DA_MORADA.includes(erro);

/** O primeiro erro da agenda, pela ordem do ecrã (quadro, recursos, dia, hora); `null` = válida. */
export function validarAgenda(v: ValorAgenda, hoje: string): ErroAgenda | null {
  if (!v.boardId) return "quadroEmFalta";
  if (v.recursos.length === 0) return "recursoEmFalta";
  const dia = validarVisita({ data: v.data, hora: "", nota: "" }, hoje);
  if (dia === "dataVazia" || dia === "dataPassada") return dia;
  if (v.hora === "") return "horaVazia";
  return validarVisita({ data: v.data, hora: v.hora, nota: "" }, hoje) === "horaInvalida" ? "horaInvalida" : null;
}

interface DadosValidacao {
  agenda: ValorAgenda;
  /** A nota da visita (até 140). */
  nota: string;
  destino: DestinoVisita;
  moradaLead: MoradaVisita | null;
  hoje: string;
}

/** O primeiro erro do formulário inteiro: a agenda, a nota e a morada, por esta ordem. */
export function validarFormVisita(d: DadosValidacao): ErroFormVisita | null {
  const daAgenda = validarAgenda(d.agenda, d.hoje);
  if (daAgenda) return daAgenda;
  if (d.nota.trim().length > MAX_NOTA_VISITA) return "notaComprida";
  return validarDestino(d.destino, d.moradaLead);
}

/** O início e o fim em instantes (ISO); `null` sem dia e hora válidos ou sem duração que se leia. */
export function intervaloDaVisita(v: Pick<ValorAgenda, "data" | "hora" | "duracao" | "duracaoMinutos">): { inicio: string; fim: string } | null {
  const inicio = instanteLisboa(v.data, v.hora);
  if (!inicio) return null;
  const minutos = v.duracaoMinutos ?? minutosDaDuracao(v.duracao);
  if (minutos === null || !Number.isFinite(minutos) || minutos <= 0) return null;
  return { inicio, fim: new Date(Date.parse(inicio) + minutos * MS_MINUTO).toISOString() };
}

/** As opções da duração: as quatro e, se a visita da base dura outra coisa, uma quinta («custom») para a preservar. */
export function opcoesDeDuracao(duracaoMinutos: number | undefined): string[] {
  const base: string[] = [...DURACOES_VISITA];
  if (duracaoMinutos === undefined) return base;
  const coincide = DURACOES_VISITA.some((chave) => minutosDaDuracao(chave) === duracaoMinutos);
  return coincide ? base : [...base, DURACAO_DA_BASE];
}

interface DadosEntrada {
  agenda: ValorAgenda;
  nome: string;
  tipo: TipoVisitaNegocio | "";
  /** O tipo já traduzido («Levantamento»); vazio sem tipo. */
  tituloTipo: string;
  destino: DestinoVisita;
  moradaLead: MoradaVisita | null;
  /** A nota da visita (só ao marcar; ao alterar vai vazia e vale a nota de acesso). */
  nota: string;
  quemVaiEstar: string;
  /** Só ao marcar. */
  negocioId?: string | null;
}

/** A nota da visita e a de acesso numa só (nenhuma das duas se perde); uma só, fica essa. */
const juntarNotas = (nota: string, acesso: string): string => [nota.trim(), acesso.trim()].filter(Boolean).join(" · ");

/** A entrada que `useAcoesVisita` (marcar ou alterar) envia: o título é «tipo · nome» e a nota de acesso conta mesmo na morada da lead. */
export function entradaDaVisita(d: DadosEntrada): EntradaVisita {
  const onde = resolverDestino(d.destino, d.moradaLead);
  const titulo = [d.tituloTipo, d.nome].filter(Boolean).join(" · ");
  return {
    boardId: d.agenda.boardId,
    data: d.agenda.data,
    hora: d.agenda.hora,
    duracao: d.agenda.duracao,
    ...(d.agenda.duracaoMinutos !== undefined ? { duracaoMinutos: d.agenda.duracaoMinutos } : {}),
    recursos: [...d.agenda.recursos],
    tipo: d.tipo,
    titulo,
    nota: juntarNotas(d.nota, d.destino.notaAcesso),
    morada: onde.moradaVisita,
    igualALead: onde.igualALead,
    quemVaiEstar: d.agenda.quemVaiEstar ?? d.quemVaiEstar,
    ...(d.negocioId !== undefined ? { negocioId: d.negocioId } : {}),
  };
}
