// As permissões que o ecrã de fecho esconde ou mostra: as dos documentos (quotes, proposals, client_contracts: criar e editar), pessoas.reopen
// e leads.convert. Conta como «tem» qualquer âmbito diferente de NONE (a base decide o âmbito exato); sem a função, ou com ela a carregar, conta
// como «não tem». A lista é estável entre renders enquanto nada mudar.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { CODIGOS_PERMISSOES_FECHO, usePermissoesDoFecho } from "./usePermissoesDoFecho";

const escopo = vi.hoisted(() => ({ valor: null as unknown }));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => escopo.valor }));

describe("usePermissoesDoFecho", () => {
  beforeEach(() => { escopo.valor = null; });

  it("pergunta exatamente as oito permissões do fecho", () => {
    expect([...CODIGOS_PERMISSOES_FECHO].sort()).toEqual([
      "client_contracts.create", "client_contracts.edit", "leads.convert", "pessoas.reopen",
      "proposals.create", "proposals.edit", "quotes.create", "quotes.edit",
    ]);
  });

  it("devolve as que têm âmbito (qualquer diferente de NONE)", () => {
    escopo.valor = { anewUserId: "u1", getPermissionScope: (c: string) => ({ "proposals.edit": "OWNED", "pessoas.reopen": "ORG", "quotes.edit": "NONE" }[c] ?? "NONE") };
    const { result } = renderHook(() => usePermissoesDoFecho());
    expect([...result.current].sort()).toEqual(["pessoas.reopen", "proposals.edit"]);
  });

  it("sem getPermissionScope (um simulado parcial) devolve undefined, nunca uma lista vazia", () => {
    escopo.valor = {};
    expect(renderHook(() => usePermissoesDoFecho()).result.current).toBeUndefined();
  });

  it("enquanto o âmbito carrega devolve undefined (a lista vazia escondia todos os botões)", () => {
    escopo.valor = { loading: true, anewUserId: null, getPermissionScope: () => "NONE" };
    expect(renderHook(() => usePermissoesDoFecho()).result.current).toBeUndefined();
  });

  it("se a leitura falhou (acabou de carregar sem utilizador) devolve undefined", () => {
    escopo.valor = { loading: false, anewUserId: null, getPermissionScope: () => "NONE" };
    expect(renderHook(() => usePermissoesDoFecho()).result.current).toBeUndefined();
  });

  it("lida e sem nenhuma permissão devolve a lista vazia (aí sim restringe)", () => {
    escopo.valor = { loading: false, anewUserId: "u1", getPermissionScope: () => "NONE" };
    expect(renderHook(() => usePermissoesDoFecho()).result.current).toEqual([]);
  });

  it("a lista mantém a identidade entre renders quando nada muda", () => {
    escopo.valor = { anewUserId: "u1", getPermissionScope: () => "ORG" };
    const { result, rerender } = renderHook(() => usePermissoesDoFecho());
    const primeira = result.current;
    rerender();
    expect(result.current).toBe(primeira);
  });
});
