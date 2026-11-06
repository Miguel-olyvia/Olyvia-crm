import { describe, expect, it } from "vitest";
import { agruparPorMenu } from "./gruposPermissoes";
import { encurtarNome, estadoConjunto, secoesDoGrupo, separarCodigo } from "./grelhaPermissoes";
import { alternarPermissao, definirConjunto, podeAlterar } from "./matriz";
import { permissoesDoMenu } from "./rolesReais";
import { PERMISSOES_EM_USO } from "./permissoesEmUso";
import type { Permissao } from "./tipos";

const p = (codigo: string, nome = codigo, categoria = codigo.split(".")[0] ?? ""): Permissao =>
  ({ codigo, categoria, nome, perigosa: false, comAmbito: false });
const grupo = (rotulo: string, lista: Permissao[]) => {
  const g = agruparPorMenu(lista).find((x) => x.rotulo === rotulo);
  if (!g) throw new Error(`sem grupo ${rotulo}`);
  return secoesDoGrupo(g);
};
const catalogoReal = () => permissoesDoMenu(Object.entries(PERMISSOES_EM_USO).flatMap(([category, codigos]) =>
  codigos.map((code) => ({ code, name: code, category, is_dangerous: false }))));

describe("separarCodigo", () => {
  it("tira a ação do fim e reconhece as variantes", () => {
    expect(separarCodigo("leads.edit")).toEqual({ recurso: "leads", acao: "edit", variante: null });
    expect(separarCodigo("hr.pessoas.saude.view")).toEqual({ recurso: "hr.pessoas.saude", acao: "view", variante: null });
    expect(separarCodigo("hr.pessoas.view.own")).toEqual({ recurso: "hr.pessoas", acao: "view", variante: "own" });
  });
});

describe("encurtarNome", () => {
  it("tira o artigo e o contexto do fim; o nome da linha só nas linhas de recurso", () => {
    expect(encurtarNome("Editar o orçamento do negócio", "Negócio", false)).toBe("Editar orçamento");
    expect(encurtarNome("Gerir as visitas do negócio", "Visita", false)).toBe("Gerir visitas");
    expect(encurtarNome("Registar contacto", "Contacto", false)).toBe("Registar contacto");
    expect(encurtarNome("Converter leads", "Leads")).toBe("Converter");
    expect(encurtarNome("Configurar o workflow de Pessoas", "Pessoas (ecrã)")).toBe("Configurar workflow");
  });
});

