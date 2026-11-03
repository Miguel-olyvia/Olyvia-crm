// 03/11/2026: o grupo Aquisição saiu do menu (o Negócios em /pessoas e /negocios substitui-o). Os templates e modelos dos documentos
// passam para Definições, com a permissão da rota; /acquisition-help e /direct-sales levam para /negocios; /deals, /negocio-metas,
// /quotes, /proposals e /client-contracts continuam vivas (a ficha do /pessoas ainda as abre).
import { describe, expect, it } from "vitest";
import appSource from "@/App.tsx?raw";
import { translations } from "@/translations";
import { todayTranslations } from "@/translations/today";
import { menuSections, topLevelItems, type MenuItem } from "./menuConfig";

const itensDe = (id: string): MenuItem[] => {
  const s = menuSections.find((x) => x.id === id);
  return s ? [...s.items, ...(s.subSections ?? []).flatMap((x) => x.items)] : [];
};
const todosOsDestinos = [
  ...topLevelItems.map((i) => i.to),
  ...menuSections.flatMap((s) => [...s.items, ...(s.subSections ?? []).flatMap((x) => x.items)].map((i) => i.to)),
];
const linhaDaRota = (p: string) => appSource.split(/\r?\n/).find((l) => l.includes(`path="${p}"`)) ?? "";
/** A permissão do ProtectedRoute da rota em App.tsx, ou null se a rota não tiver guarda. */
const permissaoDaRota = (p: string): string | null => linhaDaRota(p).match(/<ProtectedRoute permission="([^"]+)">/)?.[1] ?? null;

describe("menu sem o grupo Aquisição", () => {
  it("o grupo acquisition já não existe e nenhum item aponta para as páginas dele", () => {
    expect(menuSections.find((s) => s.id === "acquisition")).toBeUndefined();
    ["/deals", "/negocio-metas", "/proposals", "/quotes", "/direct-sales", "/client-contracts", "/acquisition-help"].forEach((to) =>
      expect(todosOsDestinos, to).not.toContain(to));
    expect(menuSections.flatMap((s) => s.paths)).not.toContain("/direct-sales");
  });
});

describe("Definições: templates e modelos dos documentos do negócio", () => {
  const ITENS = [
    { to: "/contract-templates", labelKey: "sidebar.contractTemplates" },
    { to: "/quote-templates", labelKey: "today.quick.quotePdfTemplates" },
    { to: "/proposal-templates", labelKey: "sidebar.proposalTemplates" },
    { to: "/quote-models", labelKey: "today.quick.quoteModels" },
  ];
  const definicoes = itensDe("settings");

  it("tem os 4 itens, com a chave de tradução certa", () => {
    ITENS.forEach(({ to, labelKey }) => expect(definicoes.find((i) => i.to === to)?.labelKey, to).toBe(labelKey));
  });

  it("cada item pede exatamente a permissão do ProtectedRoute da sua rota em App.tsx (e a rota existe)", () => {
    ITENS.forEach(({ to }) => {
      expect(linhaDaRota(to), to).not.toBe("");
      const item = definicoes.find((i) => i.to === to)!;
      expect(item.permission ?? null, to).toBe(permissaoDaRota(to));
      expect(item.permissions, to).toBeUndefined();
    });
    expect(permissaoDaRota("/contract-templates")).toBe("client_contracts.view");
    expect(permissaoDaRota("/quote-templates")).toBe("quotes.manage");
    expect(permissaoDaRota("/quote-models")).toBe("quote_templates.view");
    // 03/11: /proposal-templates passou a ter ProtectedRoute com proposals.manage (aparecia a toda a gente).
    expect(permissaoDaRota("/proposal-templates")).toBe("proposals.manage");
  });

  it("o grupo Definições fica aberto nesses ecrãs (paths)", () => {
    const paths = menuSections.find((s) => s.id === "settings")!.paths;
    [...ITENS.map((i) => i.to), "/modelos-orcamento"].forEach((p) => expect(paths, p).toContain(p));
  });

  it("as chaves existem: sidebar.* nas 5 línguas, today.quick.* em en/pt (o t() cai para en)", () => {
    const linguas = translations as Record<string, Record<string, string>>;
    expect(Object.keys(linguas)).toHaveLength(5);
    Object.entries(linguas).forEach(([l, chaves]) => {
      expect(chaves["sidebar.contractTemplates"], l).toBeTruthy();
      expect(chaves["sidebar.proposalTemplates"], l).toBeTruthy();
    });
    ["en", "pt"].forEach((l) => {
      expect(todayTranslations[l]["today.quick.quotePdfTemplates"], l).toBeTruthy();
      expect(todayTranslations[l]["today.quick.quoteModels"], l).toBeTruthy();
    });
  });
});

describe("App.tsx: redirecionamentos da Aquisição", () => {
  it("/acquisition-help e /direct-sales levam para /negocios, e as páginas deixam de ser carregadas", () => {
    expect(linhaDaRota("/acquisition-help")).toMatch(/element=\{<Navigate to="\/negocios" replace \/>\}/);
    expect(linhaDaRota("/direct-sales")).toMatch(/element=\{<Navigate to="\/negocios" replace \/>\}/);
    expect(appSource).not.toMatch(/import\("\.\/pages\/DirectSales"\)/);
    expect(appSource).not.toMatch(/import\("\.\/pages\/AcquisitionHelp"\)/);
  });

  it("/deals, /negocio-metas, /quotes, /proposals e /client-contracts continuam com a página e a permissão", () => {
    expect(linhaDaRota("/deals")).toContain('<ProtectedRoute permission="deals.view"><Deals />');
    expect(linhaDaRota("/negocio-metas")).toContain('<ProtectedRoute permission="deals.view"><NegocioMetas />');
    expect(linhaDaRota("/quotes")).toContain('<ProtectedRoute permission="quotes.view"><Quotes />');
    expect(linhaDaRota("/proposals")).toContain('<ProtectedRoute permission="proposals.view"><Proposals />');
    expect(linhaDaRota("/client-contracts")).toContain('<ProtectedRoute permission="client_contracts.view"><ClientContracts />');
  });
});
