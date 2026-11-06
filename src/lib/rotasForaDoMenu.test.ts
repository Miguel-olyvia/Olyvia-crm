import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  caminhoDoDestino, MENSAGEM_SEM_PERMISSAO_DESTINO, PERMISSAO_DA_ROTA_FORA_DO_MENU, permissaoDoDestino, podeAbrirDestino,
} from "./rotasForaDoMenu";

const erro = vi.fn();
vi.mock("@/lib/toast", () => ({ toast: { error: (...a: unknown[]) => erro(...a), info: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const SRC = join(__dirname, "..");

describe("05/11 (ronda 2): as páginas fora do menu têm a mesma guarda em todas as entradas", () => {
  it("o mapa é exatamente o que as rotas de App.tsx pedem", () => {
    const app = readFileSync(join(SRC, "App.tsx"), "utf8");
    for (const [caminho, permissao] of Object.entries(PERMISSAO_DA_ROTA_FORA_DO_MENU)) {
      const rota = new RegExp(`path="${caminho.replace(/\//g, "\\/")}" element=\\{<ProtectedRoute permission="${permissao.replace(/\./g, "\\.")}">`);
      expect(app, caminho).toMatch(rota);
    }
  });

  it("lê o caminho sem a pesquisa nem o fragmento", () => {
    expect(caminhoDoDestino("/quotes?open=1&voltar=%2Fpessoas")).toBe("/quotes");
    expect(caminhoDoDestino("/client-contracts/#x")).toBe("/client-contracts");
    expect(permissaoDoDestino("/proposals?open=abc")).toBe("proposals.view");
    expect(permissaoDoDestino("/pessoas?open=abc")).toBeNull();
  });

  it("pede a permissão da rota às páginas fora do menu e não mexe nos outros destinos", () => {
    const tem = (lista: string[]) => (c: string) => lista.includes(c);
    expect(podeAbrirDestino("/quotes?open=1", tem([]))).toBe(false);
    expect(podeAbrirDestino("/quotes?open=1", tem(["quotes.view"]))).toBe(true);
    expect(podeAbrirDestino("/client-contracts?open=1", tem(["client_contracts.create"]))).toBe(false);
    // 06/11: /deals redireciona para /negocios e deixou de estar no mapa (não pede deals.view, escondida).
    expect(permissaoDoDestino("/deals?open=d1")).toBeNull();
    expect(podeAbrirDestino("/deals", tem([]))).toBe(true);
    expect(podeAbrirDestino("/pessoas?open=1", tem([]))).toBe(true);
  });

  it("a notificação não leva a um «Sem acesso»: sem a permissão não navega e diz porquê", async () => {
    const { openNotificationRoute } = await import("@/lib/notifications/notificationPresentation");
    const navegar = vi.fn();
    const sem = (d: string) => podeAbrirDestino(d, () => false);
    expect(openNotificationRoute(navegar, "/proposals?open=p1", sem)).toBe(false);
    expect(navegar).not.toHaveBeenCalled();
    expect(erro).toHaveBeenCalledWith(MENSAGEM_SEM_PERMISSAO_DESTINO);
    expect(openNotificationRoute(navegar, "/pessoas?open=x", sem)).toBe(true);
    expect(navegar).toHaveBeenCalledTimes(1);
    // sem a guarda (chamadas antigas) continua a abrir
    expect(openNotificationRoute(navegar, "/quotes?open=q1")).toBe(true);
    expect(navegar).toHaveBeenCalledTimes(2);
  });

  it("as entradas usam a guarda (atalhos, ficha, breadcrumb, notificações, guia e ligações entre as páginas)", () => {
    const usa = (f: string) => expect(readFileSync(join(SRC, f), "utf8"), f).toMatch(/usePodeAbrirDestino\(\)/);
    [
      "components/pessoas-processo/ProcessoProviderReal.tsx", "components/pessoas/AbrirDocumento.tsx",
      "components/pipeline/PipelineBreadcrumb.tsx", "components/TopHeader.tsx", "pages/Notifications.tsx", "pages/WelcomeGuide.tsx",
      "pages/ClientContracts.tsx", "pages/Proposals.tsx", "pages/Quotes.tsx", "components/proposals/ProposalCreateDialog.tsx",
      "components/deals/DealQuotesPanel.tsx",
    ].forEach(usa);
    // Os atalhos da Home e os alertas do Hoje já pediam a mesma permissão da rota.
    const atalhos = readFileSync(join(SRC, "components/home/QuickLinks.tsx"), "utf8");
    expect(atalhos).toContain('to: "/quotes", icon: Receipt, labelKey: "sidebar.quotes", permission: "quotes.view"');
    expect(atalhos).toContain('to: "/proposals", icon: FileText, labelKey: "sidebar.proposals", permission: "proposals.view"');
    expect(atalhos).toContain('to: "/client-contracts", icon: FileText, labelKey: "sidebar.contracts", permission: "client_contracts.view"');
    const hoje = readFileSync(join(SRC, "lib/agenda/today.ts"), "utf8");
    expect(hoje).toContain('href: "/quotes", permission: "quotes.view"');
    expect(hoje).toContain('href: "/proposals", permission: "proposals.view"');
    expect(hoje).toContain('href: "/client-contracts", permission: "client_contracts.view"');
  });
});
