// ContractDetailDialog: escolher o idioma ao GERAR um contrato (só com 2 ou mais idiomas na minuta).
// Sem versões, tudo como hoje: nada novo no ecrã e o payload é o de sempre (sem a chave `idiomas`).
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { uid } = vi.hoisted(() => ({ uid: { valor: "u1" as string | null } }));

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "order"]) c[m] = () => c;
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => chain({ data: [], error: null }) },
}));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: vi.fn(async () => uid.valor) }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-nike" } }) }));
vi.mock("@/components/billing/PlanLimitWarning", () => ({ PlanLimitWarning: () => null }));
vi.mock("@/components/pipeline/PipelineBreadcrumb", () => ({ PipelineBreadcrumb: () => null }));
vi.mock("@/components/contracts/ContractBodyTab", () => ({ ContractBodyTab: () => null }));
vi.mock("@/components/shared/DocumentsTab", () => ({ DocumentsTab: () => null }));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ContractDetailDialog } from "../ContractDetailDialog";
import { chavePreferencia } from "../idiomaPreferido";

const PT = "<h2>CONTRATO</h2><p>Cláusula</p>";
const EN = "<h2>SERVICES AGREEMENT</h2><p>Clause</p>";

const SEM_VERSOES = { id: "t1", name: "Minuta simples", body_html: PT, language: "pt", doc_settings: { primary_color: "#112233" } };
const COM_EN = { id: "t2", name: "Minuta bilingue", body_html: PT, language: "pt", doc_settings: { versions: { en: { body_html: EN } } } };
// Uma minuta antiga, de uma lista que ainda não traz language nem doc_settings.
const ANTIGA = { id: "t3", name: "Minuta antiga", body_html: PT };

const PROPOSTA = { id: "p1", name: "Proposta 1" };

function montar(props: Partial<React.ComponentProps<typeof ContractDetailDialog>> = {}) {
  const onSave = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <ContractDetailDialog
          open
          onOpenChange={() => {}}
          contract={null}
          proposals={[PROPOSTA]}
          templates={[SEM_VERSOES, COM_EN, ANTIGA]}
          onSave={onSave}
          saving={false}
          isNew
          getProposalName={(p: any) => p.name}
          getProposalTotal={() => 100}
          formatCurrency={(v: number | null) => String(v)}
          getTranslatedStatus={(s: string) => s}
          {...props}
        />
      </LanguageProvider>
    </QueryClientProvider>,
  );
  return { onSave };
}

async function escolher(trigger: RegExp | string, opcao: string) {
  await act(async () => { fireEvent.click(screen.getByRole("combobox", { name: trigger })); });
  await act(async () => { fireEvent.click(await screen.findByRole("option", { name: opcao })); });
}

const comboProposta = () => screen.getAllByRole("combobox")[0];
const comboTemplate = () => screen.getAllByRole("combobox")[1];
async function escolherCombo(combo: HTMLElement, opcao: string) {
  await act(async () => { fireEvent.click(combo); });
  await act(async () => { fireEvent.click(await screen.findByRole("option", { name: opcao })); });
}
async function criar() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Criar" })); });
}