describe("secoesDoGrupo", () => {
  it("Negócios: secção Pessoas com o recurso inteiro por linha e secção Fases só de ações, uma linha por fase", () => {
    const lista = [
      p("pessoas.view", "Ver negócios de pessoas"), p("pessoas.reopen", "Reabrir negócios ganhos"), p("negocios.perder", "Dar o negócio como perdido"),
      p("leads.view"), p("leads.create"), p("leads.assign", "Atribuir leads"), p("leads.edit"), p("leads.convert", "Converter leads"),
      p("clients.view"), p("contacts.view"),
      p("negocios.contacto.registar", "Registar contacto"), p("negocios.visita.gerir", "Gerir as visitas do negócio"),
      p("negocios.orcamento.editar", "Editar o orçamento do negócio"), p("quotes.view_costs", "Ver custos"),
      p("client_contracts.cancel", "Anular contrato"), p("negocios.registar_fatura", "Registar faturas do negócio"),
    ];
    const [pessoas, fases, ...resto] = grupo("Negócios", lista);
    expect(resto).toEqual([]);
    expect(pessoas.titulo).toBe("Pessoas");
    expect(pessoas.soAcoes).toBe(false);
    expect(pessoas.linhas.map((l) => l.rotulo)).toEqual(["Pessoas (ecrã)", "Leads", "Clientes", "Contactos"]);
    const leads = pessoas.linhas[1];
    expect(Object.keys(leads.fixas).sort()).toEqual(["criar", "editar", "ver"]);
    expect(leads.outras.map((c) => c.rotulo)).toEqual(["Converter", "Atribuir"]);

    expect(fases.titulo).toBe("Fases do negócio");
    expect(fases.soAcoes).toBe(true);
    expect(fases.linhas.map((l) => l.rotulo)).toEqual(["Contacto", "Visita", "Negócio", "Financeiro", "Geral"]);
    const negocio = fases.linhas[2];
    expect(negocio.fixas).toEqual({});
    expect(negocio.outras.map((c) => c.rotulo)).toEqual(["Editar orçamento", "Anular contrato", "Ver custos do orçamento"]);
    expect(fases.linhas[0].outras[0].rotulo).toBe("Registar contacto");
    expect(fases.linhas[4].outras[0].rotulo).toBe("Dar negócio como perdido");
  });

  it("secção de uma só linha com o nome dela perde o título e junta-se às sem título vizinhas", () => {
    const secoes = grupo("Agendamentos", [p("scheduling.boards.view", "x", "scheduling"), p("scheduling.items.view", "y", "scheduling")]);
    expect(secoes).toHaveLength(1);
    expect(secoes[0].titulo).toBeNull();
    expect(secoes[0].linhas.map((l) => l.rotulo)).toEqual(["Quadros", "Itens"]);
  });

  it(".own vai para Outras ('Ver (só as suas)' sem nome legível); Ver fica o 'ver tudo'", () => {
    const [s] = grupo("Recursos Humanos", [p("hr.pessoas.view", "hr.pessoas.view", "hr"), p("hr.pessoas.view.own", "hr.pessoas.view.own", "hr")]);
    expect(s.linhas[0].fixas.ver?.codigo).toBe("hr.pessoas.view");
    expect(s.linhas[0].outras.map((c) => c.rotulo)).toEqual(["Ver (só as suas)"]);
  });

  it("rótulos repetidos na mesma linha voltam ao nome completo", () => {
    const [s] = grupo("Inventário", [p("suppliers.manage", "Gerir fornecedores"), p("suppliers.portal_manage", "Gerir fornecedores")]);
    expect(s.linhas[0].outras.map((c) => c.rotulo)).toEqual(["Gerir fornecedores", "Gerir fornecedores"]);
  });

  it("com o catálogo em uso, nenhuma permissão se perde nem se repete, e nenhuma linha repete o título da secção", () => {
    const grupos = agruparPorMenu(catalogoReal());
    grupos.forEach((g) => {
      const secoes = secoesDoGrupo(g);
      const naGrelha = secoes.flatMap((s) => s.linhas.flatMap((l) => [...Object.values(l.fixas), ...l.outras.map((c) => c.permissao)]))
        .map((x) => x?.codigo);
      expect([...naGrelha].sort()).toEqual(g.permissoes.map((x) => x.codigo).sort());
      expect(new Set(naGrelha).size).toBe(naGrelha.length);
      secoes.forEach((s) => s.linhas.forEach((l) => expect(l.rotulo.toLowerCase()).not.toBe(s.titulo?.toLowerCase())));
    });
  });

  it("ordem dos chips das fases pelo fluxo do negócio, seja qual for a ordem do catálogo", () => {
    const lista = [
      p("quotes.view_costs", "Ver custos"), p("negocios.obra.fechar", "Encerrar a obra"), p("negocios.validar_pagamento", "Validar pagamentos do negócio"),
      p("client_contracts.cancel", "Cancelar"), p("negocios.contrato.editar", "Editar o contrato do negócio"),
      p("negocios.proposta.decidir", "Registar a decisão do cliente sobre a proposta"), p("negocios.obra.imprevistos", "Decidir os imprevistos da obra"),
      p("negocios.proposta.enviar", "Enviar a proposta ao cliente"), p("negocios.margem.aprovar", "Aprovar a margem do orçamento"),
      p("negocios.obra.materiais", "Ver materiais da obra"), p("negocios.registar_fatura", "Registar faturas do negócio"),
      p("negocios.orcamento.editar", "Editar o orçamento do negócio"), p("negocios.obra.executar", "Executar as tarefas da obra"),
      p("negocios.obra.planear", "Planear a obra"),
    ].map((x) => ({ ...x, categoria: x.categoria === "negocios" ? "pessoas" : x.categoria }));
    const fases = grupo("Negócios", lista).find((s) => s.titulo === "Fases do negócio");
    const chips = (rotulo: string) => fases?.linhas.find((l) => l.rotulo === rotulo)?.outras.map((c) => c.rotulo);
    expect(chips("Negócio")).toEqual([
      "Editar orçamento", "Aprovar margem do orçamento", "Enviar proposta ao cliente", "Registar decisão do cliente sobre a proposta",
      "Editar contrato", "Anular contrato", "Ver custos do orçamento",
    ]);
    expect(chips("Obra")).toEqual(["Planear obra", "Executar tarefas", "Ver materiais", "Decidir imprevistos", "Encerrar obra"]);
    expect(chips("Financeiro")).toEqual(["Registar faturas", "Validar pagamentos"]);
  });

  it("restantes linhas: ver → criar → editar/gerir → aprovar → exportar/importar → configurar → perigosas", () => {
    const lista = [
      p("purchase_orders.delete_sent", "Eliminar enviadas"), p("purchase_orders.config", "Configurar encomendas"),
      p("purchase_orders.import", "Importar encomendas"), p("purchase_orders.approve", "Aprovar encomendas"),
      p("purchase_orders.revert_receipt", "Reverter receção"),
      p("purchase_orders.receive", "Receber encomendas"), p("purchase_orders.duplicate", "Duplicar encomendas"),
      p("purchase_orders.view_prices", "Ver preços"),
    ].map((x, i) => (i === 4 ? { ...x, perigosa: true } : x));
    const [s] = grupo("Inventário", lista);
    expect(s.linhas[0].outras.map((c) => c.permissao.codigo)).toEqual([
      "purchase_orders.view_prices", "purchase_orders.duplicate", "purchase_orders.receive", "purchase_orders.approve",
      "purchase_orders.import", "purchase_orders.config", "purchase_orders.delete_sent", "purchase_orders.revert_receipt",
    ]);
  });

  it("client_contracts.cancel diz o quê: 'Anular contrato' (06/11: leads.config saiu do editor e do rótulo à mão)", () => {
    const [s] = grupo("Negócios", [p("client_contracts.cancel", "client_contracts.cancel")]);
    expect(s.linhas[0].outras[0].rotulo).toBe("Anular contrato");
  });

  it("estado de conjunto (indeterminado)", () => {
    const lista = [p("a.view"), p("b.view")];
    expect(estadoConjunto(lista, (c) => c === "a.view")).toBe("indeterminate");
    expect(estadoConjunto(lista, () => true)).toBe(true);
    expect(estadoConjunto(lista, () => false)).toBe(false);
  });
});

