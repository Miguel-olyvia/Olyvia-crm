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

  it("/api-keys: settings.update OU api_keys.view na rota e no atalho (como a RLS de api_keys)", () => {
    expect(linhaDe("/api-keys")).toContain('<ProtectedRoute permissions={["settings.update", "api_keys.view"]}><ApiKeys />');
    expect(atalho("api-keys")?.permissions).toEqual(["settings.update", "api_keys.view"]);
  });

  it("Organizações: lista, ficha, organograma, ajuda e modelos pedem organizations.view (como o menu); a lista abre sem empresa", () => {
    expect(linhaDe("/org-help")).toContain('<ProtectedRoute permission="organizations.view"><OrgHelp />');
    expect(linhaDe("/org-templates")).toContain('<ProtectedRoute permission="organizations.view"><OrgTemplates />');
    expect(linhaDe("/organizations/:id")).toContain('<ProtectedRoute permission="organizations.view"><OrganizationDetail />');
    expect(linhaDe("/organizations")).toContain('<ProtectedRoute permission="organizations.view" allowWithoutCompany><Organizations />');
    expect(linhaDe("/org-chart")).toContain('<ProtectedRoute permission="organizations.view"><OrgChart />');
    expect(itemMenu("/organizations")?.permission).toBe("organizations.view");
    expect(itemMenu("/org-chart")?.permission).toBe("organizations.view");
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

// 04/11/2026 (D5): todas as rotas do CRM com a guarda do menu e do servidor. As que ficam só com sessão estão listadas com o porquê.
describe("rotas antes sem guarda", () => {
  const GUARDADAS: [string, string][] = [
    ["/dashboard", '<ProtectedRoute permission="dashboard.view" allowWithoutCompany><Dashboard />'],
    ["/lead-contact-results", '<ProtectedRoute permission="leads.config"><LeadContactResults />'],
    ["/needs-assessment-config", '<ProtectedRoute permission="settings.update"><NeedsAssessmentConfig />'],
    ["/marketing-integration", '<ProtectedRoute permission="settings.update"><MarketingIntegration />'],
    ["/postal-codes-import", "<ProtectedRoute systemAdminOnly><PostalCodesImport />"],
    ["/gallery", "<ProtectedRoute systemAdminOnly><Gallery />"],
    ["/test-iframe", "<ProtectedRoute systemAdminOnly><TestIframe />"],
    ["/test-widget", "<ProtectedRoute systemAdminOnly><TestWidget />"],
    ["/docs/auto-scheduling", '<ProtectedRoute permissions={["scheduling.items.view", "scheduling.boards.view", "scheduling.resources.view"]}><DocsAutoScheduling />'],
    ["/docs/invite-links", '<ProtectedRoute permission="users.view"><DocsInviteLinks />'],
  ];
  it.each(GUARDADAS)("%s tem a guarda certa", (rota, guarda) => {
    expect(linhaDe(rota)).toContain(guarda);
  });

  it("a documentação técnica (/docs/*) é só do administrador de sistema", () => {
    ["architecture", "user-model", "api", "database", "integrations", "edge-functions", "authentication", "guides", "permissions",
      "translations", "embed-widget"].forEach((d) => expect(linhaDe(`/docs/${d}`), d).toContain("<ProtectedRoute systemAdminOnly>"));
  });

  it("o menu do Dashboard pede o mesmo que a rota", () => {
    expect(topLevelItems.find((i) => i.id === "dashboard")!.permissions).toEqual(["dashboard.view"]);
    expect(atalho("dashboard")?.permission).toBe("dashboard.view");
  });

  it("ficam só com sessão (dados da própria pessoa ou páginas estáticas): sem ProtectedRoute", () => {
    ["/home", "/notifications", "/team-hub", "/welcome", "/marketing-api", "/marketing-help", "/rh-exemplo/minhas-denuncias"]
      .forEach((r) => expect(linhaDe(r), r).not.toContain("ProtectedRoute"));
  });

  it("/negocios continua com RotaNegocios (pessoas.view ou um papel no Negócio pelo RH), como o menu", () => {
    expect(linhaDe("/negocios")).toContain("<RotaNegocios>");
    expect(itemMenu("/negocios")?.permission).toBe("pessoas.view");
  });

  it("nenhuma rota do CRM com página fica sem guarda, exceto as listadas como só sessão", () => {
    const SO_SESSAO = new Set(["/home", "/notifications", "/team-hub", "/welcome", "/marketing-api", "/marketing-help",
      "/rh-exemplo/minhas-denuncias", "/negocios"]);
    const inicio = appSource.indexOf("<Route element={<CrmRouteGuard />}>");
    const fim = appSource.indexOf('<Route path="*"');
    const semGuarda = appSource.slice(inicio, fim).split(/\r?\n/)
      .map((l) => /<Route path="([^"]+)" element=\{(.*)\} \/>/.exec(l))
      .filter((m): m is RegExpExecArray => !!m)
      .filter(([, , el]) => !/ProtectedRoute|<Navigate |<Redirect|RotaNegocios/.test(el))
      .map(([, p]) => p)
      .filter((p) => !SO_SESSAO.has(p));
    expect(semGuarda).toEqual([]);
  });
});
