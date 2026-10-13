// Filtros, contagens e ordenação da lista de pessoas. Funções puras.
import { ORDEM_SAUDE } from "@/components/negocio-metas/saudeNegocio";
import type {
  ChipPessoa, FiltrosPessoas, OrdemPessoa, Pessoa, ResultadoOuNenhum, ResumoPessoa, TipoPessoa,
} from "./pessoasTipos";

/** "Sem contacto há N dias": há 7 ou mais dias sem contacto. */
export const LIMITE_SEM_CONTACTO = 7;

/** O comercial de "Só as minhas" (de exemplo, até haver sessão). */
export const COMERCIAL_EXEMPLO = "Ana Ribeiro";

/** O valor do filtro "Formulário" para as pessoas registadas à mão. */
export const FORMULARIO_MANUAL = "__manual__";

export const TIPOS: readonly TipoPessoa[] = ["leads", "clientes", "todos"];
export const CHIPS: readonly ChipPessoa[] = ["todas", "porContactar", "atrasadas", "perdidas"];
export const ORDENS: readonly OrdemPessoa[] = ["urgencia", "recentes", "valor"];
/** O que a lista só filtra nesta visita (não se guarda): a pesquisa, "Só as minhas" e os filtros do popover. */
export type FiltrosLocais = Omit<FiltrosPessoas, "tipo" | "chip">;
export const FILTROS_LOCAIS_INICIAIS: FiltrosLocais = {
  pesquisa: "", soMinhas: false, voltou: false, comVisita: false, comercial: "", formulario: "", resultado: "",
};
export const FILTROS_INICIAIS: FiltrosPessoas = { tipo: "todos", chip: "todas", ...FILTROS_LOCAIS_INICIAIS };

/** Os chips que o seletor mostra: em Clientes só "Todas" e "Atrasadas"; as perdidas só em "Todos". */
export function chipsDoTipo(tipo: TipoPessoa): readonly ChipPessoa[] {
  if (tipo === "clientes") return ["todas", "atrasadas"];
  return tipo === "leads" ? ["todas", "porContactar", "atrasadas"] : CHIPS;
}

/** Um chip que o seletor não tem (por exemplo "Perdidas" ao mudar para Clientes) volta a "Todas". */
export const chipValido = (tipo: TipoPessoa, chip: ChipPessoa): ChipPessoa => (chipsDoTipo(tipo).includes(chip) ? chip : "todas");

/** O resultado do último contacto; "Sem contacto" quando nunca houve chamada. */
export const resultadoEfetivo = (p: Pick<Pessoa, "resultadoContacto">): ResultadoOuNenhum => p.resultadoContacto ?? "semContacto";

const normalizar = (texto: string): string =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const soDigitos = (texto: string): string => texto.replace(/\D/g, "");

/** A pesquisa encontra o nome, o email, a localidade ou o telefone (este com ou sem espaços). */
export function pesquisaCorresponde(pessoa: Pessoa, pesquisa: string): boolean {
  const q = normalizar(pesquisa);
  if (q === "") return true;
  const { telefone, email } = pessoa.contacto;
  const texto = [pessoa.nome, email ?? "", pessoa.morada?.localidade ?? ""];
  if (texto.some((t) => normalizar(t).includes(q))) return true;
  const digitos = soDigitos(q);
  const soNumero = digitos.length > 0 && /^[\d\s+()-]+$/.test(q);
  return soNumero && soDigitos(telefone ?? "").includes(digitos);
}

const passaTipo = (r: ResumoPessoa, tipo: TipoPessoa): boolean =>
  tipo === "todos" || (tipo === "leads" ? r.papel === "lead" && !r.pessoa.perdida : r.papel === "cliente");

function passaChip(r: ResumoPessoa, chip: ChipPessoa): boolean {
  switch (chip) {
    case "porContactar": return r.etapa === "nova" && !r.pessoa.perdida;
    case "atrasadas": return r.atrasada;
    case "perdidas": return !!r.pessoa.perdida;
    default: return true;
  }
}

const passaFormulario = (r: ResumoPessoa, valor: string): boolean =>
  valor === "" || (valor === FORMULARIO_MANUAL ? r.formulario === null : r.formulario === valor);

