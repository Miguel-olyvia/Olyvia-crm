// ContractBodyTab: gerar/regenerar com idiomas (variáveis por segmento, __idiomas gravado) e a pré-visualização
// pelas versões do resolver. Contrato em português e sem versões: tudo como hoje.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { atualizacoes, resolver, ofertaGerada, variaveisCustom } = vi.hoisted(() => ({
  atualizacoes: [] as Array<{ tabela: string; payload: Record<string, unknown> }>,
  resolver: vi.fn(),
  ofertaGerada: { props: null as null | { onGenerated: (...a: unknown[]) => void } },
  variaveisCustom: { lista: [] as Array<Record<string, unknown>> },
}));

function consulta(resultado: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "order"]) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve({ data: null, error: null });
  c.single = () => Promise.resolve({ data: null, error: null });
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(resultado).then(res);
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: (tabela: string) => ({
      select: () => consulta({ data: tabela === "custom_contract_variables" ? variaveisCustom.lista : [], error: null }),
      update: (payload: Record<string, unknown>) => {
        atualizacoes.push({ tabela, payload });
        return consulta({ data: null, error: null });
      },
    }),
  },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: vi.fn(async () => "u1") }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-nike", name: "Nike Teste" } }) }));
vi.mock("@/hooks/useDocumentSettings", () => ({ useDocumentSettings: () => ({ settings: {} }) }));
// Ramo RH: o ContractBodyTab lê permissões (contra-assinatura); aqui não interessam, dá-se tudo.
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true }) }));
vi.mock("@/components/RichTextEditor", () => ({ RichTextEditor: ({ value }: { value: string }) => <div data-testid="editor">{value}</div> }));
vi.mock("@/components/contracts/GenerateFromTemplateDialog", () => ({
  GenerateFromTemplateDialog: (props: { onGenerated: (...a: unknown[]) => void }) => {
    ofertaGerada.props = props;
    return null;
  },
}));
vi.mock("@/components/contracts/FillPromptVariablesDialog", () => ({
  FillPromptVariablesDialog: ({ open, onConfirm }: { open: boolean; onConfirm: (v: Record<string, string>) => void }) =>
    open ? <button onClick={() => onConfirm({ custom_x: "VALOR" })}>confirmar-valores</button> : null,
}));
vi.mock("@/components/contracts/contractHeader", () => ({
  renderContractHeaderHtml: (_s: unknown, _v: unknown, idioma?: string) => `<div class="cab">CABECALHO:${idioma ?? "sem-idioma"}</div>`,
}));
vi.mock("@/components/contracts/contractDocument", () => ({
  gatherContractData: vi.fn(async () => ({ cliente_nome: "ACME", contrato_data_inicio: "2026-03-13T12:00:00.000Z" })),
  applyQuoteItemsToken: (h: string) => h,
  applyFormulaChips: (h: string) => h,
  stripVariableChips: (h: string) => h,
  injectSignaturesIntoBlock: (h: string) => h,
  isContractInForce: () => false,
  UNFREEZE_CONTRACT_COLUMNS: {},
  resolveContractDocument: (...args: unknown[]) => resolver(...args),
}));

import { ContractBodyTab } from "../ContractBodyTab";

const PT = "<h2>CONTRATO</h2><p>Cliente {{cliente_nome}}, desde {{contrato_data_inicio}}.</p>";
const EN = "<h2>SERVICES AGREEMENT</h2><p>Client {{cliente_nome}}, since {{contrato_data_inicio}}.</p>";
const COMPOSTO =
  `<div class="olv-versao olv-versao-pt">${PT}</div>\n` +
  `<div class="olv-versao olv-versao-en" style="break-before:page;page-break-before:always">${EN}</div>`;

/** Monta e espera que os dados do contrato (variableData) cheguem: o finalizeGeneration lê-os do último render. */
async function montarComDados(contract: Record<string, unknown>) {
  const r = montar(contract);
  await waitFor(() => expect(ofertaGerada.props).not.toBeNull());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
  return r;
}

function montar(contract: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ContractBodyTab contract={contract} />
    </QueryClientProvider>,
  );
}

