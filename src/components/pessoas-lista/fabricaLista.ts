// Só para testes: pessoas e estados da Lista real, com valores por omissão.
import type { PessoaDaLista } from "@/hooks/pessoas/listaPessoasTipos";
import type { ListaPessoas } from "@/hooks/pessoas/useListaPessoas";

export function pessoaLista(id: string, sobre: Partial<PessoaDaLista> = {}): PessoaDaLista {
  return {
    id, nome: `Pessoa ${id}`, papel: "lead", leadId: null, clienteId: null, responsavelId: null,
    etapa: "nova", faseEtapa: null, encerrada: null, abertos: 0, ganhos: 0, perdidos: 0,
    prontoAGanhar: false, valorEmJogo: 0, ultimoContactoEm: null, diasSemContacto: null, proximaVisitaEm: null,
    leadStatus: null, ultimaVisitaFeitaEm: null, ultimoNegocioEm: null, porLigarContactos: 0, porLigarVisitas: 0,
    porLigarLevantamentos: 0, passo: "registarChamada",
    ...sobre,
  };
}

/** O que useListaPessoas devolve, num estado calmo (carregado, sem erros, sem mais páginas). */
export function listaBase(sobre: Partial<ListaPessoas> = {}): ListaPessoas {
  return {
    linhas: [], isLoading: false, isFetching: false, isFetchingMore: false, aMostrarAnterior: false,
    isError: false, erroSemDados: false, erro: null, erroAoCarregarMais: null, haMais: false,
    carregarMais: () => undefined, recarregar: () => undefined,
    ...sobre,
  };
}
