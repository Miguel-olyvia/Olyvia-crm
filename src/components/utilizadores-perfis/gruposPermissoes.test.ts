import { describe, expect, it } from "vitest";
import { PERMISSOES } from "./permissoesExemplo";
import { agruparPorMenu, categoriaVirtual, distintivoAcao, GRUPOS_MENU, permissoesForaDoMenu, ROTULOS_CATEGORIA } from "./gruposPermissoes";
import { CODIGOS_ESCONDIDOS } from "./permissoesEmUso";
import type { Permissao } from "./tipos";

const perm = (codigo: string, categoria: string): Permissao => ({ codigo, categoria, nome: codigo, fonte: "codigo", perigosa: false, comAmbito: false });

/**
 * 06/11: deals.view/create/edit (Pedidos de Proposta, CRM antigo) estão escondidas e o subgrupo deles saiu do editor, por isso ficam
 * fora dos grupos de propósito. O catálogo de exemplo ainda as tem; os testes de "nenhuma fora do menu" contam sem elas.
 */
const SEM_GRUPO_DE_PROPOSITO = ["deals.view", "deals.create", "deals.edit"];
const PERMISSOES_COM_GRUPO = PERMISSOES.filter((p) => !SEM_GRUPO_DE_PROPOSITO.includes(p.codigo));

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
    expect(permissoesForaDoMenu(PERMISSOES_COM_GRUPO)).toEqual([]);
    // As únicas fora do menu são as deals.* escondidas a 06/11 (e estão mesmo escondidas).
    expect(permissoesForaDoMenu(PERMISSOES).map((p) => p.codigo).sort()).toEqual([...SEM_GRUPO_DE_PROPOSITO].sort());
    SEM_GRUPO_DE_PROPOSITO.forEach((c) => expect(CODIGOS_ESCONDIDOS, c).toContain(c));
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
    const grupos = agruparPorMenu(PERMISSOES_COM_GRUPO);
    const todas = grupos.flatMap((g) => g.permissoes.map((p) => p.codigo));
    expect(todas).toHaveLength(PERMISSOES_COM_GRUPO.length);
    expect(new Set(todas).size).toBe(PERMISSOES_COM_GRUPO.length);
    // O catálogo de exemplo não tem hr.*, operations.*, pessoas.*, fleet.* nem platform.* (além de pending_submissions, que vai para
    // Formulários), por isso esses grupos não aparecem (grupos sem permissões omitem-se); Negócios aparece pelos leads.*/clients.*/contacts.*
    // (03/11: o grupo CRM deixou de existir), e os outros saem pela ordem de GRUPOS_MENU.
    const rotulos = grupos.map((g) => g.rotulo);
    expect(rotulos).toEqual(["Dashboard", "Agendamentos", "Catálogo e custos", "Organizações", "Negócios", "Documentos do negócio", "Marketing", "Inventário", "Utilizadores", "Definições"]);
    expect(rotulos).toEqual(GRUPOS_MENU.map((g) => g.rotulo).filter((r) => rotulos.includes(r)));
    grupos.forEach((g) => {
      const soma = g.blocos.flatMap((b) => b.permissoes).length + g.subgrupos.flatMap((s) => s.permissoes).length;
      expect(soma).toBe(g.permissoes.length);
    });
  });

  it("as permissões hr.* da base têm grupo próprio (Roles.tsx aceitava a categoria mas não a mostrava)", () => {
    const grupos = agruparPorMenu([perm("hr.people.view", "hr")]);
    expect(grupos.map((g) => g.rotulo)).toEqual(["Recursos Humanos"]);
    // 03/11: um hr.* sem subgrupo próprio cai em «Pessoas: ficha».
    expect(grupos[0].subgrupos.map((s) => s.rotulo)).toEqual(["Pessoas: ficha"]);
    expect(permissoesForaDoMenu([perm("hr.people.view", "hr")])).toEqual([]);
  });

  it("omite grupos e subgrupos sem permissões e devolve vazio para uma lista vazia", () => {
    expect(agruparPorMenu([])).toEqual([]);
    const grupos = agruparPorMenu([perm("clients.view", "clients"), perm("proposals.view", "proposals")]);
    expect(grupos.map((g) => g.rotulo)).toEqual(["Negócios", "Documentos do negócio"]);
    expect(grupos[1].blocos).toEqual([]);
    expect(grupos[1].subgrupos.map((s) => s.rotulo)).toEqual(["Propostas e orçamentos"]);
  });

  it("03/11: «Aquisição» passa a «Documentos do negócio»; os templates e a configuração vão para o subgrupo Configuração", () => {
    expect(GRUPOS_MENU.map((g) => g.rotulo)).not.toContain("Aquisição");
    const grupos = agruparPorMenu([
      perm("deals.view", "deals"), perm("quotes.view", "quotes"), perm("quotes.manage", "quotes"), perm("proposals.view", "proposals"),
      perm("proposals.manage", "proposals"), perm("direct_sales.view", "direct_sales"), perm("client_contracts.view", "client_contracts"),
      perm("client_contracts.manage_templates", "client_contracts"),
      perm("quote_templates.view", "quote_templates"), perm("portal.manage", "portal"),
    ]);
    expect(grupos.map((g) => g.rotulo)).toEqual(["Documentos do negócio"]);
    const sub = (r: string) => grupos[0].subgrupos.find((s) => s.rotulo === r)?.permissoes.map((p) => p.codigo);
    // 06/11: o subgrupo «Pedidos de Proposta» saiu; um deals.* que não seja deals.delete fica fora do menu (escondido).
    expect(grupos[0].subgrupos.map((s) => s.rotulo)).toEqual(["Propostas e orçamentos", "Venda Direta", "Contratos", "Configuração"]);
    expect(grupos[0].permissoes.map((p) => p.codigo)).not.toContain("deals.view");
    expect(sub("Propostas e orçamentos")).toEqual(["proposals.view", "quotes.view", "quotes.manage"]);
    expect(sub("Venda Direta")).toEqual(["direct_sales.view"]);
    expect(sub("Contratos")).toEqual(["client_contracts.view", "portal.manage"]);
    expect(sub("Configuração")).toEqual(["quote_templates.view", "proposals.manage", "client_contracts.manage_templates"]);
    expect(permissoesForaDoMenu([perm("proposals.manage", "proposals")])).toEqual([]);
  });

  it("parte Agendamentos e Marketing em subgrupos pelo prefixo do código", () => {
    expect(categoriaVirtual(perm("scheduling.boards.view", "scheduling"))).toBe("scheduling_boards");
    expect(categoriaVirtual(perm("scheduling.view", "scheduling"))).toBe("scheduling_other");
    expect(categoriaVirtual(perm("campaigns.view", "marketing"))).toBe("marketing_campaigns");
    expect(categoriaVirtual(perm("contacts.view", "contacts"))).toBe("negocios_pessoas");
    const agendamentos = agruparPorMenu(PERMISSOES).find((g) => g.rotulo === "Agendamentos")!;
    expect(agendamentos.subgrupos.map((s) => s.rotulo)).toEqual(["Quadros", "Itens", "Recursos", "Regras de Auto-agendamento", "Outros"]);
  });

  describe("Negócios por fase", () => {
    const NEGOCIOS = [
      perm("pessoas.view", "pessoas"), perm("pessoas.reopen", "pessoas"),
      perm("negocios.contacto.registar", "pessoas"),
      perm("negocios.visita.gerir", "pessoas"),
      perm("negocios.orcamento.editar", "pessoas"), perm("negocios.margem.aprovar", "pessoas"), perm("negocios.proposta.enviar", "pessoas"),
      perm("negocios.proposta.decidir", "pessoas"),
      perm("quotes.view_costs", "quotes"),
      perm("negocios.contrato.editar", "pessoas"), perm("client_contracts.cancel", "client_contracts"),
      perm("negocios.registar_fatura", "pessoas"), perm("negocios.validar_pagamento", "pessoas"),
      perm("negocios.obra.planear", "pessoas"), perm("negocios.obra.materiais", "pessoas"),
      perm("negocios.obra.imprevistos", "pessoas"), perm("negocios.obra.fechar", "pessoas"),
      perm("negocios.perder", "pessoas"),
    ];
    const subgrupo = (rotulo: string) =>
      agruparPorMenu(NEGOCIOS).find((g) => g.rotulo === "Negócios")!.subgrupos.find((s) => s.rotulo === rotulo)?.permissoes.map((p) => p.codigo);

    it("tem só subgrupos, pela ordem das fases, e nenhuma permissão fica de fora", () => {
      const grupos = agruparPorMenu(NEGOCIOS);
      expect(grupos.map((g) => g.rotulo)).toEqual(["Negócios"]);
      expect(grupos[0].blocos).toEqual([]);
      expect(grupos[0].subgrupos.map((s) => s.rotulo)).toEqual(["Geral", "Contacto", "Visita", "Negócio", "Financeiro", "Obra"]);
      expect(grupos[0].permissoes).toHaveLength(NEGOCIOS.length);
      expect(permissoesForaDoMenu(NEGOCIOS)).toEqual([]);
    });

    it("põe cada permissão na sua fase", () => {
      expect(subgrupo("Geral")).toEqual(["pessoas.view", "pessoas.reopen", "negocios.perder"]);
      expect(subgrupo("Contacto")).toEqual(["negocios.contacto.registar"]);
      expect(subgrupo("Visita")).toEqual(["negocios.visita.gerir"]);
      // 03/11: «Orçamento e proposta» e «Contrato» são agora a fase Negócio (com a decisão do cliente)
      expect(subgrupo("Negócio")).toEqual([
        "negocios.orcamento.editar", "negocios.margem.aprovar", "negocios.proposta.enviar", "negocios.proposta.decidir", "quotes.view_costs",
        "negocios.contrato.editar", "client_contracts.cancel",
      ]);
      expect(subgrupo("Orçamento e proposta")).toBeUndefined();
      expect(subgrupo("Contrato")).toBeUndefined();
      expect(subgrupo("Financeiro")).toEqual(["negocios.registar_fatura", "negocios.validar_pagamento"]);
      expect(subgrupo("Obra")).toEqual(["negocios.obra.planear", "negocios.obra.materiais", "negocios.obra.imprevistos", "negocios.obra.fechar"]);
    });

    it("um negocios.* desconhecido cai em Geral, e o subgrupo Visita só aparece se houver permissões", () => {
      expect(categoriaVirtual(perm("negocios.xyz", "pessoas"))).toBe("negocios_geral");
      expect(categoriaVirtual(perm("negocios.xyz.abc", "pessoas"))).toBe("negocios_geral");
      const grupos = agruparPorMenu([perm("negocios.xyz", "pessoas"), perm("negocios.obra.executar", "pessoas")]);
      expect(grupos[0].subgrupos.map((s) => s.rotulo)).toEqual(["Geral", "Obra"]);
      expect(grupos[0].subgrupos[0].blocos[0].rotulo).toBe("Geral");
    });

    it("quotes.view_costs e client_contracts.cancel saem dos Documentos do negócio; as outras quotes.* e client_contracts.* ficam", () => {
      const grupos = agruparPorMenu([
        perm("quotes.view", "quotes"), perm("quotes.view_costs", "quotes"),
        perm("client_contracts.edit", "client_contracts"), perm("client_contracts.cancel", "client_contracts"),
      ]);
      expect(grupos.map((g) => g.rotulo)).toEqual(["Negócios", "Documentos do negócio"]);
      expect(grupos[1].permissoes.map((p) => p.codigo)).toEqual(["quotes.view", "client_contracts.edit"]);
      expect(grupos[0].permissoes.map((p) => p.codigo)).toEqual(["quotes.view_costs", "client_contracts.cancel"]);
    });

    it("leads.*, clients.* e contacts.* vão para o subgrupo «Pessoas: leads e clientes», logo a seguir a Geral; ver, criar e atribuir leads para «Por contactar»", () => {
      const pessoas = [perm("leads.edit", "leads"), perm("clients.edit", "clients"), perm("contacts.view", "contacts")];
      pessoas.forEach((p) => expect(categoriaVirtual(p)).toBe("negocios_pessoas"));
      const porContactar = [perm("leads.view", "leads"), perm("leads.create", "leads"), perm("leads.assign", "leads")];
      porContactar.forEach((p) => expect(categoriaVirtual(p)).toBe("negocios_por_contactar"));
      const grupos = agruparPorMenu([...NEGOCIOS, ...pessoas, ...porContactar]);
      expect(grupos.map((g) => g.rotulo)).toEqual(["Negócios"]);
      expect(grupos[0].subgrupos.map((s) => s.rotulo)).toEqual([
        "Geral", "Pessoas: leads e clientes", "Por contactar", "Contacto", "Visita", "Negócio", "Financeiro", "Obra",
      ]);
      expect(grupos[0].subgrupos[1].permissoes.map((p) => p.codigo)).toEqual(["leads.edit", "clients.edit", "contacts.view"]);
      expect(grupos[0].subgrupos[1].blocos.map((b) => b.rotulo)).toEqual(["Pessoas: leads e clientes"]);
      expect(grupos[0].subgrupos[2].permissoes.map((p) => p.codigo)).toEqual(["leads.view", "leads.create", "leads.assign"]);
      const definicao = GRUPOS_MENU.find((g) => g.rotulo === "Negócios")!.subgrupos!.map((s) => s.rotulo);
      expect(definicao).toEqual(["Geral", "Pessoas: leads e clientes", "Por contactar", "Contacto", "Visita", "Negócio", "Financeiro", "Obra"]);
    });

    it("uma permissão com outro prefixo guardada em leads/contacts/clients fica em «Pessoas» (não desaparece do editor)", () => {
      expect(categoriaVirtual(perm("outra.coisa", "contacts"))).toBe("negocios_pessoas");
      expect(permissoesForaDoMenu([perm("outra.coisa", "leads")])).toEqual([]);
    });

    it("as categorias virtuais de Negócios não colidem com categorias reais", () => {
      const virtuais = GRUPOS_MENU.find((g) => g.rotulo === "Negócios")!.subgrupos!.flatMap((s) => s.categorias);
      virtuais.forEach((c) => expect(Object.keys(ROTULOS_CATEGORIA)).not.toContain(c));
      // hr.pessoas.* é do RH, não de Negócios.
      expect(categoriaVirtual(perm("hr.pessoas.view", "hr"))).toBe("hr_pessoas");
    });
  });

  it("as permissões de formulários aparecem uma só vez, no subgrupo Formulários, com as submissões pendentes", () => {
    const marketing = agruparPorMenu(PERMISSOES).find((g) => g.rotulo === "Marketing")!;
    expect(marketing.blocos).toEqual([]);
    const forms = marketing.subgrupos.find((s) => s.rotulo === "Formulários")!;
    expect(forms.permissoes.map((p) => p.codigo)).toEqual([
      "platform.pending_submissions.view", "forms.view", "forms.create", "forms.edit", "forms.delete",
    ]);
  });

  it("«Ver submissões pendentes» vai para Marketing › Formulários pelo código, embora a base a guarde em leads", () => {
    const pendentes = perm("platform.pending_submissions.view", "leads");
    expect(categoriaVirtual(pendentes)).toBe("forms");
    const grupos = agruparPorMenu([pendentes]);
    expect(grupos.map((g) => g.rotulo)).toEqual(["Marketing"]);
    expect(grupos[0].subgrupos.map((s) => s.rotulo)).toEqual(["Formulários"]);
  });

  it("03/11: o grupo CRM deixou de existir: os contacts.* ficam em Negócios › Pessoas: leads e clientes", () => {
    expect(GRUPOS_MENU.map((g) => g.rotulo)).not.toContain("CRM");
    const comContactos = agruparPorMenu([perm("leads.edit", "leads"), perm("contacts.view", "contacts")]);
    expect(comContactos.map((g) => g.rotulo)).toEqual(["Negócios"]);
    expect(comContactos[0].subgrupos.map((s) => s.rotulo)).toEqual(["Pessoas: leads e clientes"]);
    expect(comContactos[0].permissoes.map((p) => p.codigo)).toEqual(["leads.edit", "contacts.view"]);
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

describe("06/11: Pedidos de Proposta saem dos Documentos do negócio; deals.delete vai para Definições › Lixo", () => {
  it("não há subgrupo «Pedidos de Proposta» nem a categoria deals nos grupos do menu", () => {
    const doc = GRUPOS_MENU.find((g) => g.rotulo === "Documentos do negócio")!;
    expect(doc.subgrupos?.map((s) => s.rotulo)).not.toContain("Pedidos de Proposta");
    expect(GRUPOS_MENU.flatMap((g) => [...g.categorias, ...(g.subgrupos ?? []).flatMap((s) => s.categorias)])).not.toContain("deals");
  });

  it("deals.delete cai na categoria trash e no bloco Lixo de Definições, ao lado de trash.view", () => {
    expect(categoriaVirtual(perm("deals.delete", "deals"))).toBe("trash");
    const grupos = agruparPorMenu([perm("deals.delete", "deals"), perm("trash.view", "trash")]);
    expect(grupos.map((g) => g.rotulo)).toEqual(["Definições"]);
    expect(grupos[0].blocos.map((b) => [b.rotulo, b.permissoes.map((p) => p.codigo)])).toEqual([["Lixo", ["deals.delete", "trash.view"]]]);
    expect(permissoesForaDoMenu([perm("deals.view", "deals")]).map((p) => p.codigo)).toEqual(["deals.view"]);
  });
});
