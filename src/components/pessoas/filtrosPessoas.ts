// Filtros, contagens dos chips e ordenação da lista de pessoas. Funções puras.
import { ORDEM_SAUDE } from "@/components/negocio-metas/saudeNegocio";
import type { ChipPessoa, FiltrosPessoas, OrdemPessoa, Pessoa, ResumoPessoa } from "./pessoasTipos";

/** "Sem contacto 7+": há 7 ou mais dias sem contacto. */
export const LIMITE_SEM_CONTACTO = 7;

export const CHIPS: readonly ChipPessoa[] = ["todos", "leads", "clientes", "semNegocio", "voltou", "semContacto"];
export const ORDENS: readonly OrdemPessoa[] = ["atencao", "nome", "ultimoContacto", "valor"];
export const FILTROS_INICIAIS: FiltrosPessoas = { chip: "todos", pesquisa: "" };

const normalizar = (texto: string): string =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const soDigitos = (texto: string): string => texto.replace(/\D/g, "");

/** A pesquisa encontra o nome, o email ou o telefone (este com ou sem espaços). */
export function pesquisaCorresponde(pessoa: Pessoa, pesquisa: string): boolean {
  const q = normalizar(pesquisa);
  if (q === "") return true;
  const { telefone, email } = pessoa.contacto;
  if (normalizar(pessoa.nome).includes(q) || normalizar(email ?? "").includes(q)) return true;
  const digitos = soDigitos(q);
  const soNumero = digitos.length > 0 && /^[\d\s+()-]+$/.test(q);
  return soNumero && soDigitos(telefone ?? "").includes(digitos);
}

function passaChip(r: ResumoPessoa, chip: ChipPessoa, pendentes: ReadonlySet<string>): boolean {
  switch (chip) {
    case "leads": return r.papel === "lead";
    case "clientes": return r.papel === "cliente";
    case "semNegocio": return r.semNegocio;
    case "voltou": return pendentes.has(r.pessoa.id);
    case "semContacto": return r.pessoa.ultimoContactoDias >= LIMITE_SEM_CONTACTO;
    default: return true;
  }
}

export function filtrarPessoas(
  resumos: readonly ResumoPessoa[], filtros: FiltrosPessoas, pendentes: ReadonlySet<string>,
): ResumoPessoa[] {
  return resumos.filter(
    (r) => passaChip(r, filtros.chip, pendentes) && pesquisaCorresponde(r.pessoa, filtros.pesquisa),
  );
}

/** A contagem de cada chip, com a pesquisa aplicada (os outros filtros). */
export function contagensChips(
  resumos: readonly ResumoPessoa[], pesquisa: string, pendentes: ReadonlySet<string>,
): Record<ChipPessoa, number> {
  const base = resumos.filter((r) => pesquisaCorresponde(r.pessoa, pesquisa));
  const contar = (chip: ChipPessoa) => base.filter((r) => passaChip(r, chip, pendentes)).length;
  return Object.fromEntries(CHIPS.map((c) => [c, contar(c)])) as Record<ChipPessoa, number>;
}

/** Quanto pior a saúde do pior negócio aberto, mais cedo; sem negócio aberto, no fim. */
const gravidade = (r: ResumoPessoa): number => (r.saude === null ? ORDEM_SAUDE.length : ORDEM_SAUDE.indexOf(r.saude));
const porNome = (a: ResumoPessoa, b: ResumoPessoa): number => a.pessoa.nome.localeCompare(b.pessoa.nome, "pt");

/**
 * "Precisa de atenção" (por defeito): com submissão pendente primeiro, depois a pior saúde.
 * "Último contacto": há mais tempo sem contacto primeiro. "Valor": o maior primeiro.
 * Em empate, por nome.
 */
export function ordenarPessoas(
  resumos: readonly ResumoPessoa[], ordem: OrdemPessoa, pendentes: ReadonlySet<string>,
): ResumoPessoa[] {
  const comparar: Record<OrdemPessoa, (a: ResumoPessoa, b: ResumoPessoa) => number> = {
    atencao: (a, b) =>
      Number(pendentes.has(b.pessoa.id)) - Number(pendentes.has(a.pessoa.id)) || gravidade(a) - gravidade(b),
    nome: () => 0,
    ultimoContacto: (a, b) => b.pessoa.ultimoContactoDias - a.pessoa.ultimoContactoDias,
    valor: (a, b) => b.valor - a.valor,
  };
  return [...resumos].sort((a, b) => comparar[ordem](a, b) || porNome(a, b));
}
