// Portal do cliente, corpo do contrato: contratos de sempre (português, sem versões) como hoje; contratos com versões
// ou noutro idioma mostram as `versoes` do resolver (o mesmo que o PDF), uma secção por idioma.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { contratoAtual, resolver, injetar } = vi.hoisted(() => ({
  contratoAtual: { valor: null as Record<string, unknown> | null },
  resolver: vi.fn(),
  injetar: vi.fn(),
}));

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve(result);
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    from: (table: string) => (table === "client_contracts" ? chain({ data: contratoAtual.valor }) : chain({ data: [] })),
    storage: { from: () => ({ download: vi.fn() }) },
  },
}));
vi.mock("@/components/portal/ClientPortalLayout", () => ({
  ClientPortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/contexts/PortalCompanyContext", () => ({ useSyncActiveOrgWithDocument: () => {} }));
vi.mock("@/components/contracts/contractDocument", () => ({
  injectSignaturesIntoBlock: (...args: unknown[]) => injetar(...args),
  resolveContractDocument: (...args: unknown[]) => resolver(...args),
  downloadContractDocumentPdf: vi.fn(),
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import ClientPortalContractDetail from "../ClientPortalContractDetail";
import { definirIdioma, reporIdiomaEmMemoria } from "@/portal-i18n/armazemIdioma";

const PT = "<h2>CONTRATO</h2><p>Cliente {{cliente_nome}} paga 1.234,50 €.</p>";
const COMPOSTO =
  `<div class="olv-versao olv-versao-pt">${PT}</div>\n` +
  `<div class="olv-versao olv-versao-en" style="break-before:page;page-break-before:always"><h2>SERVICES AGREEMENT</h2><p>Client {{cliente_nome}} pays 1.234,50 €.</p></div>`;

const CONTRATO = (extra: Record<string, unknown> = {}) => ({
  id: "c1",
  status: "pending_signature",
  organization_id: "o1",
  title: "Contrato",
  contract_number: "C-7",
  total_value: 1234.5,
  contract_body_html: PT,
  ...extra,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/contratos/c1"]}>
      <Routes>
        <Route path="/contratos/:id" element={<ClientPortalContractDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const corpo = () => document.querySelector(".prose");

describe("ClientPortalContractDetail: corpo do contrato por idioma", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    document.elementFromPoint = () => null;
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
  });
  beforeEach(() => {
    window.localStorage.clear();
    reporIdiomaEmMemoria();
    resolver.mockReset();
    injetar.mockReset();
    injetar.mockImplementation((html: string) => html);
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    reporIdiomaEmMemoria();
  });

  describe("contrato de sempre (português, sem versões): inalterado", () => {
    it("mostra o contract_body_html como hoje: não passa pelo resolver e injeta as assinaturas com as 3 argumentos de sempre", async () => {
      contratoAtual.valor = CONTRATO({
        company_signature_date: "2026-03-01T10:00:00Z", company_signed_by_name: "Ana",
        signature_date: "2026-03-02T10:00:00Z", signed_by_name: "Rui", signature_ip: "1.2.3.4",
      });
      renderPage();
      await screen.findByText("CONTRATO");
      expect(resolver).not.toHaveBeenCalled();
      expect(injetar).toHaveBeenCalledTimes(1);
      const [html, empresa, cliente, ...resto] = injetar.mock.calls[0];
      expect(html).toBe(PT);
      expect(resto).toEqual([]);
      expect(empresa).toEqual({ signed: true, name: "Ana", showOtpBadge: false });
      expect(cliente).toEqual({ signed: true, name: "Rui", signedAt: "2026-03-02T10:00:00Z", ip: "1.2.3.4", showOtpBadge: true });
      expect(document.querySelector("section[lang]")).toBeNull();
      expect(corpo()?.className).toBe("prose prose-sm max-w-none dark:prose-invert");
    });

    it("os tokens {{…}} por substituir continuam a aparecer como hoje (observação: não se corrige aqui)", async () => {
      contratoAtual.valor = CONTRATO();
      renderPage();
      await screen.findByText("CONTRATO");
      expect(corpo()?.innerHTML).toBe("<h2>CONTRATO</h2><p>Cliente {{cliente_nome}} paga 1.234,50 €.</p>");
    });

    it("__idiomas só «pt»: igual (não usa o resolver)", async () => {
      contratoAtual.valor = CONTRATO({ prompt_values: { __idiomas: "pt" } });
      renderPage();
      await screen.findByText("CONTRATO");
      expect(resolver).not.toHaveBeenCalled();
      expect(corpo()?.innerHTML).toBe("<h2>CONTRATO</h2><p>Cliente {{cliente_nome}} paga 1.234,50 €.</p>");
    });

    it("em inglês na interface, o contrato de sempre continua a ser o texto que lá está (as versões não dependem do idioma do portal)", async () => {
      definirIdioma("en");
      contratoAtual.valor = CONTRATO();
      renderPage();
      await screen.findByText("CONTRATO");
      expect(resolver).not.toHaveBeenCalled();
    });
  });

  describe("contrato com versões ou noutro idioma: pelo resolver", () => {
    const DOCUMENTO_PT_EN = {
      bodyHtml: "(junto)",
      versoes: [
        { codigo: "pt", bodyHtml: "<h2>CONTRATO</h2><p>Cliente ACME paga 1.234,50 €.</p>", settings: {} },
        { codigo: "en", bodyHtml: "<h2>SERVICES AGREEMENT</h2><p>Client ACME pays 1.234,50 €.</p>", settings: {} },
      ],
    };

    it("pt + en: uma secção por idioma, com lang e título; português primeiro; o resolver não congela", async () => {
      resolver.mockResolvedValue(DOCUMENTO_PT_EN);
      const contrato = CONTRATO({ contract_body_html: COMPOSTO, prompt_values: { __idiomas: "pt+en" } });
      contratoAtual.valor = contrato;
      renderPage();
      await screen.findByText("SERVICES AGREEMENT");

      const chamadaDoCorpo = resolver.mock.calls.find((c) => c[3]);
      expect(chamadaDoCorpo).toBeTruthy();
      expect(chamadaDoCorpo![0]).toMatchObject({ id: "c1", contract_body_html: COMPOSTO });
      expect(chamadaDoCorpo![1]).toBe("o1");
      expect(chamadaDoCorpo![3]).toEqual({ naoCongelar: true });

      const seccoes = Array.from(document.querySelectorAll("section[lang]"));
      expect(seccoes.map((s) => s.getAttribute("lang"))).toEqual(["pt", "en"]);
      expect(seccoes.map((s) => s.querySelector("h3")?.textContent)).toEqual(["Português", "English"]);
      expect(seccoes[0].textContent).toContain("Cliente ACME paga 1.234,50 €.");
      expect(seccoes[1].textContent).toContain("Client ACME pays 1.234,50 €.");
      // As assinaturas já vêm injetadas pelo resolver (uma só, com o carimbo nos dois idiomas): não se injeta duas vezes.
      expect(injetar).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain("{{");
    });

    it("a interface continua a seguir o idioma do portal (inglês) e as versões não mudam com ele", async () => {
      definirIdioma("en");
      resolver.mockResolvedValue(DOCUMENTO_PT_EN);
      contratoAtual.valor = CONTRATO({ contract_body_html: COMPOSTO, prompt_values: { __idiomas: "pt+en" } });
      renderPage();
      await screen.findByText("SERVICES AGREEMENT");
      expect(screen.getByRole("button", { name: /Accept and Sign/ })).toBeTruthy();
      expect(Array.from(document.querySelectorAll("section[lang]")).map((s) => s.getAttribute("lang"))).toEqual(["pt", "en"]);
    });

    it("um só idioma que não é o português (__idiomas = en, sem marcas): uma secção lang=en, sem título", async () => {
      resolver.mockResolvedValue({ bodyHtml: "x", versoes: [{ codigo: "en", bodyHtml: "<p>Only English</p>", settings: {} }] });
      contratoAtual.valor = CONTRATO({ contract_body_html: "<p>Only English {{x}}</p>", prompt_values: { __idiomas: "en" } });
      renderPage();
      await screen.findByText("Only English");
      expect(document.querySelector("section[lang='en']")).not.toBeNull();
      expect(document.querySelector("section[lang] h3")).toBeNull();
    });

    it("enquanto o resolver trabalha não mostra o corpo cru (com {{…}} por substituir): mostra que está a carregar", async () => {
      resolver.mockReturnValue(new Promise(() => {}));
      contratoAtual.valor = CONTRATO({ contract_body_html: COMPOSTO, prompt_values: { __idiomas: "pt+en" } });
      renderPage();
      await waitFor(() => expect(document.querySelector("[aria-busy='true']")).not.toBeNull());
      await act(async () => { await Promise.resolve(); });
      expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
      expect(document.body.textContent).not.toContain("{{cliente_nome}}");
    });

    it("o resolver falha: cai no corpo de sempre, o contrato continua legível", async () => {
      resolver.mockRejectedValue(new Error("sem rede"));
      contratoAtual.valor = CONTRATO({ contract_body_html: COMPOSTO, prompt_values: { __idiomas: "pt+en" } });
      renderPage();
      await waitFor(() => expect(injetar).toHaveBeenCalled());
      expect(await screen.findByText("SERVICES AGREEMENT")).toBeTruthy();
      expect(document.querySelector("[aria-busy='true']")).toBeNull();
    });

    it("o resolver não devolve documento (null): idem, corpo de sempre", async () => {
      resolver.mockResolvedValue(null);
      contratoAtual.valor = CONTRATO({ contract_body_html: COMPOSTO, prompt_values: { __idiomas: "pt+en" } });
      renderPage();
      await waitFor(() => expect(injetar).toHaveBeenCalled());
      expect(await screen.findByText("SERVICES AGREEMENT")).toBeTruthy();
    });
  });
});
