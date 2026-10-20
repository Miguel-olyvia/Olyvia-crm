// Só para testes (nenhum código da página o importa): mutações e dados de uma ficha real falsos, o provider que os monta e uma ação que fica
// pendente até o teste a resolver ou rejeitar.
import { vi } from "vitest";
import { act } from "@testing-library/react";
import type { ReactNode } from "react";
import { DadosNegocioContext, type DadosNegocio } from "./costuraNegocio";
import { MutacoesNegocioContext, type MutacoesNegocio } from "./mutacoesNegocio";
import { REGISTOS_VAZIOS } from "./registosTipos";

export const mutacoesFalsas = (extra: Partial<MutacoesNegocio> = {}): MutacoesNegocio => ({
  perder: vi.fn(async () => ({ mudou: true })),
  anular: vi.fn(async () => ({ mudou: true })),
  ligar: vi.fn(async () => undefined),
  desligar: vi.fn(async () => undefined),
  ganhar: vi.fn(async () => ({ mudou: true, conversao: "feita" as const, outrasLeadsAbertas: 0 })),
  criar: vi.fn(async (p) => ({ negocioId: p.id, mudou: true, recusados: [] })),
  criarComDocumentos: false,
  refrescar: vi.fn(),
  ...extra,
});

export const dadosFalsos = (extra: Partial<DadosNegocio> = {}): DadosNegocio => ({
  registos: REGISTOS_VAZIOS,
  alteracoes: { editados: {}, perdidos: {}, detalhes: {}, sequencia: 0 },
  detalhe: () => null,
  momentoGanho: "manual", podeEditar: true, podeCriar: true, leadsAbertas: [], levantamentosCompletos: true, documentosPorLigar: [],
  ...extra,
});

interface ComCosturaProps {
  mutacoes?: MutacoesNegocio | null;
  dados?: DadosNegocio | null;
  children: ReactNode;
}

/** Monta a ficha real falsa à volta de `children`; sem `dados` ou `mutacoes` usa os valores por omissão, e `null` tira o provider. */
export function ComCostura({ mutacoes, dados, children }: ComCosturaProps) {
  return (
    <DadosNegocioContext.Provider value={dados === undefined ? dadosFalsos() : dados}>
      <MutacoesNegocioContext.Provider value={mutacoes === undefined ? mutacoesFalsas() : mutacoes}>{children}</MutacoesNegocioContext.Provider>
    </DadosNegocioContext.Provider>
  );
}

/** Uma ação que fica pendente até o teste a resolver (com um valor) ou rejeitar. */
export function pendente<T = void>() {
  let resolver: (valor: T) => void = () => undefined;
  let rejeitar: (erro: unknown) => void = () => undefined;
  const promessa = new Promise<T>((res, rej) => { resolver = res; rejeitar = rej; });
  return {
    promessa,
    terminar: (valor: T) => act(async () => { resolver(valor); await promessa; }),
    falhar: (erro: unknown) => act(async () => { rejeitar(erro); await promessa.catch(() => undefined); }),
  };
}

/** Um erro como o `ErroNeg` da base: só a chave interessa aos ecrãs. */
export const erroNegFalso = (chave: string, codigo: string | null = null) => Object.assign(new Error("x"), { chave, codigo });
