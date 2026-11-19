// Diálogo de importação do catálogo: passos, avisos, contagens e listas no idioma do portal.
// As mensagens por linha que vêm do servidor (row.errors[]) ficam como chegam (em português).
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const spCatalogImport = vi.fn();
const downloadModelo = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/supplierPortal/spRpc", async (original) => ({
  ...(await original<typeof import("@/lib/supplierPortal/spRpc")>()),
  spCatalogImport: (...a: unknown[]) => spCatalogImport(...a),
}));
vi.mock("@/utils/supplierPortalCatalogTemplate", async (original) => ({
  ...(await original<typeof import("@/utils/supplierPortalCatalogTemplate")>()),
  downloadSupplierCatalogTemplate: (...a: unknown[]) => downloadModelo(...a),
}));

import { SupplierCatalogImportDialog } from "../SupplierCatalogImportDialog";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";
import { traduzir } from "@/portal-i18n/traduzir";

function montar() {
  const onImported = vi.fn();
  render(<SupplierCatalogImportDialog open onOpenChange={vi.fn()} onImported={onImported} onNoAccess={vi.fn()} />);
  return { onImported };
}

function csv(conteudo: string, nome = "catalogo.csv"): File {
  const bytes = new TextEncoder().encode(conteudo);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return { name: nome, size: bytes.byteLength, arrayBuffer: async () => buffer } as unknown as File;
}

async function escolher(ficheiro: File) {
  const input = document.getElementById("sp-import-file") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [ficheiro] } });
}

const RESULTADO = {
  dry_run: true,
  import_id: null,
  total: 3,
  new: 1,
  changed: 1,
  unchanged: 0,
  errors: 1,
  rows: [
    { row: 2, status: "new", supplier_ref: "A1", name: "Novo", changes: null, errors: null },
    { row: 3, status: "changed", supplier_ref: "B2", name: "Mudou", changes: { base_price: { old: 1500.5, new: 2 }, is_active: { old: true, new: false }, brand: { old: null, new: "Acme" } }, errors: null },
    { row: 4, status: "error", supplier_ref: null, name: null, changes: null, errors: ["Referência obrigatória"] },
  ],
};

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
  spCatalogImport.mockReset();
  downloadModelo.mockReset();
});

