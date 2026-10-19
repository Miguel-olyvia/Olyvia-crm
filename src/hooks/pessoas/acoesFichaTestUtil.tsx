// Só para testes: o que os testes de useAcoesFichaReal partilham (relógio e uuid fixos, montagem do hook, ficha e verificação das invalidações).
// Os vi.mock do Supabase ficam em cada ficheiro de teste (apontam para o `rpcMock` de fichaTestUtil).
import { vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ErroNeg } from "./chamarNeg";
import { fichaDb, PESSOA_ID, seccaoDb, visitaDb } from "./fichaFabrica";
import { captureMock, criarCliente, fonteReal, montarHook, rpcMock } from "./fichaTestUtil";
import { useAcoesFichaReal } from "./useAcoesFichaReal";

// 19/10/2026 12:00 UTC: Lisboa em hora de verão (UTC+1) até 25/10.
export const AGORA = "2026-10-19T12:00:00.000Z";
export const FICHA = fichaDb({ visitas: seccaoDb([
  visitaDb({ id: "passada", inicio: "2026-10-18T09:00:00Z" }), visitaDb({ id: "futura", inicio: "2026-10-25T09:00:00Z" }),
]) });

/** Antes de cada teste: rpc limpo, uuid sequencial (uuid-1, uuid-2...) e só a Date simulada, parada em AGORA. */
export function prepararAcoes(): void {
  rpcMock.mockReset();
  captureMock.mockReset();
  let contador = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `uuid-${++contador}` });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(AGORA));
}

export function limparAcoes(): void {
  vi.useRealTimers();
  vi.unstubAllGlobals();
}

type Opcoes = { client?: QueryClient; ficha?: typeof FICHA | null; fonte?: ReturnType<typeof fonteReal> | { modo: "exemplo" } };

export function montarAcoes(opcoes: Opcoes = {}) {
  const client = opcoes.client ?? criarCliente();
  const r = montarHook(
    (p: { ficha: typeof FICHA | null }) => useAcoesFichaReal(PESSOA_ID, p.ficha),
    { ficha: opcoes.ficha === undefined ? FICHA : opcoes.ficha },
    { client, fonte: opcoes.fonte ?? fonteReal() },
  );
  return { ...r, client };
}

export const chamadas = (): string[] => rpcMock.mock.calls.map((c) => c[0] as string);
export const erroDe = async (p: Promise<unknown> | void): Promise<ErroNeg> => ((await Promise.resolve(p).then(() => null, (e) => e)) as ErroNeg);

export function semear(client: QueryClient): void {
  client.setQueryData(["neg-ficha-pessoa", "org-1", PESSOA_ID], { x: 1 });
  client.setQueryData(["neg-resumo-pessoas", "org-1", { papel: null }], { x: 2 });
}

/** [a ficha, a lista] estão invalidadas? */
export const invalidadas = (client: QueryClient): (boolean | undefined)[] => [
  client.getQueryState(["neg-ficha-pessoa", "org-1", PESSOA_ID])?.isInvalidated,
  client.getQueryState(["neg-resumo-pessoas", "org-1", { papel: null }])?.isInvalidated,
];
