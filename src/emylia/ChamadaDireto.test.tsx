// 4/11: o painel «Chamada em direto» de ponta a ponta, com a nuvem simulada: a chamada de exemplo dá falas, cada fala
// vai à transcrição (Gemini pela função Supabase), no fim os campos são propostos com caixa e valor editável, e
// «Preencher» escreve nos campos do negócio por A.campo. Em modo de teste (?teste=1) não há microfone.
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

const extracao = {
  resumo: "Apartamento, proprietária.", motor: "gemini", fichas: [{ campos: [
    { chave: "imovel", rotulo: "Tipo de imóvel", tipo: "escolha", valor: "apartamento", valor_rotulo: null, confianca: 1, excerto: "Cliente: É um apartamento", estado: "preenchido" },
    { chave: "posse", rotulo: "O cliente é", tipo: "escolha", valor: "Proprietário", valor_rotulo: null, confianca: 0.5, excerto: "Cliente: sim", estado: "rever" },
    { chave: "orc_cliente", rotulo: "Orçamento", tipo: "escolha", valor: null, valor_rotulo: null, confianca: 0, excerto: "", estado: "em_falta" },
    { chave: "visita_dia", rotulo: "Visita: dia combinado", tipo: "data", valor: "2026-11-10", valor_rotulo: null, confianca: 1, excerto: "Comercial: Dia 10, pode ser às 11?", estado: "preenchido" },
    { chave: "visita_hora", rotulo: "Visita: hora combinada", tipo: "texto", valor: "11:00", valor_rotulo: null, confianca: 1, excerto: "Comercial: Dia 10, pode ser às 11?", estado: "preenchido" },
    { chave: "tipo_servico", rotulo: "Tipo de serviço", tipo: "escolha", valor: "Casa de banho", valor_rotulo: null, confianca: 1, excerto: "Cliente: a casa de banho", estado: "preenchido" },
    { chave: "servicos_catalogo", rotulo: "Serviços do Catálogo", tipo: "varios", valor: "canalização, pintura das paredes", valor_rotulo: null, confianca: 0.8, excerto: "Cliente: canalização e pintar", estado: "preenchido" },
  ] }],
};

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
  nuvem.preencherCampos.mockResolvedValue(extracao);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const campo = vi.fn();
const servicoDaChamada = vi.fn();
const servicosDoPedido = vi.fn();
const ctx = { A: { campo, servicoDaChamada, servicosDoPedido }, run: (fn: () => void) => fn(),
  S: { svc: { s1: { n: "Canalização" }, s2: { n: "Pintura" } } } } as unknown as Ctx;
const d = { id: 7, f: { imovel: "Moradia" }, linhaPorDefinir: true, linha: "wc" } as unknown as Negocio;

