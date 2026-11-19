// GenerateFromTemplateDialog: o seletor de idioma no passo de pré-visualização.
// Minuta sem versões / só português: o mesmo pipeline de sempre (mesmas chamadas, mesmos argumentos, mesmo html).
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { uid, aplicarItens, injetarSignatario } = vi.hoisted(() => ({
  uid: { valor: "u1" as string | null },
  aplicarItens: vi.fn(),
  injetarSignatario: vi.fn(),
}));

vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: vi.fn(async () => uid.valor) }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/contracts/contractDocument", () => ({
  gatherContractData: vi.fn(async () => ({ cliente_nome: "ACME" })),
  fetchTemplateSignatory: vi.fn(async () => ({ name: "Ana Silva", roleName: "Gerente" })),
  applyQuoteItemsToken: (...args: unknown[]) => aplicarItens(...args),
  injectSignatoryIntoSignatureBlock: (...args: unknown[]) => injetarSignatario(...args),
}));

import { LanguageProvider } from "@/contexts/LanguageContext";
import { GenerateFromTemplateDialog } from "../GenerateFromTemplateDialog";
import { chavePreferencia } from "../idiomaPreferido";

const PT = "<h2>CONTRATO</h2><p>Cliente {{cliente_nome}}.</p>";
const EN = "<h2>SERVICES AGREEMENT</h2><p>Client {{cliente_nome}}.</p>";

const SEM_VERSOES = { id: "t1", name: "Minuta simples", body_html: PT, doc_settings: { primary_color: "#112233" }, is_default: false };
const COM_EN = { id: "t2", name: "Minuta bilingue", body_html: PT, language: "pt", doc_settings: { primary_color: "#445566", versions: { en: { body_html: EN } } }, is_default: false };

function montar(templates = [SEM_VERSOES, COM_EN]) {
  const onGenerated = vi.fn();
  render(
    <MemoryRouter>
      <LanguageProvider>
        <GenerateFromTemplateDialog
          open
          onOpenChange={() => {}}
          templates={templates as any}
          contract={{ id: "c1", entity_id: "e1" }}
          orgId="org-nike"
          hasExistingBody={false}
          onGenerated={onGenerated}
        />
      </LanguageProvider>
    </MemoryRouter>,
  );
  return { onGenerated };
}

async function escolherMinuta(nome: string) {
  await act(async () => { fireEvent.click(screen.getByText(nome)); });
  await screen.findByRole("button", { name: /Confirmar e gerar/ });
}
async function confirmar() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Confirmar e gerar/ })); });
}

