// 23/11 (pedido do dono): «na pré-visualização, se eu tiver versões dos templates convinha eu poder ver, depois ao enviar convinha aparecer
// qual das versões enviar». No passo «Proposta» do negócio: com versões no template, um seletor por cima da folha (a folha troca de versão)
// e outro no envio; a escolha grava-se em proposals.language ANTES do envio, e sem gravação não há envio. Sem versões, nada muda.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { seed, type Negocio } from "@/emylia/motor";
import type { TemplateDeAspeto } from "@/hooks/pessoas/useTemplatesDeDocumento";

const m = vi.hoisted(() => ({
  ordem: [] as string[],
  updates: [] as { valores: Record<string, unknown>; id: string }[],
  resposta: { data: [{ id: "prop-1" }] as unknown, error: null as { message: string; code?: string } | null },
  gerar: vi.fn(),
  carregar: vi.fn(),
  propostaId: "prop-1" as string | null,
}));

function cadeia(data: unknown) {
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "limit", "is"]) q[k] = () => q;
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok);
  return q;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (nome: string) => Promise.resolve(
      nome === "fn_cat_pode" ? { data: true, error: null }
        : nome === "set_audit_context" ? { data: null, error: null }
          : { data: { proposta_id: "prop-1", contrato_id: null }, error: null },
    ),
    from: (t: string) => {
      const q = cadeia(t === "client_portal_documents" ? [] : [{ id: "prop-1", status: "draft" }]);
      q.update = (valores: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => ({
          select: () => {
            m.ordem.push("gravar");
            m.updates.push({ valores, id });
            return Promise.resolve(m.resposta);
          },
        }),
      });
      return q;
    },
  },
}));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: () => Promise.resolve("u-1") }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => false, isSystemAdmin: false, loading: false }) }));
vi.mock("@/hooks/useClientPortalAccess", () => ({
  useClientPortalAccess: () => ({ generatePortalAccess: (...a: unknown[]) => { m.ordem.push("enviar"); m.gerar(...a); }, loading: false }),
}));
vi.mock("@/hooks/pessoas/useTemplatesDeDocumento", () => ({
  useDadosDaProposta: () => ({ data: m.propostaId ? { id: m.propostaId, numero: "P-1", data: "30/10/2026", criadaEm: "2026-10-30T10:00:00Z" } : null }),
}));
vi.mock("@/components/proposals/proposalPortalData", () => ({ loadProposalPortalData: (id: string) => m.carregar(id) }));

import { DocumentoDaPropostaNoPasso } from "./DocumentoDaPropostaNoPasso";
import { EnviarParaPortal } from "./EnviarParaPortal";
import { EscolhaDasVersoes } from "./EscolhaDasVersoes";
import { useVersoesDaPropostaNoPasso } from "./versoesDaPropostaNoPasso";

beforeAll(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("language", "pt");
  m.ordem = []; m.updates = []; m.gerar.mockReset(); m.carregar.mockReset(); m.propostaId = "prop-1";
  m.resposta = { data: [{ id: "prop-1" }], error: null };
});
afterEach(cleanup);

const tpl = (over: Partial<TemplateDeAspeto> = {}): TemplateDeAspeto => ({
  id: "t1", name: "Mudelar", description: null, is_default: true, logo_url: null, primary_color: "#24204a", secondary_color: null, accent_color: null,
  background_color: null, text_color: null, font_family: null, heading_font_family: null, header_text: null, footer_text: null,
  terms_conditions: null, thank_you_message: null, show_company_info: true, show_client_info: true, show_validity: true, show_terms: true,
  sections: [{ id: "h", type: "header", visible: true, settings: { customTitle: "TITULO PT", showLogo: false, showDate: true } }],
  ...over,
});
const COM_VERSOES = { design_settings: { versions: { en: { sections: { h: { customTitle: "TITLE EN" } } } } } };

function negocio(): { d: Negocio; S: ReturnType<typeof seed> } {
  const S = seed();
  const d = S.deals.find((x) => x.orc && x.orc.linhas.length > 0)!;
  return { d, S };
}

function envolver(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<LanguageProvider><QueryClientProvider client={qc}>{ui}</QueryClientProvider></LanguageProvider>);
}

describe("a folha da proposta no passo, com as versões do template", () => {
  it("sem `idiomas`: tudo como hoje (sem seletor, a versão base)", () => {
    m.propostaId = null;
    const { d, S } = negocio();
    envolver(<DocumentoDaPropostaNoPasso negocioId="n1" d={d} S={S} tpl={tpl(COM_VERSOES)} empresa={{ nome: "Mudelar", logo: null }} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByText("TITULO PT")).toBeTruthy();
    expect(screen.queryByText("TITLE EN")).toBeNull();
  });

  it("com «en»: a folha mostra a versão inglesa", () => {
    m.propostaId = null;
    const { d, S } = negocio();
    envolver(<DocumentoDaPropostaNoPasso negocioId="n1" d={d} S={S} tpl={tpl(COM_VERSOES)} empresa={{ nome: "Mudelar", logo: null }} idiomas={["en"]} />);
    expect(screen.getByText("TITLE EN")).toBeTruthy();
    expect(screen.queryByText("TITULO PT")).toBeNull();
  });

  it("com «pt+en»: uma versão de cada vez, com o seletor do portal, e a folha troca de versão", () => {
    m.propostaId = null;
    const { d, S } = negocio();
    envolver(<DocumentoDaPropostaNoPasso negocioId="n1" d={d} S={S} tpl={tpl(COM_VERSOES)} empresa={{ nome: "Mudelar", logo: null }} idiomas={["pt", "en"]} />);
    expect(screen.getByText("TITULO PT")).toBeTruthy();
    expect(screen.queryByText("TITLE EN")).toBeNull();
    const grupo = screen.getByRole("radiogroup");
    fireEvent.click(within(grupo).getByRole("radio", { name: "English" }));
    expect(screen.getByText("TITLE EN")).toBeTruthy();
    expect(screen.queryByText("TITULO PT")).toBeNull();
  });
});

