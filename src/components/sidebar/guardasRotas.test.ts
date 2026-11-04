// 03/11/2026: as guardas das rotas e do menu seguem as permissões que existem e que o servidor exige; as páginas antigas do catálogo
// redirecionam para o Catálogo e custos.
import { describe, expect, it } from "vitest";
import appSource from "@/App.tsx?raw";
import quoteEditor from "@/components/QuoteTemplateEditor.tsx?raw";
import { QUICK_GROUPS } from "@/components/home/QuickLinks";
import { menuSections, topLevelItems } from "./menuConfig";

const linhaDe = (p: string) => appSource.split(/\r?\n/).find((l) => l.includes(`path="${p}"`)) ?? "";
const itemMenu = (to: string) => menuSections.flatMap((s) => [...s.items, ...(s.subSections ?? []).flatMap((x) => x.items)]).find((i) => i.to === to);
const atalho = (id: string) => QUICK_GROUPS.flatMap((g) => g.items).find((i) => i.id === id);

const CATALOGO_ANTIGO = [
  ["/products", "Products"], ["/services", "Services"], ["/brands", "Brands"], ["/bundles", "Bundles"],
  ["/product-categories", "ProductCategories"], ["/product-subcategories", "ProductSubcategories"], ["/product-attributes", "ProductAttributes"],
  ["/units-of-measure", "UnitsOfMeasure"], ["/service-categories", "ServiceCategories"], ["/service-subcategories", "ServiceSubcategories"],
  ["/service-catalog-items", "ServiceCatalogItems"], ["/service-fees", "ServiceFees"], ["/catalog-items", "CatalogItems"],
  ["/product-configurator-lab", "ProductConfiguratorLab"],
] as const;

describe("catálogo antigo: redireciona para /catalogo-custos", () => {
  it.each(CATALOGO_ANTIGO)("%s leva ao Catálogo e custos e a página já não é carregada", (rota, pagina) => {
    expect(linhaDe(rota)).toContain('<Navigate to="/catalogo-custos" replace />');
    expect(appSource).not.toMatch(new RegExp(`import\\("\\./pages/${pagina}"\\)`));
  });

  it("o Catálogo e custos continua com services.view", () => {
    expect(linhaDe("/catalogo-custos")).toContain('<ProtectedRoute permission="services.view"><CatalogoCustos />');
  });

  it("Organizações já não abre nos caminhos do catálogo nem pede products.view/services.view", () => {
    const org = menuSections.find((s) => s.id === "organizations")!;
    CATALOGO_ANTIGO.forEach(([rota]) => expect(org.paths, rota).not.toContain(rota));
    expect(org.paths).not.toContain("/service-catalog");
    expect(org.permissions).not.toContain("products.view");
    expect(org.permissions).not.toContain("services.view");
  });

  it("o editor de modelos de orçamento abre o Catálogo e custos, não /products ou /services", () => {
    expect(quoteEditor).not.toMatch(/\/products\?edit=|\/services\?edit=/);
    expect(quoteEditor).toContain('window.open("/catalogo-custos", "_blank")');
  });

  it("os atalhos do Hoje não levam às páginas antigas do catálogo; fica um atalho para o Catálogo e custos", () => {
    const destinos = QUICK_GROUPS.flatMap((g) => g.items.map((i) => i.to));
    CATALOGO_ANTIGO.forEach(([rota]) => expect(destinos, rota).not.toContain(rota));
    expect(atalho("catalogo")).toMatchObject({ to: "/catalogo-custos", permission: "services.view" });
  });
});

describe("guardas das rotas e do menu", () => {
  it("/send-failures: smtp.view na rota e no menu", () => {
    expect(linhaDe("/send-failures")).toContain('<ProtectedRoute permission="smtp.view">');
    expect(itemMenu("/send-failures")?.permission).toBe("smtp.view");
  });

  it("/trash: trash.view na rota, no menu e no atalho", () => {
    expect(linhaDe("/trash")).toContain('<ProtectedRoute permission="trash.view"><Trash />');
    expect(itemMenu("/trash")?.permission).toBe("trash.view");
    expect(atalho("trash")?.permission).toBe("trash.view");
  });

  it("/scheduling: qualquer das permissões de ver da agenda", () => {
    expect(linhaDe("/scheduling")).toContain(
      '<ProtectedRoute permissions={["scheduling.items.view", "scheduling.boards.view", "scheduling.resources.view"]}><Scheduling />',
    );
    expect(atalho("scheduling")?.permission).toBe("scheduling.items.view");
  });

  it("Operação (menu) pede operations.view E pessoas.view (a rota /negocios exige pessoas.view)", () => {
    const op = topLevelItems.find((i) => i.id === "operacao")!;
    expect(op.permissions).toEqual(["operations.view", "pessoas.view"]);
    expect(op.requireAll).toBe(true);
    expect(linhaDe("/negocios")).toContain("<RotaNegocios>");
  });

  it("/lead-sources: lead_sources.view na rota e no menu", () => {
    expect(linhaDe("/lead-sources")).toContain('<ProtectedRoute permission="lead_sources.view"><LeadSources />');
    expect(itemMenu("/lead-sources")?.permission).toBe("lead_sources.view");
    expect(menuSections.find((s) => s.id === "marketing")!.permissions).not.toContain("channels.view");
  });

  it("/channels, /channels/:id e o atalho: campaigns.view", () => {
    expect(linhaDe("/channels")).toContain('<ProtectedRoute permission="campaigns.view"><Channels />');
    expect(linhaDe("/channels/:id")).toContain('<ProtectedRoute permission="campaigns.view">');
    expect(atalho("channels")?.permission).toBe("campaigns.view");
  });

  it("/api-keys: settings.update na rota e no atalho", () => {
    expect(linhaDe("/api-keys")).toContain('<ProtectedRoute permission="settings.update">');
    expect(atalho("api-keys")?.permission).toBe("settings.update");
  });

  it("/org-help e /org-templates pedem organizations.view, /organizations/:id organizations.edit, /organizations fica aberta", () => {
    expect(linhaDe("/org-help")).toContain('<ProtectedRoute permission="organizations.view"><OrgHelp />');
    expect(linhaDe("/org-templates")).toContain('<ProtectedRoute permission="organizations.view"><OrgTemplates />');
    expect(linhaDe("/organizations/:id")).toContain('<ProtectedRoute permission="organizations.edit"><OrganizationDetail />');
    expect(linhaDe("/organizations")).toContain("<Organizations />");
    expect(linhaDe("/organizations")).not.toContain("ProtectedRoute");
  });

  it("/proposal-templates: proposals.manage na rota e no menu", () => {
    expect(linhaDe("/proposal-templates")).toContain('<ProtectedRoute permission="proposals.manage"><ProposalTemplates />');
    expect(itemMenu("/proposal-templates")?.permission).toBe("proposals.manage");
  });

  it("os atalhos das definições pedem settings.update e o dos modelos de contrato client_contracts.view", () => {
    ["settings", "alert-settings", "countries"].forEach((id) => expect(atalho(id)?.permission, id).toBe("settings.update"));
    expect(atalho("contract-templates")?.permission).toBe("client_contracts.view");
    expect(linhaDe("/countries")).toContain('<ProtectedRoute permission="settings.update">');
  });
});
