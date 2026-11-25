// O ecrã «Ativos» (fase 1): a rota /ativos e a entrada do menu pedem ativos.view (permissão própria, só dos super admins), a mesma
// na rota e no menu; as permissões novas estão na lista «em uso» do editor de papéis e as antigas assets.* continuam escondidas.
import { describe, expect, it } from "vitest";
import appSource from "@/App.tsx?raw";
import { tabelaFundida } from "@/translations/tabelaFundida";
import { agruparPorMenu } from "@/components/utilizadores-perfis/gruposPermissoes";
import { CODIGOS_EM_USO, CODIGOS_ESCONDIDOS } from "@/components/utilizadores-perfis/permissoesEmUso";
import type { Permissao } from "@/components/utilizadores-perfis/tipos";
import { itemAtivo } from "./itemAtivo";
import { menuSections } from "./menuConfig";

const linhaDe = (p: string) => appSource.split(/\r?\n/).find((l) => l.includes(`path="${p}"`)) ?? "";
const secao = menuSections.find((s) => s.id === "ativos")!;

describe("rota /ativos", () => {
  it("pede ativos.view, e a página é carregada à preguiçosa", () => {
    expect(linhaDe("/ativos")).toContain('<ProtectedRoute permission="ativos.view"><Ativos />');
    expect(appSource).toMatch(/const Ativos = lazy\(\(\) => import\("\.\/pages\/ativos\/Ativos"\)\)/);
  });
});

describe("menu: a secção Ativos", () => {
  it("existe logo a seguir ao Catálogo e custos, abre /ativos direto e só pede ativos.view", () => {
    expect(secao).toBeDefined();
    const ids = menuSections.map((s) => s.id);
    expect(ids.indexOf("ativos")).toBe(ids.indexOf("catalogo") + 1);
    expect(secao.paths).toEqual(["/ativos"]);
    expect(secao.permissions).toEqual(["ativos.view"]);
    expect(secao.abreDireto).toBe("/ativos");
    expect(secao.items).toHaveLength(1);
    expect(secao.items[0]).toMatchObject({ to: "/ativos", permission: "ativos.view", labelKey: "sidebar.ativos" });
  });

  it("o item do menu tem a mesma permissão da rota", () => {
    expect(linhaDe(secao.items[0].to)).toContain(`<ProtectedRoute permission="${secao.items[0].permission}">`);
  });

  it("o item fica ativo em /ativos e nos endereços por baixo", () => {
    for (const p of ["/ativos", "/ativos/abc"]) expect(itemAtivo(secao.items[0], p), p).toBe(true);
    expect(itemAtivo(secao.items[0], "/catalogo/servicos")).toBe(false);
  });

  it("o rótulo existe em português e em inglês", () => {
    expect(tabelaFundida.pt["sidebar.ativos"]).toBe("Ativos");
    expect(tabelaFundida.en["sidebar.ativos"]).toBeTruthy();
  });
});

describe("permissões ativos.view e ativos.edit", () => {
  it("estão em uso (o editor de papéis mostra-as) e não escondidas", () => {
    for (const c of ["ativos.view", "ativos.edit"]) {
      expect(CODIGOS_EM_USO.has(c), c).toBe(true);
      expect(CODIGOS_ESCONDIDOS.has(c), c).toBe(false);
    }
  });

  it("as assets.* antigas continuam escondidas e nunca em uso (não se reaproveitam)", () => {
    for (const c of ["assets.view", "assets.create", "assets.edit", "assets.delete", "assets.export", "assets.import"]) {
      expect(CODIGOS_ESCONDIDOS.has(c), c).toBe(true);
      expect(CODIGOS_EM_USO.has(c), c).toBe(false);
    }
  });

  it("o editor de papéis mostra-as num grupo «Ativos», logo a seguir ao Catálogo e custos", () => {
    const p = (codigo: string): Permissao => ({ codigo, categoria: "assets", nome: codigo, perigosa: false, comAmbito: false });
    const grupos = agruparPorMenu([p("ativos.view"), p("ativos.edit"), p("services.view")].map((x) => (x.codigo === "services.view" ? { ...x, categoria: "services" } : x)));
    const rotulos = grupos.map((g) => g.rotulo);
    expect(rotulos).toContain("Ativos");
    expect(rotulos.indexOf("Ativos")).toBe(rotulos.indexOf("Catálogo e custos") + 1);
    const ativos = grupos.find((g) => g.rotulo === "Ativos")!;
    expect(JSON.stringify(ativos)).toContain("ativos.edit");
    expect(JSON.stringify(ativos)).toContain("ativos.view");
  });
});
