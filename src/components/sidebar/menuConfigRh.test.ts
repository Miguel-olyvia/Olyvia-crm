// 03/11/2026: o RH no menu e nas rotas com as permissões hr.* (era users.view em tudo, e um colaborador normal não via a área «Eu»).
// Visibilidade com as mesmas regras de AppSidebar (canViewItem / canViewSection): um item com `permissions` aparece com qualquer
// delas, com `permission` com essa, sem nenhuma sempre; um grupo aparece se algum item aparecer (senão, pelas `permissions` do grupo,
// e vazio = sempre).
import { describe, expect, it } from "vitest";
import appSource from "@/App.tsx?raw";
import { menuSections, PERMISSOES_RH, PERMISSOES_RH_EU, type MenuItem, type MenuSection } from "./menuConfig";

const itemVisivel = (item: MenuItem, tem: ReadonlySet<string>): boolean => {
  if (item.permissions && item.permissions.length > 0) return item.permissions.some((p) => tem.has(p));
  if (item.permission) return tem.has(item.permission);
  return true;
};
const grupoVisivel = (s: MenuSection, tem: ReadonlySet<string>): boolean => {
  if (s.items.some((i) => itemVisivel(i, tem))) return true;
  if (s.subSections?.some((x) => x.items.some((i) => itemVisivel(i, tem)))) return true;
  return s.permissions.length === 0 || s.permissions.some((p) => tem.has(p));
};
const grupo = (id: string) => menuSections.find((s) => s.id === id)!;
const visiveis = (id: string, tem: ReadonlySet<string>) => grupo(id).items.filter((i) => itemVisivel(i, tem)).map((i) => i.to);