async function correrExemplo() {
  render(<ChamadaDireto ctx={ctx} d={d} grupos={GRUPOS} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Testar com a chamada de exemplo" })); });
  await waitFor(() => expect(screen.getByText(/Apartamento, proprietária\./)).toBeInTheDocument());
}

describe("ChamadaDireto (4/11, na nuvem)", () => {
  it("corre a chamada de exemplo: transcreve cada fala e manda os campos do negócio mais a visita combinada", async () => {
    await correrExemplo();
    expect(screen.getByText("É um apartamento no terceiro andar.")).toBeInTheDocument();
    expect(screen.getByText("Cliente:")).toBeInTheDocument();
    expect(nuvem.transcreverFala).toHaveBeenCalledTimes(2);
    expect(nuvem.transcreverFala.mock.calls[0][2]).toBeNull();  // sem voz registada
    const [segs, grupos] = nuvem.preencherCampos.mock.calls[0];
    expect(segs.map((s: { falante: string }) => s.falante)).toEqual(["cliente", "comercial"]);
    expect(grupos.map((g: Grupo) => g.titulo)).toEqual(["Qualificação", "Serviço", "Da chamada"]);
    const servico = grupos.find((g: Grupo) => g.titulo === "Serviço")!;
    expect(servico.campos[0].op).toEqual(["Casa de banho", "Cozinha", "Remodelação geral"]);
    expect(servico.campos[1].op).toEqual(["Canalização", "Pintura"]);
  });

  it("as propostas têm caixa por linha: os campos vazios entram, os já preenchidos ficam de fora, e o valor é editável", async () => {
    await correrExemplo();
    // o imóvel já tinha «Moradia»: a caixa vem desmarcada; posse e visita vêm marcadas
    const caixaImovel = screen.getByRole("checkbox", { name: "Tipo de imóvel" });
    expect(caixaImovel).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("já tinha «Moradia»")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "O cliente é" })).toHaveAttribute("aria-checked", "true");
    // «Desmarcar todos» e «Marcar todos»
    fireEvent.click(screen.getByRole("button", { name: "Desmarcar todos" }));
    expect(screen.getByRole("button", { name: /Preencher 0 campos$/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Marcar todos" }));
    expect(screen.getByRole("button", { name: /Preencher 6 campos$/ })).toBeInTheDocument();
    fireEvent.click(caixaImovel);
    expect(screen.getByRole("button", { name: /Preencher 5 campos$/ })).toBeInTheDocument();
    // corrigir a posse no seletor e marcar o imóvel
    fireEvent.change(screen.getByRole("combobox", { name: "O cliente é" }), { target: { value: "Inquilino" } });
    fireEvent.click(caixaImovel);
    expect(screen.getByRole("button", { name: /Preencher 6 campos$/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Preencher 6 campos$/ }));
    expect(campo).toHaveBeenCalledWith(7, "imovel", "Apartamento");
    expect(campo).toHaveBeenCalledWith(7, "posse", "Inquilino");
    expect(campo).toHaveBeenCalledWith(7, "visita_dia", "2026-11-10");
    expect(campo).toHaveBeenCalledWith(7, "visita_hora", "11:00");
    expect(campo).toHaveBeenCalledTimes(4);
    // o tipo de serviço e os serviços do Catálogo vão pelas ações próprias (só os nomes que existem no Catálogo)
    expect(servicoDaChamada).toHaveBeenCalledWith(7, "wc");
    expect(servicosDoPedido).toHaveBeenCalledWith(7, ["s1", "s2"]);
    expect(screen.getByText(/Preenchidos: Tipo de imóvel, O cliente é, Tipo de serviço, Serviços do Catálogo, Visita: dia combinado, Visita: hora combinada\./)).toBeInTheDocument();
  });

  it("no fim, quem fala passa a ser o revisto pelo sentido da conversa (5/11: o cliente vinha como «Comercial»)", async () => {
    nuvem.preencherCampos.mockResolvedValueOnce({ ...extracao, falantes: ["cliente", "cliente"] });
    await correrExemplo();
    expect(screen.queryByText("Comercial:")).toBeNull();
    expect(screen.getAllByText("Cliente:")).toHaveLength(2);
    expect(screen.getByText(/Quem fala foi corrigido em 1 linha, pelo sentido da conversa\./)).toBeInTheDocument();
  });

  it("se a revisão não trouxer uma entrada por linha, ficam as etiquetas da comparação de vozes", async () => {
    nuvem.preencherCampos.mockResolvedValueOnce({ ...extracao, falantes: ["cliente"] });
    await correrExemplo();
    expect(screen.getByText("Comercial:")).toBeInTheDocument();
  });

  it("com a voz registada manda a amostra e o que ela diz em cada fala", async () => {
    localStorage.setItem("olyvia.chamadas.voz", "UklGRg==");
    localStorage.setItem("olyvia.chamadas.voz_texto", "Esta é a minha voz");
    render(<ChamadaDireto ctx={ctx} d={d} grupos={GRUPOS} />);
    expect(screen.getByText("Pronto. A sua voz está registada.")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Testar com a chamada de exemplo" })); });
    await waitFor(() => expect(nuvem.transcreverFala).toHaveBeenCalledTimes(2));
    expect(nuvem.transcreverFala.mock.calls[0][2]).toBe("UklGRg==");
    expect(nuvem.transcreverFala.mock.calls[0][3]).toBe("Esta é a minha voz");
  });
});