describe("GenerateFromTemplateDialog: idioma", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    document.elementFromPoint = () => null;
    Element.prototype.scrollIntoView = () => {};
  });
  beforeEach(() => {
    window.localStorage.clear();
    uid.valor = "u1";
    aplicarItens.mockReset();
    injetarSignatario.mockReset();
    aplicarItens.mockImplementation((html: string, _vd: unknown, _s: unknown, _c: unknown, auto?: boolean, idioma?: string) => `${html}<!--itens:${idioma ?? "pt"}:${auto ?? "omissao"}-->`);
    injetarSignatario.mockImplementation((html: string, _n: unknown, _r: unknown, idioma?: string) => `${html}<!--assin:${idioma ?? "pt"}-->`);
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("minuta sem versões: sem seletor, mesmas chamadas (mesma aridade) e mesmo html; idiomas = [pt]", async () => {
    const { onGenerated } = montar();
    await escolherMinuta("Minuta simples");
    expect(screen.queryByRole("radiogroup")).toBeNull();

    expect(aplicarItens).toHaveBeenCalledTimes(1);
    expect(aplicarItens.mock.calls[0]).toEqual([PT, { cliente_nome: "ACME" }, { primary_color: "#112233" }, "#112233"]);
    expect(injetarSignatario).toHaveBeenCalledTimes(1);
    expect(injetarSignatario.mock.calls[0]).toEqual([`${PT}<!--itens:pt:omissao-->`, "Ana Silva", "Gerente"]);

    await confirmar();
    expect(onGenerated).toHaveBeenCalledTimes(1);
    expect(onGenerated).toHaveBeenCalledWith(`${PT}<!--itens:pt:omissao--><!--assin:pt-->`, "t1", "Minuta simples", ["pt"]);
  });

  it("minuta sem versões: a pré-visualização é o corpo de sempre (sem secções por idioma)", async () => {
    montar();
    await escolherMinuta("Minuta simples");
    expect(screen.getByText("CONTRATO")).toBeTruthy();
    expect(document.querySelector("section[lang]")).toBeNull();
    expect(document.querySelector(".prose")?.textContent).toContain("ACME");
  });

  it("minuta com inglês: o seletor aparece no passo de pré-visualização, em português por omissão", async () => {
    const { onGenerated } = montar();
    await escolherMinuta("Minuta bilingue");
    expect(screen.getByRole("radio", { name: "Português" }).getAttribute("aria-checked")).toBe("true");
    // Só português: igual à minuta sem versões (mesma aridade, nada de idioma).
    expect(aplicarItens.mock.calls[0]).toEqual([PT, { cliente_nome: "ACME" }, { primary_color: "#445566", versions: { en: { body_html: EN } } }, "#445566"]);
    await confirmar();
    expect(onGenerated).toHaveBeenCalledWith(`${PT}<!--itens:pt:omissao--><!--assin:pt-->`, "t2", "Minuta bilingue", ["pt"]);
  });

  it("escolher English: a pré-visualização passa a inglês e o que se gera é só a versão inglesa", async () => {
    const { onGenerated } = montar();
    await escolherMinuta("Minuta bilingue");
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: "English" })); });

    expect(await screen.findByText("SERVICES AGREEMENT")).toBeTruthy();
    expect(screen.queryByText("CONTRATO")).toBeNull();
    expect(document.querySelector("section[lang='en']")).not.toBeNull();

    await confirmar();
    const [html, id, nome, idiomas] = onGenerated.mock.calls[0];
    expect(id).toBe("t2");
    expect(nome).toBe("Minuta bilingue");
    expect(idiomas).toEqual(["en"]);
    expect(html).toContain('class="olv-versao olv-versao-en"');
    expect(html).toContain("SERVICES AGREEMENT");
    expect(html).not.toContain("CONTRATO");
    expect(html).toContain("<!--itens:en:true-->");
    expect(html).toContain("<!--assin:en-->");
    // Nada de substituição de variáveis no que se entrega: continua com os tokens para o ContractBodyTab os resolver.
    expect(html).toContain("{{cliente_nome}}");
  });

  it("Português + English: duas secções, português primeiro, cada uma com o seu título; só a última recebe a tabela", async () => {
    const { onGenerated } = montar();
    await escolherMinuta("Minuta bilingue");
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: "Português + English" })); });

    await screen.findByText("SERVICES AGREEMENT");
    const seccoes = Array.from(document.querySelectorAll("section[lang]"));
    expect(seccoes.map((s) => s.getAttribute("lang"))).toEqual(["pt", "en"]);
    expect(seccoes.map((s) => s.querySelector("h3")?.textContent)).toEqual(["Português", "English"]);
    expect(seccoes[0].textContent).toContain("Cliente");
    expect(seccoes[1].textContent).toContain("Client");

    await confirmar();
    const [html, , , idiomas] = onGenerated.mock.calls[0];
    expect(idiomas).toEqual(["pt", "en"]);
    expect(html.indexOf("olv-versao-pt")).toBeLessThan(html.indexOf("olv-versao-en"));
    const chamadasItens = aplicarItens.mock.calls.filter((c) => typeof c[5] === "string");
    expect(chamadasItens.map((c) => [c[5], c[4]])).toEqual(expect.arrayContaining([["pt", false], ["en", true]]));
    // A assinatura procura-se no idioma da última versão, onde ficou a assinatura única.
    const ultimaInjecao = injetarSignatario.mock.calls[injetarSignatario.mock.calls.length - 1];
    expect(ultimaInjecao[3]).toBe("en");
  });

  it("pré-seleciona o último idioma usado por este utilizador com esta minuta", async () => {
    window.localStorage.setItem(chavePreferencia("u1", "t2"), "pt+en");
    const { onGenerated } = montar();
    await act(async () => { await Promise.resolve(); });
    await escolherMinuta("Minuta bilingue");
    await waitFor(() => expect(screen.getByRole("radio", { name: "Português + English" }).getAttribute("aria-checked")).toBe("true"));
    await confirmar();
    expect(onGenerated.mock.calls[0][3]).toEqual(["pt", "en"]);
  });

  it("voltar e escolher outra minuta sem versões: já não há seletor nem idiomas a mais", async () => {
    const { onGenerated } = montar();
    await escolherMinuta("Minuta bilingue");
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: "English" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Escolher outra" })); });
    await escolherMinuta("Minuta simples");
    expect(screen.queryByRole("radiogroup")).toBeNull();
    await confirmar();
    expect(onGenerated.mock.calls[0][3]).toEqual(["pt"]);
    expect(onGenerated.mock.calls[0][0]).not.toContain("olv-versao");
  });
});