describe("ContractDetailDialog: idioma ao gerar", () => {
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
    uid.valor = "u1";
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("minuta sem versões (ou antiga, sem language/doc_settings): não aparece seletor e o payload é o de sempre", async () => {
    const { onSave } = montar();
    await escolherCombo(comboProposta(), "Proposta 1 - 100");
    await escolherCombo(comboTemplate(), "Minuta simples");
    expect(screen.queryByRole("radiogroup")).toBeNull();
    await criar();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toStrictEqual({
      proposal_id: "p1", template_id: "t1", start_date: "", end_date: "", notes: "", payment_terms: "",
    });

    cleanup();
    const outra = montar();
    await escolherCombo(comboProposta(), "Proposta 1 - 100");
    await escolherCombo(comboTemplate(), "Minuta antiga");
    expect(screen.queryByRole("radiogroup")).toBeNull();
    await criar();
    expect(outra.onSave.mock.calls[0][0]).toStrictEqual({
      proposal_id: "p1", template_id: "t3", start_date: "", end_date: "", notes: "", payment_terms: "",
    });
  });

  it("minuta com versão inglesa: aparece o seletor, por baixo da minuta, com o português escolhido", async () => {
    montar();
    await escolherCombo(comboProposta(), "Proposta 1 - 100");
    await escolherCombo(comboTemplate(), "Minuta bilingue");
    const grupo = await screen.findByRole("radiogroup");
    expect(grupo).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Português" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "English" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("radio", { name: "Português + English" })).toBeTruthy();
    // por baixo do campo da minuta
    const minuta = screen.getByText("Template");
    expect(minuta.compareDocumentPosition(grupo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("só português escolhido (a omissão): o payload é IGUAL ao de uma minuta sem versões, sem a chave idiomas", async () => {
    const { onSave } = montar();
    await escolherCombo(comboProposta(), "Proposta 1 - 100");
    await escolherCombo(comboTemplate(), "Minuta bilingue");
    await screen.findByRole("radiogroup");
    await criar();
    expect(onSave.mock.calls[0][0]).toStrictEqual({
      proposal_id: "p1", template_id: "t2", start_date: "", end_date: "", notes: "", payment_terms: "",
    });
  });

  it("English: o payload leva idiomas = [en]", async () => {
    const { onSave } = montar();
    await escolherCombo(comboProposta(), "Proposta 1 - 100");
    await escolherCombo(comboTemplate(), "Minuta bilingue");
    await act(async () => { fireEvent.click(await screen.findByRole("radio", { name: "English" })); });
    await criar();
    expect(onSave.mock.calls[0][0]).toMatchObject({ template_id: "t2", idiomas: ["en"] });
  });

  it("Português + English: idiomas = [pt, en], e fica guardado como preferência desta minuta e deste utilizador", async () => {
    const { onSave } = montar();
    await escolherCombo(comboProposta(), "Proposta 1 - 100");
    await escolherCombo(comboTemplate(), "Minuta bilingue");
    await act(async () => { fireEvent.click(await screen.findByRole("radio", { name: "Português + English" })); });
    await criar();
    expect(onSave.mock.calls[0][0]).toMatchObject({ template_id: "t2", idiomas: ["pt", "en"] });
    await waitFor(() => expect(window.localStorage.getItem(chavePreferencia("u1", "t2"))).toBe("pt+en"));
  });

  it("pré-seleciona o último idioma usado por este utilizador com esta minuta", async () => {
    window.localStorage.setItem(chavePreferencia("u1", "t2"), "en");
    window.localStorage.setItem(chavePreferencia("outro", "t2"), "pt+en");
    montar();
    await escolherCombo(comboProposta(), "Proposta 1 - 100");
    await escolherCombo(comboTemplate(), "Minuta bilingue");
    await waitFor(() => expect(screen.getByRole("radio", { name: "English" }).getAttribute("aria-checked")).toBe("true"));
  });

  it("a mudança de minuta para uma sem versões deixa de enviar idiomas", async () => {
    const { onSave } = montar();
    await escolherCombo(comboProposta(), "Proposta 1 - 100");
    await escolherCombo(comboTemplate(), "Minuta bilingue");
    await act(async () => { fireEvent.click(await screen.findByRole("radio", { name: "English" })); });
    await escolherCombo(comboTemplate(), "Minuta simples");
    expect(screen.queryByRole("radiogroup")).toBeNull();
    await criar();
    expect(onSave.mock.calls[0][0]).not.toHaveProperty("idiomas");
  });

  it("contrato já criado (edição): não há seletor, o corpo gerado não se refaz por aqui", async () => {
    montar({
      isNew: false,
      contract: { id: "c1", status: "draft", proposal_id: "p1", contract_template_id: "t2", contract_body_html: PT },
    });
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});
