// Portal do cliente, corpo do contrato: contratos de sempre (português, sem versões) como hoje; contratos com versões
// ou noutro idioma mostram as `versoes` do resolver (o mesmo que o PDF), uma secção por idioma.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { contratoAtual, resolver, injetar, descarregar, invoke } = vi.hoisted(() => ({
  contratoAtual: { valor: null as Record<string, unknown> | null },
  resolver: vi.fn(),
  injetar: vi.fn(),
  descarregar: vi.fn(),
  invoke: vi.fn(),
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
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
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
  downloadContractDocumentPdf: (...args: unknown[]) => descarregar(...args),
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
    descarregar.mockReset();
    invoke.mockReset();
    invoke.mockImplementation(async (nome: string) =>
      nome === "sms-otp" ? { data: { masked_phone: "9*****123" }, error: null } : { data: null, error: null },
    );
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
    // A composição deixa o bloco de assinatura (com o carimbo nos dois idiomas) só na última versão.
    const FRASE = `<p class="olv-assinatura-unica">Esta assinatura vale para as versões em português e em inglês. / This signature applies to both the Portuguese and English versions.</p>`;
    const COLUNA = (rotulo: string, carimbo = "") =>
      `<div style="flex:1;">${carimbo}<div style="border-bottom:1px solid #000;height:40px;"></div><p>${rotulo}</p></div>`;
    const CARIMBO = `<div><span>Assinado via SMS OTP / Signed via SMS OTP</span> <span>Rui Costa</span></div>`;
    const BLOCO = `<div style="display:flex;">${COLUNA("MUDELAR, LDA.")}${COLUNA("THE CLIENT", CARIMBO)}</div>`;
    const DOCUMENTO_PT_EN = {
      bodyHtml: "(junto)",
      versoes: [
        { codigo: "pt", bodyHtml: "<h2>CONTRATO</h2><p>Cliente ACME paga 1.234,50 €.</p>", settings: {} },
        { codigo: "en", bodyHtml: `<h2>SERVICES AGREEMENT</h2><p>Client ACME pays 1.234,50 €.</p>${FRASE}${BLOCO}`, settings: {} },
      ],
    };
    const contratoPtEn = (extra: Record<string, unknown> = {}) =>
      CONTRATO({ contract_body_html: COMPOSTO, prompt_values: { __idiomas: "pt+en" }, ...extra });
    const seccoes = () => Array.from(document.querySelectorAll("section[lang]"));
    const radio = (nome: string) => screen.getByRole("radio", { name: nome });

    it("pt + en: seletor no topo e SÓ uma versão (a da interface, português); o resolver não congela", async () => {
      resolver.mockResolvedValue(DOCUMENTO_PT_EN);
      const contrato = contratoPtEn();
      contratoAtual.valor = contrato;
      renderPage();
      await screen.findByText("CONTRATO");

      const chamadaDoCorpo = resolver.mock.calls.find((c) => c[3]);
      expect(chamadaDoCorpo).toBeTruthy();
      expect(chamadaDoCorpo![0]).toMatchObject({ id: "c1", contract_body_html: COMPOSTO });
      expect(chamadaDoCorpo![1]).toBe("o1");
      expect(chamadaDoCorpo![3]).toEqual({ naoCongelar: true });

      expect(screen.getByRole("radiogroup", { name: "Idioma do contrato" })).toBeTruthy();
      expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Português", "English"]);
      expect(radio("Português").getAttribute("aria-checked")).toBe("true");
      // uma só versão visível, sem o título por cima (o seletor já diz qual é)
      expect(seccoes().map((s) => s.getAttribute("lang"))).toEqual(["pt"]);
      expect(seccoes()[0].querySelector("h3")).toBeNull();
      expect(seccoes()[0].textContent).toContain("Cliente ACME paga 1.234,50 €.");
      expect(document.body.textContent).not.toContain("SERVICES AGREEMENT");
      expect(document.body.textContent).not.toContain("Client ACME pays");
      // As assinaturas já vêm injetadas pelo resolver: não se injeta duas vezes.
      expect(injetar).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain("{{");
    });

    it("o seletor está por cima do corpo do contrato", async () => {
      resolver.mockResolvedValue(DOCUMENTO_PT_EN);
      contratoAtual.valor = contratoPtEn();
      renderPage();
      const corpoDoContrato = await screen.findByText("CONTRATO");
      const seletor = screen.getByRole("radiogroup");
      expect(seletor.compareDocumentPosition(corpoDoContrato) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("o idioma inicial é o da interface quando o contrato o tem (inglês); o resto da interface segue o portal", async () => {
      definirIdioma("en");
      resolver.mockResolvedValue(DOCUMENTO_PT_EN);
      contratoAtual.valor = contratoPtEn();
      renderPage();
      await screen.findByText("SERVICES AGREEMENT");
      expect(screen.getByRole("button", { name: /Accept and Sign/ })).toBeTruthy();
      expect(screen.getByRole("radiogroup", { name: "Contract language" })).toBeTruthy();
      expect(radio("English").getAttribute("aria-checked")).toBe("true");
      expect(seccoes().map((s) => s.getAttribute("lang"))).toEqual(["en"]);
      expect(document.body.textContent).not.toContain("Cliente ACME paga");
    });

    it("a interface num idioma que o contrato não tem: a primeira versão do contrato", async () => {
      definirIdioma("en");
      resolver.mockResolvedValue({ bodyHtml: "x", versoes: [
        { codigo: "pt", bodyHtml: "<h2>CONTRATO</h2>", settings: {} },
        { codigo: "es", bodyHtml: "<h2>CONTRATO ES</h2>", settings: {} },
      ] });
      contratoAtual.valor = contratoPtEn();
      renderPage();
      await screen.findByText("CONTRATO");
      expect(seccoes().map((s) => s.getAttribute("lang"))).toEqual(["pt"]);
      expect(document.body.textContent).not.toContain("CONTRATO ES");
    });

    it("trocar de idioma troca o texto visível (as duas direções)", async () => {
      resolver.mockResolvedValue(DOCUMENTO_PT_EN);
      contratoAtual.valor = contratoPtEn();
      renderPage();
      await screen.findByText("CONTRATO");
      fireEvent.click(radio("English"));
      expect(await screen.findByText("SERVICES AGREEMENT")).toBeTruthy();
      expect(seccoes().map((s) => s.getAttribute("lang"))).toEqual(["en"]);
      expect(document.body.textContent).not.toContain("Cliente ACME paga");
      expect(radio("English").getAttribute("aria-checked")).toBe("true");
      fireEvent.click(radio("Português"));
      expect(await screen.findByText("CONTRATO")).toBeTruthy();
      expect(document.body.textContent).not.toContain("Client ACME pays");
      // trocar não pede o documento outra vez
      expect(resolver.mock.calls.filter((c) => c[3])).toHaveLength(1);
    });

    it("trocar de idioma não perde o que o cliente já fez (código OTP escrito, passo da assinatura)", async () => {
      resolver.mockResolvedValue(DOCUMENTO_PT_EN);
      contratoAtual.valor = contratoPtEn();
      renderPage();
      await screen.findByText("CONTRATO");
      await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /Enviar código SMS/ })[0]); });
      const campo = () => document.querySelector("input[autocomplete='one-time-code']") as HTMLInputElement;
      await waitFor(() => expect(campo()).not.toBeNull());
      fireEvent.change(campo(), { target: { value: "123" } });
      expect(campo().value).toBe("123");
      const pedidosSms = invoke.mock.calls.filter((c) => c[0] === "sms-otp").length;

      fireEvent.click(radio("English"));
      await screen.findByText("SERVICES AGREEMENT");
      expect(campo()).not.toBeNull();
      expect(campo().value).toBe("123");
      expect(document.body.textContent).toContain("9*****123");
      fireEvent.click(radio("Português"));
      await screen.findByText("CONTRATO");
      expect(campo().value).toBe("123");
      // e não foi pedido outro SMS
      expect(invoke.mock.calls.filter((c) => c[0] === "sms-otp").length).toBe(pedidosSms);
    });

    it("a versão que não tem o bloco de assinatura leva o da última, com o carimbo e a frase das duas versões", async () => {
      resolver.mockResolvedValue(DOCUMENTO_PT_EN);
      contratoAtual.valor = contratoPtEn();
      renderPage();
      await screen.findByText("CONTRATO");
      const pt = seccoes()[0].textContent ?? "";
      expect(pt).toContain("Esta assinatura vale para as versões em português e em inglês.");
      expect(pt).toContain("This signature applies to both the Portuguese and English versions.");
      expect(pt).toContain("Assinado via SMS OTP / Signed via SMS OTP");
      expect(pt).toContain("Rui Costa");
      expect(pt).toContain("MUDELAR, LDA.");
      expect(pt).toContain("THE CLIENT");
      expect(pt.match(/Esta assinatura vale/g)).toHaveLength(1);
      expect(pt.indexOf("Cliente ACME paga")).toBeLessThan(pt.indexOf("Esta assinatura vale"));
      // a versão que já tinha o bloco continua a tê-lo uma só vez
      fireEvent.click(radio("English"));
      await screen.findByText("SERVICES AGREEMENT");
      const en = seccoes()[0].textContent ?? "";
      expect(en.match(/Esta assinatura vale/g)).toHaveLength(1);
      expect(en.match(/THE CLIENT/g)).toHaveLength(1);
      expect(en).toContain("Assinado via SMS OTP / Signed via SMS OTP");
    });

    it("a assinatura continua a ser uma só: o fluxo (Aceitar e Assinar, OTP) aparece uma vez, igual nas duas versões", async () => {
      resolver.mockResolvedValue(DOCUMENTO_PT_EN);
      contratoAtual.valor = contratoPtEn();
      renderPage();
      await screen.findByText("CONTRATO");
      expect(screen.getAllByRole("button", { name: "Aceitar e Assinar" })).toHaveLength(1);
      fireEvent.click(radio("English"));
      await screen.findByText("SERVICES AGREEMENT");
      expect(screen.getAllByRole("button", { name: "Aceitar e Assinar" })).toHaveLength(1);
      expect(screen.getAllByText(/Enviar código SMS/).length).toBeGreaterThan(0);
    });

    it("o PDF descarrega só a versão escolhida (com o bloco de assinatura), e muda quando se troca", async () => {
      resolver.mockResolvedValue(DOCUMENTO_PT_EN);
      contratoAtual.valor = contratoPtEn({ contract_number: "C-7" });
      renderPage();
      await screen.findByText("CONTRATO");
      const botao = () => screen.getByRole("button", { name: /Descarregar PDF/ });

      await act(async () => { fireEvent.click(botao()); });
      await waitFor(() => expect(descarregar).toHaveBeenCalledTimes(1));
      // o PDF (que congela, como sempre) é pedido sem a opção naoCongelar
      const chamadasDoPdf = resolver.mock.calls.filter((c) => !c[3]);
      expect(chamadasDoPdf).toHaveLength(1);
      const [resolvido, titulo, nomeDoFicheiro] = descarregar.mock.calls[0];
      expect(resolvido.versoes.map((v: { codigo: string }) => v.codigo)).toEqual(["pt"]);
      expect(resolvido.bodyHtml).toBe(resolvido.versoes[0].bodyHtml);
      expect(resolvido.bodyHtml).toContain("Cliente ACME paga");
      expect(resolvido.bodyHtml).toContain("THE CLIENT");
      expect(resolvido.bodyHtml).not.toContain("SERVICES AGREEMENT");
      expect([titulo, nomeDoFicheiro]).toEqual(["C-7", "C-7"]);

      fireEvent.click(radio("English"));
      await screen.findByText("SERVICES AGREEMENT");
      await act(async () => { fireEvent.click(botao()); });
      await waitFor(() => expect(descarregar).toHaveBeenCalledTimes(2));
      const [em] = descarregar.mock.calls[1];
      expect(em.versoes.map((v: { codigo: string }) => v.codigo)).toEqual(["en"]);
      expect(em.bodyHtml).toContain("Client ACME pays");
      expect(em.bodyHtml).not.toContain("Cliente ACME paga");
    });

    it("o PDF de um contrato com uma só versão segue como hoje (o documento resolvido tal e qual)", async () => {
      const documento = { bodyHtml: "<p>Only English</p>", versoes: [{ codigo: "en", bodyHtml: "<p>Only English</p>", settings: {} }] };
      resolver.mockResolvedValue(documento);
      contratoAtual.valor = CONTRATO({ contract_body_html: "<p>Only English {{x}}</p>", prompt_values: { __idiomas: "en" } });
      renderPage();
      await screen.findByText("Only English");
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Descarregar PDF/ })); });
      await waitFor(() => expect(descarregar).toHaveBeenCalledTimes(1));
      expect(descarregar.mock.calls[0][0]).toBe(documento);
    });

    it("um contrato de uma só versão (en) não mostra seletor", async () => {
      resolver.mockResolvedValue({ bodyHtml: "x", versoes: [{ codigo: "en", bodyHtml: "<p>Only English</p>", settings: {} }] });
      contratoAtual.valor = CONTRATO({ contract_body_html: "<p>Only English {{x}}</p>", prompt_values: { __idiomas: "en" } });
      renderPage();
      await screen.findByText("Only English");
      expect(screen.queryByRole("radiogroup")).toBeNull();
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