const editor = () => screen.getByTestId("editor").textContent ?? "";
async function gerar(html: string, idiomas?: unknown) {
  await act(async () => {
    if (idiomas === undefined) await (ofertaGerada.props!.onGenerated as any)(html, "t2", "Minuta X");
    else await (ofertaGerada.props!.onGenerated as any)(html, "t2", "Minuta X", idiomas);
  });
}
const atualizacoesDoContrato = () => atualizacoes.filter((a) => a.tabela === "client_contracts").map((a) => a.payload);

describe("ContractBodyTab: gerar com idiomas", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    document.elementFromPoint = () => null;
  });
  beforeEach(() => {
    atualizacoes.length = 0;
    resolver.mockReset();
    variaveisCustom.lista = [];
    ofertaGerada.props = null;
  });
  afterEach(cleanup);

  it("só português (idiomas [pt]): variáveis substituídas como sempre e a gravação é só a minuta, sem prompt_values", async () => {
    await montarComDados({ id: "c1", status: "draft", contract_body_html: "<p>antigo</p>" });
    await gerar(PT, ["pt"]);
    expect(editor()).toBe("<h2>CONTRATO</h2><p>Cliente ACME, desde 13 de Março de 2026.</p>");
    await waitFor(() => expect(atualizacoesDoContrato()).toHaveLength(1));
    expect(atualizacoesDoContrato()[0]).toStrictEqual({ contract_template_id: "t2" });
  });

  it("chamada antiga, sem o argumento idiomas: igual a [pt]", async () => {
    await montarComDados({ id: "c1", status: "draft", contract_body_html: "<p>antigo</p>" });
    await gerar(PT);
    expect(editor()).toBe("<h2>CONTRATO</h2><p>Cliente ACME, desde 13 de Março de 2026.</p>");
    await waitFor(() => expect(atualizacoesDoContrato()).toHaveLength(1));
    expect(atualizacoesDoContrato()[0]).toStrictEqual({ contract_template_id: "t2" });
  });

  it("português e inglês: as variáveis resolvem-se POR SEGMENTO, com o idioma do wrapper, e o __idiomas fica gravado", async () => {
    await montarComDados({ id: "c1", status: "draft", contract_body_html: "<p>antigo</p>", prompt_values: { nota: "x" } });
    await gerar(COMPOSTO, ["pt", "en"]);
    const texto = editor();
    expect(texto).toContain("desde 13 de Março de 2026.");
    expect(texto).toContain("since 13 March 2026.");
    expect(texto).not.toContain("{{");
    expect(texto.indexOf("olv-versao-pt")).toBeLessThan(texto.indexOf("olv-versao-en"));
    expect(texto).toContain('style="break-before:page;page-break-before:always"');
    await waitFor(() => expect(atualizacoesDoContrato()).toHaveLength(1));
    expect(atualizacoesDoContrato()[0]).toStrictEqual({
      contract_template_id: "t2",
      prompt_values: { nota: "x", __idiomas: "pt+en" },
    });
  });

  it("só inglês: o __idiomas é «en» (e o corpo vem com a data em inglês)", async () => {
    const soEn = `<div class="olv-versao olv-versao-en">${EN}</div>`;
    await montarComDados({ id: "c1", status: "draft", contract_body_html: "<p>antigo</p>" });
    await gerar(soEn, ["en"]);
    expect(editor()).toContain("since 13 March 2026.");
    await waitFor(() => expect(atualizacoesDoContrato()).toHaveLength(1));
    expect(atualizacoesDoContrato()[0]).toStrictEqual({ contract_template_id: "t2", prompt_values: { __idiomas: "en" } });
  });

  it("valores preenchidos pelo utilizador juntam-se ao __idiomas e entram no corpo", async () => {
    variaveisCustom.lista = [{ variable_key: "custom_x", label: "X", description: null, default_value: null, linked_field_key: null }];
    const soEn = `<div class="olv-versao olv-versao-en"><p>Client {{cliente_nome}} {{custom_x}}</p></div>`;
    await montarComDados({ id: "c1", status: "draft", contract_body_html: "<p>antigo</p>" });
    await gerar(soEn, ["en"]);
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "confirmar-valores" })); });
    expect(editor()).toContain("Client ACME VALOR");
    await waitFor(() => expect(atualizacoesDoContrato()).toHaveLength(1));
    expect(atualizacoesDoContrato()[0]).toStrictEqual({
      contract_template_id: "t2",
      prompt_values: { custom_x: "VALOR", __idiomas: "en" },
    });
  });

  it("regenerar só em português um contrato que era «pt+en»: o __idiomas antigo sai (senão o contrato continuava a parecer bilingue)", async () => {
    await montarComDados({ id: "c1", status: "draft", contract_body_html: COMPOSTO, prompt_values: { nota: "x", __idiomas: "pt+en" } });
    await gerar(PT, ["pt"]);
    await waitFor(() => expect(atualizacoesDoContrato()).toHaveLength(1));
    expect(atualizacoesDoContrato()[0]).toStrictEqual({ contract_template_id: "t2", prompt_values: { nota: "x" } });
  });
});

