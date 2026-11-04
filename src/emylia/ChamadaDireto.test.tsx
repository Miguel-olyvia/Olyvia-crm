// 4/11: o painel «Chamada em direto» de ponta a ponta, com a nuvem simulada: a chamada de exemplo dá falas, cada fala
// vai à transcrição (Gemini pela função Supabase), no fim os campos são propostos e «Preencher» escreve nos campos do
// negócio por A.campo. Em modo de teste (?teste=1) não há microfone.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Grupo } from "./campos";
import type { Ctx } from "./pecas";
import type { Negocio } from "./motor";

const nuvem = vi.hoisted(() => ({
  falasDeFicheiro: vi.fn(),
  transcreverFala: vi.fn(),
  preencherCampos: vi.fn(),
  ouvirMicrofone: vi.fn(),
  gravarMicrofone: vi.fn(),
}));
vi.mock("./chamadaNuvem", async (importOriginal) => {
  const real = await importOriginal<typeof import("./chamadaNuvem")>();
  return { ...real, ...nuvem };
});
import { ChamadaDireto } from "./ChamadaDireto";

const GRUPOS: Grupo[] = [{ titulo: "Qualificação", campos: [
  { k: "imovel", l: "Tipo de imóvel", t: "escolha", op: ["Apartamento", "Moradia"] },
  { k: "posse", l: "O cliente é", t: "escolha", op: ["Proprietário", "Inquilino"] },
  { k: "orc_cliente", l: "Orçamento", t: "escolha", op: ["Até 3.000 €", "Mais"] },
] }];

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState({}, "", "/negocios?teste=1");
  localStorage.clear();
  nuvem.falasDeFicheiro.mockResolvedValue([
    { pcm: new Float32Array(16000), inicioS: 3 },
    { pcm: new Float32Array(16000), inicioS: 7 },
  ]);
  nuvem.transcreverFala.mockImplementation(async (_pcm: Float32Array, inicioS: number) =>
    inicioS === 3
      ? [{ inicio: 3, fim: 5, texto: "É um apartamento no terceiro andar.", confianca: 0.9, falante: "cliente" }]
      : [{ inicio: 7, fim: 8, texto: "Muito bem.", confianca: 0.9, falante: "comercial" }]);
  nuvem.preencherCampos.mockResolvedValue({
    resumo: "Apartamento, proprietária.", motor: "gemini", fichas: [{ campos: [
      { chave: "imovel", rotulo: "Tipo de imóvel", tipo: "escolha", valor: "apartamento", valor_rotulo: null, confianca: 1, excerto: "Cliente: É um apartamento", estado: "preenchido" },
      { chave: "posse", rotulo: "O cliente é", tipo: "escolha", valor: "Proprietário", valor_rotulo: null, confianca: 0.5, excerto: "Cliente: sim", estado: "rever" },
      { chave: "orc_cliente", rotulo: "Orçamento", tipo: "escolha", valor: null, valor_rotulo: null, confianca: 0, excerto: "", estado: "em_falta" },
    ] }],
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const campo = vi.fn();
const ctx = { A: { campo }, run: (fn: () => void) => fn(), S: {} } as unknown as Ctx;
const d = { id: 7, f: { imovel: "Moradia" } } as unknown as Negocio;

describe("ChamadaDireto (4/11, na nuvem)", () => {
  it("corre a chamada de exemplo: transcreve cada fala, propõe os campos e preenche os vazios", async () => {
    render(<ChamadaDireto ctx={ctx} d={d} grupos={GRUPOS} />);
    expect(screen.getByText(/Registe a sua voz uma vez/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Testar com a chamada de exemplo" })); });
    await waitFor(() => expect(screen.getByText("É um apartamento no terceiro andar.")).toBeInTheDocument());
    expect(screen.getByText("Cliente:")).toBeInTheDocument();
    expect(screen.getByText("Comercial:")).toBeInTheDocument();
    expect(nuvem.transcreverFala).toHaveBeenCalledTimes(2);
    expect(nuvem.transcreverFala.mock.calls[0][2]).toBeNull();  // sem voz registada

    await waitFor(() => expect(screen.getByText(/Apartamento, proprietária\./)).toBeInTheDocument());
    expect(nuvem.preencherCampos).toHaveBeenCalledTimes(1);
    const [segs, grupos] = nuvem.preencherCampos.mock.calls[0];
    expect(segs.map((s: { falante: string }) => s.falante)).toEqual(["cliente", "comercial"]);
    expect(grupos).toBe(GRUPOS);
    // o imóvel já tinha «Moradia»: fica de fora por defeito; a posse entra (a rever)
    expect(screen.getByText("já tinha «Moradia» · fica")).toBeInTheDocument();
    expect(screen.getByText(/a rever · 50%/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Preencher 1 campo$/ }));
    expect(campo).toHaveBeenCalledTimes(1);
    expect(campo).toHaveBeenCalledWith(7, "posse", "Proprietário");
    expect(screen.getByText(/Preenchidos: O cliente é\./)).toBeInTheDocument();
  });

  it("com a voz registada manda a amostra em cada fala", async () => {
    localStorage.setItem("olyvia.chamadas.voz", "UklGRg==");
    render(<ChamadaDireto ctx={ctx} d={d} grupos={GRUPOS} />);
    expect(screen.getByText("Pronto. A sua voz está registada.")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Testar com a chamada de exemplo" })); });
    await waitFor(() => expect(nuvem.transcreverFala).toHaveBeenCalledTimes(2));
    expect(nuvem.transcreverFala.mock.calls[0][2]).toBe("UklGRg==");
  });
});
