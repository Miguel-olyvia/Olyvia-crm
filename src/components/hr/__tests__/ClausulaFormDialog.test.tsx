/**
 * `ClausulaFormDialog`: dialogo partilhado de criar/editar clausula de RH
 * (extraido do antigo ecra de clausulas). O hook e mockado -- a escrita ja tem
 * o proprio teste.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "pt" }),
}));

const criar = vi.fn(async (_: unknown) => {});
const editar = vi.fn(async (_: unknown) => {});
vi.mock("@/hooks/useClausulasDocumentosRH", () => ({
  useClausulasDocumentosRH: () => ({ isSaving: false, criar, editar }),
}));

const CLAUSULA = {
  id: "c1",
  organization_id: "org-nike",
  nome: "Confidencialidade",
  categoria: "rgpd",
  corpo_html: "<p>Ola</p>",
  activo: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

async function renderDialogo(props: Record<string, unknown>) {
  const { ClausulaFormDialog } = await import("../ClausulaFormDialog");
  const onFechar = vi.fn();
  render(<ClausulaFormDialog aberto clausula={null} onFechar={onFechar} {...props} />);
  return { onFechar };
}

function escreverCorpo(html: string) {
  const editor = document.querySelector('[contenteditable="true"]') as HTMLElement;
  fireEvent.input(editor, { target: { innerHTML: html } });
}

describe("ClausulaFormDialog", () => {
  beforeEach(() => {
    criar.mockClear();
    editar.mockClear();
  });

  it("mostra sempre o aviso de que editar nao altera modelos ja colados", async () => {
    await renderDialogo({});
    expect(screen.getByText(/não actualiza os modelos onde já foi colada/)).toBeTruthy();
  });

  it("cria com categoria null quando o campo fica vazio e fecha", async () => {
    const { onFechar } = await renderDialogo({});
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Nova" } });
    escreverCorpo("<p>Texto</p>");

    const botoes = screen.getAllByRole("button", { name: "Nova cláusula" });
    fireEvent.click(botoes[botoes.length - 1]);

    await waitFor(() => expect(onFechar).toHaveBeenCalled());
    expect(criar).toHaveBeenCalledWith(expect.objectContaining({ nome: "Nova", categoria: null }));
  });

  it("pre-preenche o corpo com o texto seleccionado (corpoInicial)", async () => {
    await renderDialogo({ corpoInicial: "<p>Seleccionado</p>" });
    const editor = document.querySelector('[contenteditable="true"]') as HTMLElement;
    expect(editor.innerHTML).toContain("Seleccionado");
  });

  it("em edicao pre-preenche e chama editar com o id", async () => {
    await renderDialogo({ clausula: CLAUSULA });
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Confidencialidade");
    expect((screen.getByLabelText("Categoria") as HTMLInputElement).value).toBe("rgpd");

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Outra" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(editar).toHaveBeenCalled());
    expect(editar).toHaveBeenCalledWith(expect.objectContaining({ id: "c1", nome: "Outra" }));
  });

  it("nao submete sem nome", async () => {
    await renderDialogo({});
    escreverCorpo("<p>Texto</p>");
    const botoes = screen.getAllByRole("button", { name: "Nova cláusula" });
    expect((botoes[botoes.length - 1] as HTMLButtonElement).disabled).toBe(true);
    expect(criar).not.toHaveBeenCalled();
  });
});
