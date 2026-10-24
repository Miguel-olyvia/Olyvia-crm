// Só para testes: o estado do Quadro real (o que useQuadroPessoas devolve), num estado calmo.
import type { CartaoQuadro, ColunaQuadro } from "@/components/pessoas/quadro/cartoesQuadroPessoas";
import { COLUNAS_QUADRO } from "@/components/pessoas/quadro/cartoesQuadroPessoas";
import type { ColunasQuadro, EstadoColuna } from "@/hooks/pessoas/quadroPessoasTipos";
import type { QuadroPessoasEstado } from "@/hooks/pessoas/useQuadroPessoas";

export function cartaoQuadro(id: string, sobre: Partial<CartaoQuadro> = {}): CartaoQuadro {
  return {
    id: `pessoa-${id}`, tipo: "pessoa", pessoaId: id, nome: `Pessoa ${id}`, papel: "lead", coluna: "porContactar", trabalho: null,
    valor: null, passo: "registarChamada", prazo: null, atrasado: false, ...sobre,
  };
}

/** As 7 colunas a partir dos cartões; `extras` afina uma coluna (total, valor, haMais). */
export function colunasDe(cartoes: readonly CartaoQuadro[], extras: Partial<Record<ColunaQuadro, Partial<EstadoColuna>>> = {}): ColunasQuadro {
  const fora = {} as ColunasQuadro;
  for (const def of COLUNAS_QUADRO) {
    const dela = cartoes.filter((c) => c.coluna === def.id);
    fora[def.id] = { cartoes: dela, cursor: null, haMais: false, total: dela.length, valor: 0, ...extras[def.id] };
  }
  return fora;
}

/**
 * Para os testes da Lista: a página chama sempre `useQuadroPessoas` (desligado fora do Quadro), e esse hook precisa de QueryClient.
 * Uso: vi.mock("@/hooks/pessoas/useQuadroPessoas", async () => (await import("./fabricaQuadro")).moduloSemQuadro());
 */
export function moduloSemQuadro() {
  const calmo = quadroBase();
  return { useQuadroPessoas: () => calmo };
}

export function quadroBase(sobre: Partial<QuadroPessoasEstado> = {}, cartoes: readonly CartaoQuadro[] = [], extras: Parameters<typeof colunasDe>[1] = {}): QuadroPessoasEstado {
  return {
    colunas: colunasDe(cartoes, extras), cartoes: [...cartoes], isLoading: false, isFetching: false, aMostrarAnterior: false,
    isError: false, erroSemDados: false, erro: null, aCarregarMais: new Set(), errosAoCarregarMais: {},
    carregarMais: () => false, recarregar: () => undefined, ...sobre,
  };
}
