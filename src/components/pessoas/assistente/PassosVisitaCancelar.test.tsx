// Os cartões de visita do assistente têm «Cancelar visita», com a ação e a confirmação que já existem (ConfirmarCancelarVisita): só numa visita
// marcada e sem resultado, só com permissão, e o erro fica dentro do diálogo.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { CorpoVisitas } from "./PassosVisita";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
const { sucesso } = vi.hoisted(() => ({ sucesso: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: sucesso } }));

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); sucesso.mockReset(); });

const visita = (id: string, extra: Partial<VisitaPessoa> = {}): VisitaPessoa => ({
  id, data: "2026-10-20", hora: "10:30", feitoPor: "Rita Gomes", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "casal", duracao: "h1m30",
  morada: { rua: "", codigoPostal: "", localidade: "", andar: "" }, igualALead: null, nota: "", pessoaId: "p1", negocioId: "n1", ...extra,
});

function montar(visitas: VisitaPessoa[], aoCancelar?: (id: string) => Promise<void>) {
  render(<CorpoVisitas visitas={visitas} aoMarcarOutra={vi.fn()} podeMarcar nomePessoa="Ana Lopes" aoCancelar={aoCancelar} />);
}

describe("«Cancelar visita» no cartão da visita", () => {
  it("uma visita marcada tem o botão e cancelar pede confirmação, diz a pessoa e chama a ação que já existe com o id da visita", async () => {
    const aoCancelar = vi.fn().mockResolvedValue(undefined);
    montar([visita("v1")], aoCancelar);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar visita" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText(/Ana Lopes/)).toBeInTheDocument();
    expect(aoCancelar).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar a visita" }));
    await waitFor(() => expect(aoCancelar).toHaveBeenCalledWith("v1"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("«Voltar» fecha o diálogo sem cancelar", async () => {
    const aoCancelar = vi.fn().mockResolvedValue(undefined);
    montar([visita("v1")], aoCancelar);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar visita" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(aoCancelar).not.toHaveBeenCalled();
  });

  it("se a base falha, o erro fica dentro do diálogo e a visita não se dá por cancelada", async () => {
    const aoCancelar = vi.fn().mockRejectedValue(new Error("falhou"));
    montar([visita("v1")], aoCancelar);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar visita" }));
    const dialogo = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar a visita" }));
    expect(await within(dialogo).findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("não há botão numa visita feita, cancelada ou com resultado", () => {
    montar([visita("v1", { estado: "feita" }), visita("v2", { estado: "cancelada" }), visita("v3", { resultado: "interessado" } as Partial<VisitaPessoa>)], vi.fn());
    for (const cartao of screen.getAllByRole("button", { expanded: false })) fireEvent.click(cartao);
    expect(screen.queryByRole("button", { name: "Cancelar visita" })).toBeNull();
  });

  it("sem permissão (sem a ação) não há «Cancelar visita»", () => {
    montar([visita("v1")], undefined);
    expect(screen.queryByRole("button", { name: "Cancelar visita" })).toBeNull();
  });
});