/** As permissões da rota (permission="x" ou permissions={[...]}) da linha de App.tsx com este path. */
const permissoesDaRota = (path: string): string[] | null => {
  const linha = appSource.split(/\r?\n/).find((l) => l.includes(`path="${path}"`)) ?? "";
  const uma = linha.match(/<ProtectedRoute permission="([^"]+)"/);
  if (uma) return [uma[1]!];
  const varias = linha.match(/<ProtectedRoute permissions=\{\[([^\]]+)\]\}/);
  if (varias) return [...varias[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  return null;
};

describe("menu do RH: permissões hr.*", () => {
  it("nenhuma entrada do RH nem de «Eu» usa users.view", () => {
    const itens = [...grupo("rh-exemplo").items, ...grupo("rh-exemplo-eu").items];
    expect(itens.filter((i) => i.permission === "users.view" || i.permissions?.includes("users.view"))).toEqual([]);
    expect(grupo("rh-exemplo").permissions).not.toContain("users.view");
    expect(grupo("rh-exemplo-eu").permissions).toEqual([]);
  });

  it("cada entrada pede as permissões da sua rota (Pessoas: a rota aceita também a própria ficha)", () => {
    const esperado: Record<string, readonly string[]> = {
      "/rh-exemplo/organizacao": PERMISSOES_RH.organizacao,
      "/rh-exemplo/assiduidade-e-ausencias": PERMISSOES_RH.assiduidadeEAusencias,
      "/rh-exemplo/centros": PERMISSOES_RH.centros,
      "/rh-exemplo/documentos/modelos": PERMISSOES_RH.modelos,
      "/rh-exemplo/processamento-salarial": PERMISSOES_RH.processamento,
      "/rh-exemplo/custos": PERMISSOES_RH.custos,
      "/rh-exemplo/denuncias": PERMISSOES_RH.denuncias,
      "/rh-exemplo/admissao": PERMISSOES_RH.admissao,
      "/rh-exemplo/documentos": PERMISSOES_RH_EU.documentos,
      "/rh-exemplo/ausencias": PERMISSOES_RH_EU.ausencias,
      "/rh-exemplo/assiduidade": PERMISSOES_RH_EU.assiduidade,
    };
    Object.entries(esperado).forEach(([to, perms]) => {
      const item = [...grupo("rh-exemplo").items, ...grupo("rh-exemplo-eu").items].find((i) => i.to === to)!;
      expect(item.permissions, to).toEqual(perms);
      expect(permissoesDaRota(to)?.sort(), to).toEqual([...perms].sort());
    });
    expect(permissoesDaRota("/rh-exemplo/pessoas/:id?")).toEqual(["hr.pessoas.view", "hr.pessoas.view.own"]);
    expect(grupo("rh-exemplo").items.find((i) => i.to === "/rh-exemplo/pessoas")?.permissions).toEqual(["hr.pessoas.view"]);
  });

  it("os valores pedidos: Organização, Centros, Modelos, Custos, Denúncias, Processamento e Assiduidade e ausências", () => {
    expect(PERMISSOES_RH.organizacao).toEqual(["hr.pessoas.colocacao.view"]);
    expect(PERMISSOES_RH.centros).toEqual(["hr.locais.view"]);
    expect(PERMISSOES_RH.modelos).toEqual(["hr.pessoas.documentos.modelos.view"]);
    expect(PERMISSOES_RH.custos).toEqual(["hr.pessoas.retribuicao.view"]);
    expect(PERMISSOES_RH.denuncias).toEqual(["hr.denuncias.gerir"]);
    expect(PERMISSOES_RH.processamento).toEqual(["hr.processamento.periodo.view", "hr.vencimento.codigos.view", "hr.vencimento.subsidio.view"]);
    expect(PERMISSOES_RH.assiduidadeEAusencias).toContain("hr.assiduidade.equipa.view");
  });

  it("«As minhas denúncias» não pede permissão, no menu nem na rota (basta a sessão)", () => {
    const item = grupo("rh-exemplo-eu").items.find((i) => i.to === "/rh-exemplo/minhas-denuncias")!;
    expect(item.permission).toBeUndefined();
    expect(item.permissions).toBeUndefined();
    const linha = appSource.split(/\r?\n/).find((l) => l.includes('path="/rh-exemplo/minhas-denuncias"')) ?? "";
    expect(linha).toContain("<RhMinhasDenuncias />");
    expect(linha).not.toContain("ProtectedRoute");
  });

  it("o grupo Recursos Humanos aparece com qualquer permissão de um dos seus itens", () => {
    const todas = grupo("rh-exemplo").items.flatMap((i) => i.permissions ?? []);
    expect([...grupo("rh-exemplo").permissions].sort()).toEqual([...new Set(todas)].sort());
  });
});

describe("visibilidade por perfil", () => {
  it("um colaborador só com as .own vê «Eu» com documentos, ausências, assiduidade e denúncias, e não vê o RH", () => {
    const tem = new Set(["hr.pessoas.view.own", "hr.pessoas.documentos.view.own", "hr.ausencias.view.own", "hr.assiduidade.view.own"]);
    expect(grupoVisivel(grupo("rh-exemplo-eu"), tem)).toBe(true);
    expect(visiveis("rh-exemplo-eu", tem)).toEqual([
      "/rh-exemplo/documentos", "/rh-exemplo/ausencias", "/rh-exemplo/assiduidade", "/rh-exemplo/minhas-denuncias",
    ]);
    expect(grupoVisivel(grupo("rh-exemplo"), tem)).toBe(false);
  });

  it("quem só pode pedir ausências e picar também vê as suas entradas", () => {
    const tem = new Set(["hr.ausencias.pedir", "hr.assiduidade.picar"]);
    expect(visiveis("rh-exemplo-eu", tem)).toEqual(["/rh-exemplo/ausencias", "/rh-exemplo/assiduidade", "/rh-exemplo/minhas-denuncias"]);
  });

  it("sem permissões de RH, «Eu» mostra só «As minhas denúncias»", () => {
    expect(visiveis("rh-exemplo-eu", new Set())).toEqual(["/rh-exemplo/minhas-denuncias"]);
  });

  it("users.view sozinho já não abre o RH", () => {
    const tem = new Set(["users.view"]);
    expect(grupoVisivel(grupo("rh-exemplo"), tem)).toBe(false);
    expect(visiveis("rh-exemplo-eu", tem)).toEqual(["/rh-exemplo/minhas-denuncias"]);
  });

  it("uma chefia que aprova ausências vê só «Assiduidade e ausências» no RH", () => {
    const tem = new Set(["hr.ausencias.aprovar.chefia"]);
    expect(visiveis("rh-exemplo", tem)).toEqual(["/rh-exemplo/assiduidade-e-ausencias"]);
  });

  it("quem gere denúncias vê a gestão; quem envia convites vê «Ver como a pessoa»", () => {
    expect(visiveis("rh-exemplo", new Set(["hr.denuncias.gerir"]))).toEqual(["/rh-exemplo/denuncias"]);
    expect(visiveis("rh-exemplo", new Set(["hr.onboarding.approve"]))).toEqual(["/rh-exemplo/admissao"]);
  });
});

describe("rotas /rh antigas: redirecionam para /rh-exemplo", () => {
  const linhaDe = (p: string) => appSource.split(/\r?\n/).find((l) => l.includes(`path="${p}"`)) ?? "";
  it.each([
    ["/rh/pessoas/:id?", "/rh-exemplo/pessoas/:id?"],
    ["/rh/documentos", "/rh-exemplo/documentos"],
    ["/rh/ausencias", "/rh-exemplo/ausencias"],
    ["/rh/ausencias/aprovacoes", "/rh-exemplo/assiduidade-e-ausencias?dominio=ausencias&tab=aprovacoes"],
    ["/rh/ausencias/organizacao", "/rh-exemplo/assiduidade-e-ausencias?dominio=ausencias"],
    ["/rh/assiduidade", "/rh-exemplo/assiduidade"],
    ["/rh/assiduidade/organizacao", "/rh-exemplo/assiduidade-e-ausencias?dominio=assiduidade"],
    ["/rh/assiduidade-e-ausencias", "/rh-exemplo/assiduidade-e-ausencias"],
    ["/rh/centros", "/rh-exemplo/centros"],
    ["/rh/admissao/configuracao", "/rh-exemplo/admissao/configuracao"],
    ["/rh/contratos/configuracao", "/rh-exemplo/contratos/configuracao"],
    ["/rh/cargos", "/rh-exemplo/pessoas?tab=cargos"],
    ["/rh/documentos/modelos", "/rh-exemplo/documentos/modelos"],
    ["/rh/documentos/clausulas", "/rh-exemplo/documentos/modelos"],
    ["/rh/processamento-salarial", "/rh-exemplo/processamento-salarial"],
  ])("%s leva a %s", (antiga, nova) => {
    expect(linhaDe(antiga)).toContain(`<RedirectRh para="${nova}" />`);
  });

  it("as páginas /rh antigas já não são importadas por App.tsx", () => {
    ["PessoaDetail", "MeusDocumentosHR", "Ausencias", "Assiduidade", "AssiduidadeEAusencias", "RhCentros", "ConfiguracaoAdmissao",
      "ConfiguracaoRegrasFimContrato", "ConfiguracaoModelosDocumentos", "Vencimento"].forEach((p) => {
      expect(appSource, p).not.toMatch(new RegExp(`import\\("\\./pages/${p}"\\)`));
    });
  });
});