/** Pesquisa, "Só as minhas", interruptores e selects do popover (tudo menos o tipo e o chip). */
export function passaOutros(r: ResumoPessoa, f: FiltrosPessoas, pendentes: ReadonlySet<string>): boolean {
  const { pessoa } = r;
  return pesquisaCorresponde(pessoa, f.pesquisa)
    && (!f.soMinhas || pessoa.comercial === COMERCIAL_EXEMPLO)
    && (!f.voltou || pendentes.has(pessoa.id))
    && (!f.comVisita || (r.etapa === "visitaMarcada" && !pessoa.perdida))
    && (f.comercial === "" || pessoa.comercial === f.comercial)
    && passaFormulario(r, f.formulario)
    && (f.resultado === "" || resultadoEfetivo(pessoa) === f.resultado);
}

export function filtrarPessoas(
  resumos: readonly ResumoPessoa[], filtros: FiltrosPessoas, pendentes: ReadonlySet<string>,
): ResumoPessoa[] {
  const chip = chipValido(filtros.tipo, filtros.chip);
  return resumos.filter((r) => passaTipo(r, filtros.tipo) && passaChip(r, chip) && passaOutros(r, filtros, pendentes));
}

/** "Leads n | Clientes n | Todos n": com a pesquisa e os outros filtros aplicados, sem o chip. */
export function contagensTipos(
  resumos: readonly ResumoPessoa[], filtros: FiltrosPessoas, pendentes: ReadonlySet<string>,
): Record<TipoPessoa, number> {
  const base = resumos.filter((r) => passaOutros(r, filtros, pendentes));
  return { leads: base.filter((r) => passaTipo(r, "leads")).length, clientes: base.filter((r) => passaTipo(r, "clientes")).length, todos: base.length };
}

/** A contagem de cada chip do tipo escolhido, com a pesquisa e os outros filtros aplicados. */
export function contagensChips(
  resumos: readonly ResumoPessoa[], filtros: FiltrosPessoas, pendentes: ReadonlySet<string>,
): Record<ChipPessoa, number> {
  const base = resumos.filter((r) => passaTipo(r, filtros.tipo) && passaOutros(r, filtros, pendentes));
  return Object.fromEntries(CHIPS.map((c) => [c, base.filter((r) => passaChip(r, c)).length])) as Record<ChipPessoa, number>;
}

/** Quantos filtros do popover estão ativos (o contador do botão "Filtros"). */
export function filtrosAtivos(f: FiltrosPessoas): number {
  const ligados = [f.voltou, f.comVisita, chipValido(f.tipo, f.chip) === "atrasadas", f.soMinhas, f.comercial !== "", f.formulario !== "", f.resultado !== ""];
  return ligados.filter(Boolean).length;
}

/** Quanto pior a saúde do pior negócio aberto, mais cedo; sem negócio aberto, no fim. */
const gravidade = (r: ResumoPessoa): number => (r.saude === null ? ORDEM_SAUDE.length : ORDEM_SAUDE.indexOf(r.saude));
const porNome = (a: ResumoPessoa, b: ResumoPessoa): number => a.pessoa.nome.localeCompare(b.pessoa.nome, "pt");
const flag = (v: boolean): number => Number(v);

/**
 * "Urgência" (por defeito): as perdidas no fim; antes delas quem voltou a contactar, depois as atrasadas e a pior
 * saúde. "Mais recentes": a que chegou há menos tempo primeiro. "Valor": o maior valor em jogo primeiro. Em empate, por nome.
 */
export function ordenarPessoas(
  resumos: readonly ResumoPessoa[], ordem: OrdemPessoa, pendentes: ReadonlySet<string>,
): ResumoPessoa[] {
  const comparar: Record<OrdemPessoa, (a: ResumoPessoa, b: ResumoPessoa) => number> = {
    urgencia: (a, b) =>
      flag(!!a.pessoa.perdida) - flag(!!b.pessoa.perdida) || flag(pendentes.has(b.pessoa.id)) - flag(pendentes.has(a.pessoa.id))
      || flag(b.atrasada) - flag(a.atrasada) || gravidade(a) - gravidade(b),
    recentes: (a, b) => (b.pessoa.desde ?? "").localeCompare(a.pessoa.desde ?? ""),
    valor: (a, b) => b.emJogo - a.emJogo,
  };
  return [...resumos].sort((a, b) => comparar[ordem](a, b) || porNome(a, b));
}
