/**
 * `useAnexosNovaPessoa`: ficheiros em memoria para o dialogo Nova pessoa,
 * enviados um a um DEPOIS de a ficha existir. Uma falha nunca desfaz a ficha
 * nem para os restantes; o hook nunca lanca.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const enviarUm = vi.fn();
vi.mock("../useAnexarAnexoRh", () => ({
  useAnexarAnexoRh: () => ({ envios: {}, enviar: (...a: unknown[]) => enviarUm(...a), descartarEnvio: vi.fn() }),
}));

import { useAnexosNovaPessoa } from "../useAnexosNovaPessoa";

function pdf(nome = "a.pdf", tamanho = 10): File {
  return new File([new Uint8Array(tamanho)], nome, { type: "application/pdf" });
}
function png(nome = "f.png", tamanho = 10): File {
  return new File([new Uint8Array(tamanho)], nome, { type: "image/png" });
}

const OK = { ok: true, codigo: null, anexo: null };

beforeEach(() => {
  enviarUm.mockReset().mockResolvedValue(OK);
});

describe("escolher / retirar / limpar", () => {
  it("comeca vazio", () => {
    const { result } = renderHook(() => useAnexosNovaPessoa());
    expect(result.current.temFicheiros).toBe(false);
    expect(result.current.ficheiros).toEqual({ cartao_cidadao: [], comprovativo_iban: [], fotografia: [] });
  });

  it("escolhe um ficheiro valido e devolve null", () => {
    const { result } = renderHook(() => useAnexosNovaPessoa());
    let recusa: string | null = "x";
    act(() => {
      recusa = result.current.escolher("cartao_cidadao", pdf());
    });
    expect(recusa).toBeNull();
    expect(result.current.temFicheiros).toBe(true);
    expect(result.current.ficheiros.cartao_cidadao.map((i) => i.file.name)).toEqual(["a.pdf"]);
  });

  it("recusa o que a validacao local recusa, sem o guardar, e diz o codigo", () => {
    const { result } = renderHook(() => useAnexosNovaPessoa());
    let recusa: string | null = null;
    act(() => {
      recusa = result.current.escolher("fotografia", pdf());
    });
    expect(recusa).toBe("anexo_fotografia_formato");
    expect(result.current.temFicheiros).toBe(false);
    expect(result.current.erroEscolha).toEqual({ tipo: "fotografia", codigo: "anexo_fotografia_formato" });
  });

  it("respeita o limite por tipo (cartao 2, fotografia 1) e o total de 4", () => {
    const { result } = renderHook(() => useAnexosNovaPessoa());
    const codigos: Array<string | null> = [];
    act(() => {
      codigos.push(result.current.escolher("cartao_cidadao", pdf("1.pdf")));
      codigos.push(result.current.escolher("cartao_cidadao", pdf("2.pdf")));
      codigos.push(result.current.escolher("cartao_cidadao", pdf("3.pdf")));
      codigos.push(result.current.escolher("fotografia", png("f1.png")));
      codigos.push(result.current.escolher("fotografia", png("f2.png")));
      codigos.push(result.current.escolher("comprovativo_iban", pdf("i.pdf")));
      codigos.push(result.current.escolher("comprovativo_iban", pdf("i2.pdf")));
    });
    expect(codigos).toEqual([
      null,
      null,
      "anexo_tipo_cheio",
      null,
      "anexo_tipo_cheio",
      null,
      "anexo_maximo_ficheiros",
    ]);
  });

  it("retirar tira pelo indice; indice invalido nao faz nada", () => {
    const { result } = renderHook(() => useAnexosNovaPessoa());
    act(() => {
      result.current.escolher("cartao_cidadao", pdf("1.pdf"));
      result.current.escolher("cartao_cidadao", pdf("2.pdf"));
    });
    act(() => result.current.retirar("cartao_cidadao", 0));
    expect(result.current.ficheiros.cartao_cidadao.map((i) => i.file.name)).toEqual(["2.pdf"]);
    act(() => result.current.retirar("cartao_cidadao", 7));
    act(() => result.current.retirar("cartao_cidadao", -1));
    expect(result.current.ficheiros.cartao_cidadao).toHaveLength(1);
  });

  it("limpar esvazia tudo, incluindo o erro de escolha", () => {
    const { result } = renderHook(() => useAnexosNovaPessoa());
    act(() => {
      result.current.escolher("cartao_cidadao", pdf());
      result.current.escolher("fotografia", pdf());
    });
    act(() => result.current.limpar());
    expect(result.current.temFicheiros).toBe(false);
    expect(result.current.erroEscolha).toBeNull();
  });
});

describe("enviar", () => {
  it("sem ficheiros devolve lista vazia e nao chama nada", async () => {
    const { result } = renderHook(() => useAnexosNovaPessoa());
    let falhas: unknown[] = ["x"];
    await act(async () => {
      falhas = await result.current.enviar("p1");
    });
    expect(falhas).toEqual([]);
    expect(enviarUm).not.toHaveBeenCalled();
  });

  it("envia em sequencia: o segundo so comeca depois de o primeiro acabar", async () => {
    const ordem: string[] = [];
    let acabarPrimeiro: (v: unknown) => void = () => {};
    enviarUm.mockImplementation((_p: string, tipo: string, file: File) => {
      ordem.push(`inicio:${file.name}`);
      if (tipo === "cartao_cidadao" && file.name === "1.pdf") {
        return new Promise((resolve) => {
          acabarPrimeiro = (v) => {
            ordem.push("fim:1.pdf");
            resolve(v);
          };
        });
      }
      ordem.push(`fim:${file.name}`);
      return Promise.resolve(OK);
    });

    const { result } = renderHook(() => useAnexosNovaPessoa());
    act(() => {
      result.current.escolher("cartao_cidadao", pdf("1.pdf"));
      result.current.escolher("fotografia", png("f.png"));
    });
    let promessa: Promise<unknown>;
    act(() => {
      promessa = result.current.enviar("p1");
    });
    await vi.waitFor(() => expect(ordem).toEqual(["inicio:1.pdf"]));
    await act(async () => {
      acabarPrimeiro(OK);
      await promessa;
    });
    expect(ordem).toEqual(["inicio:1.pdf", "fim:1.pdf", "inicio:f.png", "fim:f.png"]);
    expect(enviarUm).toHaveBeenCalledWith("p1", "cartao_cidadao", expect.any(File));
  });

  it("falha parcial: uma so FalhaAnexos, os restantes continuam e a que falhou fica com o codigo", async () => {
    enviarUm.mockImplementation(async (_p: string, _t: string, file: File) =>
      file.name === "2.pdf" ? { ok: false, codigo: "anexo_formato_invalido", anexo: null } : OK,
    );
    const { result } = renderHook(() => useAnexosNovaPessoa());
    act(() => {
      result.current.escolher("cartao_cidadao", pdf("1.pdf"));
      result.current.escolher("cartao_cidadao", pdf("2.pdf"));
      result.current.escolher("fotografia", png("f.png"));
    });
    let falhas: Array<{ seccao: string; mensagem: string }> = [];
    await act(async () => {
      falhas = await result.current.enviar("p1");
    });
    expect(enviarUm).toHaveBeenCalledTimes(3);
    expect(falhas).toHaveLength(1);
    expect(falhas[0].seccao).toBe("anexos");
    expect(falhas[0].mensagem).toContain("1/3");
    // O que foi enviado sai da lista; o que falhou fica, com o codigo, para o RH ver.
    expect(result.current.ficheiros.cartao_cidadao.map((i) => [i.file.name, i.codigoErro])).toEqual([
      ["2.pdf", "anexo_formato_invalido"],
    ]);
    expect(result.current.ficheiros.fotografia).toEqual([]);
  });

  it("nunca lanca, mesmo que o envio lance", async () => {
    enviarUm.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAnexosNovaPessoa());
    act(() => {
      result.current.escolher("cartao_cidadao", pdf());
    });
    let falhas: unknown[] = [];
    await act(async () => {
      falhas = await result.current.enviar("p1");
    });
    expect(falhas).toHaveLength(1);
    expect(result.current.ficheiros.cartao_cidadao[0].codigoErro).toBe("anexo_falha_envio");
  });

  it("aEnviar e verdadeiro durante o envio e falso no fim", async () => {
    let acabar: (v: unknown) => void = () => {};
    enviarUm.mockImplementation(() => new Promise((resolve) => (acabar = resolve)));
    const { result } = renderHook(() => useAnexosNovaPessoa());
    act(() => {
      result.current.escolher("cartao_cidadao", pdf());
    });
    let promessa: Promise<unknown>;
    act(() => {
      promessa = result.current.enviar("p1");
    });
    expect(result.current.aEnviar).toBe(true);
    await act(async () => {
      acabar(OK);
      await promessa;
    });
    expect(result.current.aEnviar).toBe(false);
  });
});