function Passo({ t }: { t: TemplateDeAspeto | null }) {
  const v = useVersoesDaPropostaNoPasso("neg-1", t);
  return (
    <>
      <EscolhaDasVersoes v={v} sitio="folha" />
      <EnviarParaPortal negocioId="neg-1" tipo="proposal" podeEditar antesDeEnviar={v.antesDeEnviar} extra={<EscolhaDasVersoes v={v} sitio="envio" />} />
    </>
  );
}
const real = (template: TemplateDeAspeto, language: string | null) => ({
  proposal: { id: "prop-1", status: "draft", language }, template, quotes: [], quoteLines: {}, quoteFees: {}, commercial: null, company: null, idiomasDoDocumento: ["pt"],
});
const botao = () => screen.findByRole("button", { name: "Enviar para o portal do cliente" });
const grupoDoEnvio = () => screen.getByRole("radiogroup", { name: "Idiomas a enviar ao portal" });

describe("o envio da proposta com as versões do template", () => {
  it("sem versões: nenhum seletor e envia sem tocar no idioma", async () => {
    m.carregar.mockResolvedValue(real(tpl(), null));
    envolver(<Passo t={tpl()} />);
    const b = await botao();
    await waitFor(() => expect((b as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole("radiogroup")).toBeNull();
    fireEvent.click(b);
    await waitFor(() => expect(m.gerar).toHaveBeenCalledWith("proposal", "prop-1", false));
    expect(m.updates).toEqual([]);
  });

  it("com versões: dois seletores (ver e enviar), pré-seleção do que a proposta já tem", async () => {
    m.carregar.mockResolvedValue(real(tpl(COM_VERSOES), "en"));
    envolver(<Passo t={tpl(COM_VERSOES)} />);
    await botao();
    await waitFor(() => expect(within(grupoDoEnvio()).getByRole("radio", { name: "English" }).getAttribute("aria-checked")).toBe("true"));
    expect(screen.getByRole("radiogroup", { name: "Versão da proposta a ver" })).toBeTruthy();
  });

  it("grava a escolha em proposals.language ANTES de enviar", async () => {
    m.carregar.mockResolvedValue(real(tpl(COM_VERSOES), null));
    envolver(<Passo t={tpl(COM_VERSOES)} />);
    const b = await botao();
    await waitFor(() => expect(grupoDoEnvio()).toBeTruthy());
    fireEvent.click(within(grupoDoEnvio()).getByRole("radio", { name: "Português + English" }));
    await waitFor(() => expect((b as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(b);
    await waitFor(() => expect(m.gerar).toHaveBeenCalledWith("proposal", "prop-1", false));
    expect(m.updates).toEqual([{ valores: { language: "pt+en" }, id: "prop-1" }]);
    expect(m.ordem).toEqual(["gravar", "enviar"]);
  });

  it("a mesma escolha que a proposta já tem: envia sem gravar", async () => {
    m.carregar.mockResolvedValue(real(tpl(COM_VERSOES), "pt+en"));
    envolver(<Passo t={tpl(COM_VERSOES)} />);
    const b = await botao();
    await waitFor(() => expect(within(grupoDoEnvio()).getByRole("radio", { name: "Português + English" }).getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(b);
    await waitFor(() => expect(m.gerar).toHaveBeenCalled());
    expect(m.updates).toEqual([]);
  });

  it("se a gravação não passar (RLS: 0 linhas), não envia e diz porquê", async () => {
    m.resposta = { data: [], error: null };
    m.carregar.mockResolvedValue(real(tpl(COM_VERSOES), null));
    envolver(<Passo t={tpl(COM_VERSOES)} />);
    const b = await botao();
    await waitFor(() => expect(grupoDoEnvio()).toBeTruthy());
    fireEvent.click(within(grupoDoEnvio()).getByRole("radio", { name: "English" }));
    fireEvent.click(b);
    expect(await screen.findByText(/não foi enviada/)).toBeTruthy();
    expect(m.updates).toHaveLength(1);
    expect(m.gerar).not.toHaveBeenCalled();
  });

  it("se a base recusar (erro), não envia", async () => {
    m.resposta = { data: null, error: { message: "Sem permissão (negocios.proposta.enviar)", code: "42501" } };
    m.carregar.mockResolvedValue(real(tpl(COM_VERSOES), null));
    envolver(<Passo t={tpl(COM_VERSOES)} />);
    const b = await botao();
    await waitFor(() => expect(grupoDoEnvio()).toBeTruthy());
    fireEvent.click(within(grupoDoEnvio()).getByRole("radio", { name: "English" }));
    fireEvent.click(b);
    expect(await screen.findByText(/não foi enviada/)).toBeTruthy();
    expect(m.gerar).not.toHaveBeenCalled();
  });
});
