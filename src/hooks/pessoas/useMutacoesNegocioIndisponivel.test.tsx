// Os erros depois dos quais o que o ecrã mostra já não vale: a pessoa já não está disponível (NG003) ou a funcionalidade não está ativa (NG008)
// fecham a ficha e voltam à Lista; NG001 e NG014 refazem a ficha. E a ficha refaz-se mesmo quando a leitura da resposta lança depois de a
// base ter escrito.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { PESSOA_ID } from "./fichaFabrica";
import { invalidadas, limparAcoes, prepararAcoes, semear } from "./acoesFichaTestUtil";
import { captureMock, criarCliente, fonteReal, montarHook, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import { useMutacoesNegocio } from "./useMutacoesNegocio";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

beforeEach(prepararAcoes);
afterEach(limparAcoes);

const NEG = "99999999-9999-4999-8999-999999999999";

function montar(aoIndisponivel?: (chave: string) => void) {
  const client = criarCliente();
  const r = montarHook(() => useMutacoesNegocio(PESSOA_ID, null, { aoIndisponivel }), undefined, { client, fonte: fonteReal() });
  return { ...r, client };
}
const perder = (r: ReturnType<typeof montar>) => r.result.current.perder({ negocioId: NEG, fase: "orcamento", motivo: "Preço" });

describe("erros que tornam a ficha indisponível", () => {
  it.each([["NG003", "ng003"], ["NG008", "ng008"]])("%s avisa quem monta, com a chave do erro (para fechar a ficha), sem refazer uma ficha que vai fechar", async (codigo, chave) => {
    rpcMock.mockReturnValue(respostaErro(codigo));
    const aoIndisponivel = vi.fn();
    const m = montar(aoIndisponivel);
    semear(m.client);
    await act(async () => { await perder(m).catch(() => undefined); });
    expect(invalidadas(m.client)).toEqual([false, false]);
    expect(aoIndisponivel).toHaveBeenCalledTimes(1);
    expect(aoIndisponivel).toHaveBeenCalledWith(`pessoasPagina.erroNeg.${chave}`);
  });

  it("os outros erros não fecham a ficha", async () => {
    rpcMock.mockReturnValue(respostaErro("NG001"));
    const aoIndisponivel = vi.fn();
    const m = montar(aoIndisponivel);
    await act(async () => { await perder(m).catch(() => undefined); });
    expect(aoIndisponivel).not.toHaveBeenCalled();
  });

  it("NG014 (o contrato ainda não se liga) refaz a ficha: o que se via estava desatualizado", async () => {
    rpcMock.mockReturnValue(respostaErro("NG014"));
    const m = montar();
    semear(m.client);
    await act(async () => { await m.result.current.ligar(NEG, { tipo: "contrato", id: "k1" }).catch(() => undefined); });
    expect(invalidadas(m.client)).toEqual([true, true]);
  });
});

describe("a leitura da resposta lança depois de a base ter escrito", () => {
  it("a ficha refaz-se na mesma (a escrita aconteceu), e o erro continua a chegar a quem chamou", async () => {
    rpcMock.mockReturnValue(respostaOk(null));
    const m = montar();
    semear(m.client);
    await act(async () => { await expect(perder(m)).rejects.toBeDefined(); });
    expect(invalidadas(m.client)).toEqual([true, true]);
  });
});
