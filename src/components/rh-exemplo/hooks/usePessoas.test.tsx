/**
 * O wrapper de `usePessoas` do rh-exemplo entrega ao hook real o payload COMPLETO, sem o reduzir, e devolve ao ecra
 * tanto as falhas por seccao como o que nao tem coluna (`naoGravado`). Uma recusa do hook real nao se engole.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { NovaPessoaPayload } from "@/lib/hr/novaPessoa";

const criarReal = vi.fn();
vi.mock("@/hooks/usePessoas", () => ({
  usePessoas: () => ({
    pessoas: [], stats: { activos: 0, entradas90d: 0, saidas90d: 0 }, loading: false, error: null, refresh: vi.fn(),
    criarPessoa: criarReal,
  }),
}));

import { usePessoas, type NovaPessoaExemplo } from "./usePessoas";

const PAYLOAD = {
  nucleo: { primeiro_nome: "Teresa", apelido: "Nogueira", email_trabalho: "t@x.pt", cargo_id: "c1", cargo: "Vendedor" },
  niss: "12345678902",
  conta: { formato: "iban", numero: "PT50", swift: null, titular: null, banco: null },
  retribuicao: { subsidio: 7.63, subsidioModo: "cartao", duodecimosPct: 50 },
  saude: { observacoes: "x" },
  horario: [{ dia_semana: 1 }],
  contaALigar: null,
} as unknown as NovaPessoaPayload;

const DADOS = (sobre: Partial<NovaPessoaExemplo> = {}): NovaPessoaExemplo => ({
  primeiro_nome: "Teresa", apelido: "Nogueira", cargoId: "c1", localId: "", tipoContrato: "sem_termo",
  dataInicio: "2026-10-01", dataFim: null, reportaAId: null, payload: PAYLOAD, naoGravado: [], ...sobre,
});

// Com chavetas: um `beforeEach` que devolve uma funcao trata-a como limpeza e chama-a no fim de cada teste.
beforeEach(() => { criarReal.mockReset(); });

describe("usePessoas (rh-exemplo).criarPessoa", () => {
  it("entrega ao hook real o payload completo, tal e qual (nada e reduzido)", async () => {
    criarReal.mockResolvedValue({ id: "p1", falhas: [] });
    const { result } = renderHook(() => usePessoas());
    await act(async () => { await result.current.criarPessoa(DADOS()); });
    expect(criarReal).toHaveBeenCalledTimes(1);
    expect(criarReal.mock.calls[0][0]).toBe(PAYLOAD);
  });

  it("devolve as falhas por seccao e o que nao foi gravado, para o ecra os dizer", async () => {
    criarReal.mockResolvedValue({ id: "p1", falhas: [{ seccao: "niss", mensagem: "NISS invalido" }] });
    const { result } = renderHook(() => usePessoas());
    let r: Awaited<ReturnType<typeof result.current.criarPessoa>> | undefined;
    await act(async () => { r = await result.current.criarPessoa(DADOS({ naoGravado: ["anexos"] })); });
    expect(r).toEqual({ id: "p1", falhas: [{ seccao: "niss", mensagem: "NISS invalido" }], naoGravado: ["anexos"] });
  });

  it("uma recusa do hook real chega a quem chama (nao e engolida)", async () => {
    // Lanca de forma sincrona: o wrapper e `async`, por isso a recusa chega a quem chama como promessa rejeitada.
    criarReal.mockImplementation(() => { throw new Error("sem permissao"); });
    const { result } = renderHook(() => usePessoas());
    let recusa: unknown = null;
    await act(async () => {
      try {
        await result.current.criarPessoa(DADOS());
      } catch (e) {
        recusa = e;
      }
    });
    expect(recusa).toBeInstanceOf(Error);
    expect((recusa as Error).message).toBe("sem permissao");
  });
});
