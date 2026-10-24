import { describe, expect, it } from "vitest";
import { PERMISSOES } from "./permissoesExemplo";
import { agruparPorMenu, categoriaVirtual, distintivoAcao, GRUPOS_MENU, permissoesForaDoMenu } from "./gruposPermissoes";
import type { Permissao } from "./tipos";

const perm = (codigo: string, categoria: string): Permissao => ({ codigo, categoria, nome: codigo, fonte: "codigo", perigosa: false, comAmbito: false });

describe("catálogo de permissões de exemplo", () => {
  it("tem códigos únicos, nome e categoria em todas, e uma origem conhecida", () => {
    const codigos = PERMISSOES.map((p) => p.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    PERMISSOES.forEach((p) => {
      expect(p.codigo).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
      expect(p.nome.trim()).not.toBe("");
      expect(p.categoria).not.toBe("");
      expect(["migration", "rota", "codigo", "docs"]).toContain(p.fonte);
    });
  });

  it("não deixa nenhuma permissão fora dos grupos do menu (como o ecrã de Roles, que esconderia o resto)", () => {
    expect(permissoesForaDoMenu(PERMISSOES)).toEqual([]);
  });

  it("tem as permissões que vêm das migrations, com as marcas lidas de lá", () => {
    const por = (c: string) => PERMISSOES.find((p) => p.codigo === c)!;
    expect(por("proposals.delete_sent")).toMatchObject({ fonte: "migration", perigosa: true, comAmbito: true, categoria: "proposals" });
    expect(por("direct_sales.view")).toMatchObject({ comAmbito: true });
    expect(por("clients.export_sensitive").perigosa).toBe(true);
    expect(por("platform.pending_submissions.view")).toMatchObject({ categoria: "leads", comAmbito: false });
    expect(por("product_categories.view").categoria).toBe("products");
  });

  it("as permissões de eliminar são perigosas e as de ver não", () => {
    PERMISSOES.filter((p) => p.codigo.endsWith(".delete")).forEach((p) => expect(p.perigosa).toBe(true));
    PERMISSOES.filter((p) => p.codigo.endsWith(".view")).forEach((p) => expect(p.perigosa).toBe(false));
  });
});

describe("agruparPorMenu", () => {
  it("agrupa a lista completa pelos grupos do menu, sem perder nem repetir nenhuma permissão", () => {
    const grupos = agruparPorMenu(PERMISSOES);
    const todas = grupos.flatMap((g) => g.permissoes.map((p) => p.codigo));
    expect(todas).toHaveLength(PERMISSOES.length);
    expect(new Set(todas).size).toBe(PERMISSOES.length);
    expect(grupos.map((g) => g.rotulo)).toEqual(GRUPOS_MENU.map((g) => g.rotulo));
    grupos.forEach((g) => {
      const soma = g.blocos.flatMap((b) => b.permissoes).length + g.subgrupos.flatMap((s) => s.permissoes).length;
      expect(soma).toBe(g.permissoes.length);
    });
  });

  it("omite grupos e subgrupos sem permissões e devolve vazio para uma lista vazia", () => {
    expect(agruparPorMenu([])).toEqual([]);
    const grupos = agruparPorMenu([perm("clients.view", "clients"), perm("proposals.view", "proposals")]);
    expect(grupos.map((g) => g.rotulo)).toEqual(["CRM", "Aquisição"]);
    expect(grupos[1].blocos).toEqual([]);
    expect(grupos[1].subgrupos.map((s) => s.rotulo)).toEqual(["Propostas"]);
  });

  it("parte Agendamentos e Marketing em subgrupos pelo prefixo do código", () => {
    expect(categoriaVirtual(perm("scheduling.boards.view", "scheduling"))).toBe("scheduling_boards");
    expect(categoriaVirtual(perm("scheduling.view", "scheduling"))).toBe("scheduling_other");
    expect(categoriaVirtual(perm("campaigns.view", "marketing"))).toBe("marketing_campaigns");
    expect(categoriaVirtual(perm("clients.view", "clients"))).toBe("clients");
    const agendamentos = agruparPorMenu(PERMISSOES).find((g) => g.rotulo === "Agendamentos")!;
    expect(agendamentos.subgrupos.map((s) => s.rotulo)).toEqual(["Quadros", "Itens", "Recursos", "Regras de Auto-agendamento", "Outros"]);
  });

  it("as permissões de formulários aparecem uma só vez, no subgrupo Formulários", () => {
    const marketing = agruparPorMenu(PERMISSOES).find((g) => g.rotulo === "Marketing")!;
    expect(marketing.blocos).toEqual([]);
    const forms = marketing.subgrupos.find((s) => s.rotulo === "Formulários")!;
    expect(forms.permissoes.map((p) => p.codigo)).toEqual(["forms.view", "forms.create", "forms.edit", "forms.delete"]);
  });
});

describe("distintivoAcao", () => {
  it("sai do fim do código, e um fim desconhecido fica em texto simples", () => {
    expect(distintivoAcao("clients.view").rotulo).toBe("Ver");
    expect(distintivoAcao("clients.delete").rotulo).toBe("Eliminar");
    expect(distintivoAcao("scheduling.boards.edit").rotulo).toBe("Editar");
    expect(distintivoAcao("receiving.download_proof").rotulo).toBe("PDF");
    expect(distintivoAcao("direct_sales.register_invoice")).toEqual({ rotulo: "Register invoice", classes: "" });
  });
});