describe("importar em português (como sempre)", () => {
  it("primeiro passo", () => {
    montar();
    expect(screen.getByRole("heading", { name: "Importar catálogo" })).toBeInTheDocument();
    expect(screen.getByText("Escolha um ficheiro Excel (.xlsx, .xls) ou CSV com os seus artigos.")).toBeInTheDocument();
    expect(screen.getByText("Toque para escolher o ficheiro")).toBeInTheDocument();
    expect(screen.getByText(".xlsx, .xls ou .csv · até 5000 linhas · máx. 10 MB")).toBeInTheDocument();
    expect(screen.getByText("Não tem um ficheiro preparado?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descarregar modelo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("mapeamento, pré-visualização e gravação", async () => {
    spCatalogImport.mockResolvedValueOnce(RESULTADO);
    montar();
    await escolher(csv("Ref.;Nome;Preço\nA1;Novo;1,5\n"));
    expect(await screen.findByText("1 linha(s) de artigos", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Indique o que contém cada coluna do ficheiro.")).toBeInTheDocument();
    expect(screen.getByText("ex.: A1")).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: "Ref. (obrigatória)" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("option", { name: "Ignorar esta coluna" }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Uma coluna presente com a célula vazia apaga esse valor no artigo \(exceto Nome e Ativo\)\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));
    expect(await screen.findByText("Confira o que vai mudar antes de gravar. Nada foi gravado ainda.")).toBeInTheDocument();
    expect(screen.getByText("Novos")).toBeInTheDocument();
    expect(screen.getByText("Com erro")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Erros (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gravar 2 linha(s) válida(s)" })).toBeInTheDocument();
    expect(screen.getByText("Referência obrigatória")).toBeInTheDocument();
    expect(screen.getByText("Linha 4")).toBeInTheDocument();
    expect(screen.getByText("(sem referência)")).toBeInTheDocument();
  });

  it("sem coluna de referência: aviso de sempre", async () => {
    montar();
    await escolher(csv("Nome;Preço\nA;1\n"));
    expect(await screen.findByText("Escolha a coluna da referência (Ref.) — é obrigatória.")).toBeInTheDocument();
  });
});

describe("importar em inglês", () => {
  beforeEach(() => definirIdioma("en"));

  it("primeiro passo, sem português", () => {
    montar();
    expect(screen.getByRole("heading", { name: "Import catalogue" })).toBeInTheDocument();
    expect(screen.getByText("Choose an Excel (.xlsx, .xls) or CSV file with your items.")).toBeInTheDocument();
    expect(screen.getByText("Tap to choose a file")).toBeInTheDocument();
    expect(screen.getByText(".xlsx, .xls or .csv · up to 5000 rows · max. 10 MB")).toBeInTheDocument();
    expect(screen.getByText("Don't have a file ready?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Importar|Escolha|ficheiro|Cancelar|Descarregar/);
  });

  it("o modelo recebe o idioma", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Download template" }));
    expect(downloadModelo).toHaveBeenCalledWith("en");
  });

  it("mapeamento em inglês, com cabeçalhos ingleses reconhecidos", async () => {
    montar();
    await escolher(csv("Supplier ref.,Name,Price,Active\nA1,Thing,1.5,yes\n"));
    expect(await screen.findByText("Tell us what each column of the file contains.")).toBeInTheDocument();
    expect(screen.getByText("1 item row", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("e.g. A1")).toBeInTheDocument();
    const select = document.getElementById("sp-map-0") as HTMLSelectElement;
    expect(select.value).toBe("supplier_ref");
    expect((document.getElementById("sp-map-1") as HTMLSelectElement).value).toBe("name");
    expect((document.getElementById("sp-map-2") as HTMLSelectElement).value).toBe("base_price");
    expect((document.getElementById("sp-map-3") as HTMLSelectElement).value).toBe("is_active");
    expect(within(select).getByRole("option", { name: "Supplier ref. (required)" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Ignore this column" })).toBeInTheDocument();
    expect(screen.getByText(/A column that is present with an empty cell clears that value on the item \(except Name and Active\)\./)).toBeInTheDocument();
  });

  it("sem referência e sem nome: avisos em inglês", async () => {
    montar();
    await escolher(csv("Price\n1\n"));
    expect(await screen.findByText("Choose the reference column (Supplier ref.) — it is required.")).toBeInTheDocument();
  });

  it("sem coluna de nome", async () => {
    montar();
    await escolher(csv("Ref.;Price\nA;1\n"));
    expect(await screen.findByText("There is no Name column: you will only be able to update items that already exist.")).toBeInTheDocument();
  });

  it("ficheiro ilegível: erro em inglês", async () => {
    montar();
    await escolher(csv("", "vazio.csv"));
    expect(await screen.findByRole("alert")).toHaveTextContent("The file is empty.");
  });

  it("pré-visualização e gravação: contagens, separadores, valores e botões em inglês", async () => {
    spCatalogImport.mockResolvedValueOnce(RESULTADO).mockResolvedValueOnce({ ...RESULTADO, dry_run: false });
    const { onImported } = montar();
    await escolher(csv("Ref.;Name\nA1;Novo\n"));
    fireEvent.click(await screen.findByRole("button", { name: "Preview" }));
    expect(await screen.findByText("Check what will change before saving. Nothing has been saved yet.")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("Changed")).toBeInTheDocument();
    expect(screen.getByText("Unchanged")).toBeInTheDocument();
    expect(screen.getByText("With errors")).toBeInTheDocument();
    // com erros, o separador inicial é o dos erros: a linha vem do servidor, em português, tal como chega
    expect(screen.getByRole("tab", { name: "Errors (1)" })).toBeInTheDocument();
    expect(screen.getByText("Row 4")).toBeInTheDocument();
    expect(screen.getByText("(no reference)")).toBeInTheDocument();
    expect(screen.getByText("Referência obrigatória")).toBeInTheDocument();
    expect(screen.getByText("Rows with errors are skipped. You can fix them in the file and import again later.")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Changed (1)" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("tab", { name: "Changed (1)" }));
    expect(await screen.findByText("Price")).toBeInTheDocument();
    expect(screen.getByText(/1500,5 → 2/)).toBeInTheDocument();
    expect(screen.getByText(/yes → no/)).toBeInTheDocument();
    expect(screen.getByText(/\(empty\) → Acme/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save 2 valid rows" }));
    expect(await screen.findByText("Saved: 1 new and 1 changed. 1 row with errors was skipped.")).toBeInTheDocument();
    await waitFor(() => expect(onImported).toHaveBeenCalled());
    // o «Close» do X do diálogo é texto fixo em inglês do componente partilhado ui/dialog: o botão do rodapé é o que é nosso
    expect(screen.getAllByRole("button", { name: "Close" }).length).toBeGreaterThanOrEqual(1);
  });
});

describe("R3: o erro visível acompanha o idioma quando este muda", () => {
  it("ficheiro com formato inválido: pt -> en -> pt", async () => {
    montar();
    await escolher(csv("x", "catalogo.txt"));
    const pt = traduzir("pt", "sp.importar.erro.formato");
    const en = traduzir("en", "sp.importar.erro.formato");
    expect(pt).not.toBe(en);
    expect(await screen.findByText(pt)).toBeInTheDocument();
    act(() => definirIdioma("en"));
    expect(await screen.findByText(en)).toBeInTheDocument();
    expect(screen.queryByText(pt)).toBeNull();
    act(() => definirIdioma("pt"));
    expect(await screen.findByText(pt)).toBeInTheDocument();
  });

  it("ficheiro com demasiadas linhas: o número entra na mensagem dos dois idiomas", async () => {
    montar();
    const muitas = `Ref.;Nome\n${Array.from({ length: 5001 }, (_, i) => `R${i};N`).join("\n")}\n`;
    await escolher(csv(muitas));
    const pt = traduzir("pt", "sp.importar.erro.demasiadasLinhas", { max: 5000 });
    expect(await screen.findByText(pt)).toBeInTheDocument();
    act(() => definirIdioma("en"));
    expect(await screen.findByText(traduzir("en", "sp.importar.erro.demasiadasLinhas", { max: 5000 }))).toBeInTheDocument();
  });

  it("erro do servidor (RPC) com mensagem própria fica como veio, também ao mudar de idioma", async () => {
    const { SupplierPortalRpcError } = await import("@/lib/supplierPortal/spRpc");
    montar();
    spCatalogImport.mockRejectedValueOnce(new SupplierPortalRpcError({ message: "Falha do servidor", hint: "validation" }));
    await escolher(csv("Ref.;Nome\nA1;Novo\n"));
    fireEvent.click(await screen.findByRole("button", { name: "Pré-visualizar" }));
    expect(await screen.findByText("Falha do servidor")).toBeInTheDocument();
    act(() => definirIdioma("en"));
    await screen.findByRole("button", { name: "Preview" });
    expect(screen.getByText("Falha do servidor")).toBeInTheDocument();
  });
});
