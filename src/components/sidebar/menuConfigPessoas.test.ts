import { describe, expect, it } from "vitest";
import appSource from "@/App.tsx?raw";
import { menuSections } from "./menuConfig";

const crm = menuSections.find((s) => s.id === "crm")!;
const item = (to: string) => crm.items.find((i) => i.to === to)!;

describe("menuConfig: o item Pessoas do CRM", () => {
  it("pede a permissão pessoas.view e o interruptor da organização", () => {
    expect(item("/pessoas")).toMatchObject({ permission: "pessoas.view", requiresNegociosAtivos: true });
  });

  it("os outros itens do CRM não têm o campo", () => {
    for (const i of crm.items.filter((x) => x.to !== "/pessoas")) {
      expect(i.requiresNegociosAtivos, i.to).toBeUndefined();
    }
  });

  it("Leads e Clientes mantêm as permissões que tinham", () => {
    expect(item("/leads").permission).toBe("leads.view");
    expect(item("/clients").permission).toBe("clients.view");
  });

  it("nenhum item fora do CRM usa o campo", () => {
    const outros = menuSections.filter((s) => s.id !== "crm")
      .flatMap((s) => [...s.items, ...(s.subSections?.flatMap((x) => x.items) ?? [])]);
    expect(outros.filter((i) => i.requiresNegociosAtivos)).toEqual([]);
  });
});

describe("App.tsx: a rota /pessoas", () => {
  const linha = appSource.split(/\r?\n/).find((l) => l.includes('path="/pessoas"')) ?? "";

  it("exige pessoas.view e passa pela guarda PessoasRota", () => {
    expect(linha).toContain('permission="pessoas.view"');
    expect(linha).toContain("<PessoasRota>");
    expect(linha).not.toContain('permission="leads.view"');
  });

  it("a guarda de permissão envolve a guarda do interruptor, que envolve a página", () => {
    expect(linha).toMatch(/<ProtectedRoute permission="pessoas\.view"><PessoasRota><Pessoas \/><\/PessoasRota><\/ProtectedRoute>/);
  });

  it("importa a PessoasRota", () => {
    expect(appSource).toMatch(/import\s+\{\s*PessoasRota\s*\}\s+from\s+["']@?[./a-z-]*pessoas-lista\/PessoasRota["']/);
  });
});