describe("ContractBodyTab: pré-visualização pelas versões do resolver", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    document.elementFromPoint = () => null;
  });
  beforeEach(() => {
    atualizacoes.length = 0;
    resolver.mockReset();
  });
  afterEach(cleanup);

  it("contrato em português sem versões: não passa pelo resolver; o ecrã é o de sempre", async () => {
    montar({ id: "c1", status: "draft", contract_body_html: PT });
    await screen.findByText(/CONTRATO/);
    await act(async () => { await Promise.resolve(); });
    expect(resolver).not.toHaveBeenCalled();
    expect(document.querySelector("section[lang]")).toBeNull();
    await waitFor(() => expect(document.querySelector(".contract-body-content")?.textContent).toContain("Cliente ACME"));
    // o cabeçalho de sempre: sem idioma
    expect(document.body.textContent).toContain("CABECALHO:sem-idioma");
  });

  it("contrato com versões: pede ao resolver (sem congelar) e mostra uma secção por idioma, com etiqueta e cabeçalho no idioma", async () => {
    resolver.mockResolvedValue({
      variableData: { cliente_nome: "ACME" },
      settings: {},
      versoes: [
        { codigo: "pt", bodyHtml: "<h2>CONTRATO</h2><p>Texto PT</p>", settings: { footer_text: "Rodapé PT", show_footer: true } },
        { codigo: "en", bodyHtml: "<h2>SERVICES AGREEMENT</h2><p>Text EN</p>", settings: { footer_text: "Footer EN", show_footer: true } },
      ],
    });
    const contrato = { id: "c1", status: "draft", contract_body_html: COMPOSTO, prompt_values: { __idiomas: "pt+en" } };
    montar(contrato);
    await screen.findByText("Text EN");

    expect(resolver).toHaveBeenCalled();
    const [enviado, org, nome, opcoes] = resolver.mock.calls[0];
    expect(enviado).toMatchObject({ id: "c1", contract_body_html: COMPOSTO });
    expect(org).toBe("org-nike");
    expect(nome).toBe("Nike Teste");
    expect(opcoes).toEqual({ naoCongelar: true });

    const seccoes = Array.from(document.querySelectorAll("section[lang]"));
    expect(seccoes.map((s) => s.getAttribute("lang"))).toEqual(["pt", "en"]);
    expect(seccoes.map((s) => s.querySelector("h3")?.textContent)).toEqual(["Português", "English"]);
    expect(seccoes[0].textContent).toContain("CABECALHO:pt");
    expect(seccoes[1].textContent).toContain("CABECALHO:en");
    expect(seccoes[0].textContent).toContain("Rodapé PT");
    expect(seccoes[1].textContent).toContain("Footer EN");
  });

  it("só inglês (um só idioma não português): mostra a versão em inglês sem etiqueta de idioma", async () => {
    resolver.mockResolvedValue({
      variableData: {},
      settings: {},
      versoes: [{ codigo: "en", bodyHtml: "<p>Only English</p>", settings: {} }],
    });
    montar({ id: "c1", status: "draft", contract_body_html: "<p>Only English</p>", prompt_values: { __idiomas: "en" } });
    await screen.findByText("Only English");
    expect(document.querySelector("section[lang='en']")).not.toBeNull();
    expect(document.querySelector("section[lang] h3")).toBeNull();
  });

  it("o resolver falha ou não devolve documento: cai no ecrã de sempre, o contrato continua visível", async () => {
    resolver.mockRejectedValue(new Error("sem rede"));
    montar({ id: "c1", status: "draft", contract_body_html: COMPOSTO, prompt_values: { __idiomas: "pt+en" } });
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector(".contract-body-content")).not.toBeNull());
    expect(document.querySelector(".contract-body-content")?.textContent).toContain("CONTRATO");
  });
});
