// Quem pode apagar uma pessoa: pessoas.delete + pessoas.edit + leads.delete (lead) ou clients.delete (cliente). A carregar, ninguém.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePodeApagarPessoa } from "./usePodeApagarPessoa";

let estado: { loading: boolean; getPermissionScope?: (c: string) => string } = { loading: false };
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => estado }));

const com = (codigos: string[], loading = false) => {
  estado = { loading, getPermissionScope: (c: string) => (codigos.includes(c) ? "ORG" : "NONE") };
};

describe("usePodeApagarPessoa", () => {
  beforeEach(() => { estado = { loading: false }; });

  it("com tudo apaga leads e clientes", () => {
    com(["pessoas.delete", "pessoas.edit", "leads.delete", "clients.delete"]);
    expect(renderHook(() => usePodeApagarPessoa()).result.current).toEqual({ lead: true, cliente: true });
  });

  it("só leads.delete: apaga leads, não clientes", () => {
    com(["pessoas.delete", "pessoas.edit", "leads.delete"]);
    expect(renderHook(() => usePodeApagarPessoa()).result.current).toEqual({ lead: true, cliente: false });
  });

  it("sem pessoas.delete ou sem pessoas.edit ninguém apaga", () => {
    com(["pessoas.edit", "leads.delete", "clients.delete"]);
    expect(renderHook(() => usePodeApagarPessoa()).result.current).toEqual({ lead: false, cliente: false });
    com(["pessoas.delete", "leads.delete", "clients.delete"]);
    expect(renderHook(() => usePodeApagarPessoa()).result.current).toEqual({ lead: false, cliente: false });
  });

  it("a carregar, ou sem a função, ninguém apaga", () => {
    com(["pessoas.delete", "pessoas.edit", "leads.delete", "clients.delete"], true);
    expect(renderHook(() => usePodeApagarPessoa()).result.current).toEqual({ lead: false, cliente: false });
    estado = { loading: false };
    expect(renderHook(() => usePodeApagarPessoa()).result.current).toEqual({ lead: false, cliente: false });
  });
});
