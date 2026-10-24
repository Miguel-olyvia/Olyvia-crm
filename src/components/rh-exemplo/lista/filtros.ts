// A pesquisa e os chips de filtro da lista de pessoas de RH. Funções puras. A pesquisa vê o nome, o cargo, o número interno e
// o e-mail de trabalho; o chip é o estado do acesso à plataforma (que é diferente do estado do contrato). Os números dos
// chips respeitam a pesquisa, para o utilizador ver quantas pessoas teria se mudasse de chip.
import type { EstadoAcesso, PessoaListItem } from "@/components/rh-exemplo/tipos";

export type FiltroAcesso = "todas" | EstadoAcesso;
export const FILTROS: readonly FiltroAcesso[] = ["todas", "ativo", "convidado", "semConta"];

type ParaFiltrar = Pick<PessoaListItem, "nome_completo" | "cargo" | "numero_interno" | "email_trabalho" | "estadoAcesso">;

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** As pessoas que contêm `termo` (sem distinguir maiúsculas nem acentos) num dos campos pesquisáveis; sem termo, todas. */
export function procurar<T extends ParaFiltrar>(pessoas: readonly T[], termo: string): T[] {
  const alvo = normalizar(termo.trim());
  if (alvo === "") return [...pessoas];
  return pessoas.filter((p) =>
    [p.nome_completo, p.cargo, p.numero_interno, p.email_trabalho].some((campo) => campo != null && normalizar(campo).includes(alvo)),
  );
}

export function filtrar<T extends ParaFiltrar>(pessoas: readonly T[], termo: string, filtro: FiltroAcesso): T[] {
  const encontradas = procurar(pessoas, termo);
  return filtro === "todas" ? encontradas : encontradas.filter((p) => p.estadoAcesso === filtro);
}

/** Quantas pessoas há em cada chip, dentro do que a pesquisa já encontra. */
export function contagens<T extends ParaFiltrar>(pessoas: readonly T[], termo: string): Record<FiltroAcesso, number> {
  const encontradas = procurar(pessoas, termo);
  const por = (estado: EstadoAcesso) => encontradas.filter((p) => p.estadoAcesso === estado).length;
  return { todas: encontradas.length, ativo: por("ativo"), convidado: por("convidado"), semConta: por("semConta") };
}