describe("definirConjunto (linha/secção) com as regras de 'ver'", () => {
  const CAT = ["leads.view", "leads.create", "leads.edit", "clients.view", "clients.edit", "hr.pessoas.view", "hr.pessoas.edit"].map((c) => p(c));
  const de = (...c: string[]) => CAT.filter((x) => c.includes(x.codigo));

  it("marcar uma linha com o 'ver' do módulo concede tudo; sem o 'ver' as bloqueadas ficam por marcar", () => {
    expect(definirConjunto([], de("leads.view", "leads.create", "leads.edit"), true, CAT)).toEqual(["leads.view", "leads.create", "leads.edit"]);
    expect(definirConjunto(["clients.view"], de("leads.edit", "clients.edit"), true, CAT)).toEqual(["clients.view", "clients.edit"]);
  });

  it("desmarcar o 'ver' do módulo tira as dependentes; não toca nas outras", () => {
    expect(definirConjunto(["leads.view", "leads.edit", "clients.view"], de("leads.view"), false, CAT)).toEqual(["clients.view"]);
  });

  it("06/11: as dependências são as declaradas (hr.pessoas.edit depende da ficha: hr.pessoas.view, ou a própria quando está no catálogo)", () => {
    expect(alternarPermissao(["hr.pessoas.view", "hr.pessoas.edit"], "hr.pessoas.view", CAT)).toEqual([]);
    const comPropria = [...CAT, p("hr.pessoas.view.own")];
    expect(alternarPermissao(["hr.pessoas.view", "hr.pessoas.view.own", "hr.pessoas.edit"], "hr.pessoas.view", comPropria))
      .toEqual(["hr.pessoas.view.own", "hr.pessoas.edit"]);
  });
});

describe("06/11: deals.delete na linha Lixo (Definições), com rótulo próprio e sem depender de deals.view", () => {
  it("fica na linha Lixo como chip «Eliminar definitivamente do Lixo» (não na coluna Eliminar nem numa linha Pedidos de Proposta)", () => {
    const secoes = grupo("Definições", [p("trash.view", "Ver lixo"), p("deals.delete", "Eliminar definitivamente do Lixo", "deals")]);
    const linhas = secoes.flatMap((s) => s.linhas);
    expect(linhas.map((l) => l.rotulo)).toEqual(["Lixo"]);
    expect(linhas[0].fixas.ver?.codigo).toBe("trash.view");
    expect(linhas[0].fixas.eliminar).toBeUndefined();
    expect(linhas[0].outras.map((c) => [c.permissao.codigo, c.rotulo])).toEqual([["deals.delete", "Eliminar definitivamente do Lixo"]]);
  });

  it("o nome no editor vem do rótulo à mão (rolesReais), mesmo com o nome antigo da base", () => {
    const [delecao] = permissoesDoMenu([{ code: "deals.delete", name: "Eliminar pedidos de proposta", category: "deals", is_dangerous: true }]);
    expect(delecao?.nome).toBe("Eliminar definitivamente do Lixo");
  });

  it("com o catálogo real, deals.delete marca-se sem deals.view (escondida) e tirar trash.view não a arrasta", () => {
    const cat = catalogoReal();
    expect(cat.some((x) => x.codigo === "deals.view")).toBe(false);
    expect(podeAlterar("deals.delete", [], cat)).toBe(true);
    expect(alternarPermissao([], "deals.delete", cat)).toEqual(["deals.delete"]);
    expect(alternarPermissao(["trash.view", "deals.delete"], "trash.view", cat)).toEqual(["deals.delete"]);
    expect(definirConjunto(["trash.view", "deals.delete"], cat.filter((x) => x.codigo === "trash.view"), false, cat)).toEqual(["deals.delete"]);
    expect(definirConjunto([], cat.filter((x) => x.codigo === "deals.delete"), true, cat)).toEqual(["deals.delete"]);
  });
});
