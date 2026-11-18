// A preferência de idioma também serve as propostas: mesma lógica, outro prefixo de chave, para um template de
// proposta nunca herdar (nem sobrepor) a escolha de uma minuta de contrato. Sem prefixo, tudo igual a antes.
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: vi.fn(async () => "u1") }));

import { chavePreferencia, guardarPreferencia, lerPreferencia, useEscolhaDeIdiomas } from "../idiomaPreferido";

const PROPOSTA = "olyvia:idioma-proposta";

describe("idiomaPreferido com prefixo (propostas)", () => {
  beforeEach(() => window.localStorage.clear());

  it("sem prefixo a chave é a de sempre (contratos)", () => {
    expect(chavePreferencia("u1", "m1")).toBe("olyvia:idioma-contrato:u1:m1");
  });

  it("com prefixo a chave é outra e as duas preferências não se misturam", () => {
    expect(chavePreferencia("u1", "t1", PROPOSTA)).toBe("olyvia:idioma-proposta:u1:t1");
    guardarPreferencia("u1", "t1", ["en"], PROPOSTA);
    expect(lerPreferencia("u1", "t1", PROPOSTA)).toEqual(["en"]);
    expect(lerPreferencia("u1", "t1")).toBeNull();
  });

  it("o hook pré-seleciona o último idioma usado com este template de proposta", async () => {
    guardarPreferencia("u1", "t1", ["pt", "en"], PROPOSTA);
    const { result } = renderHook(() => useEscolhaDeIdiomas("t1", ["pt", "en"], "pt", PROPOSTA));
    await waitFor(() => expect(result.current.escolha).toEqual(["pt", "en"]));
  });

  it("o hook não lê a preferência de um contrato com o mesmo id", async () => {
    guardarPreferencia("u1", "t1", ["en"]);
    const { result } = renderHook(() => useEscolhaDeIdiomas("t1", ["pt", "en"], "pt", PROPOSTA));
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.escolha).toEqual(["pt"]);
  });

  it("mudar a escolha grava sob o prefixo das propostas", async () => {
    const { result } = renderHook(() => useEscolhaDeIdiomas("t1", ["pt", "en"], "pt", PROPOSTA));
    result.current.mudar(["en"]);
    await waitFor(() => expect(window.localStorage.getItem("olyvia:idioma-proposta:u1:t1")).toBe("en"));
    expect(window.localStorage.getItem("olyvia:idioma-contrato:u1:t1")).toBeNull();
  });
});
