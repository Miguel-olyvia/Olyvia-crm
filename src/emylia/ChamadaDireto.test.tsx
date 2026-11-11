// 4/11: o painel «Chamada em direto» de ponta a ponta, com a nuvem simulada: a chamada de exemplo dá falas, cada fala
// vai à transcrição (Gemini pela função Supabase), no fim os campos são propostos com caixa e valor editável, e
// «Preencher» escreve nos campos do negócio por A.campo. Em modo de teste (?teste=1) não há microfone.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Grupo } from "./campos";
import type { Ctx } from "./pecas";
import type { Negocio } from "./motor";

const nuvem = vi.hoisted(() => ({
  audioDeFicheiro: vi.fn(),
  transcreverAudio: vi.fn(),
  transcreverFala: vi.fn(),
  analisarConversa: vi.fn(),
  preencherCampos: vi.fn(),
  gravarMicrofone: vi.fn(),
  pedirGuia: vi.fn(),
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
  // 11/11: o ficheiro (a chamada de exemplo ou uma gravação carregada) é transcrito por blocos, já com quem fala
  nuvem.audioDeFicheiro.mockResolvedValue(new Float32Array(16000 * 10));
  nuvem.transcreverAudio.mockImplementation(async (_pcm: Float32Array, _tipo: string, aoProgredir?: (k: number, n: number, f: unknown[]) => void) => {
    const falas = [
      { inicio: 3, fim: 5, texto: "É um apartamento no terceiro andar.", falante: "cliente", confianca_falante: 1, confianca: 0.9, revista: true },
      { inicio: 7, fim: 8, texto: "Muito bem.", falante: "comercial", confianca_falante: 1, confianca: 0.95, revista: true },
    ];
    aoProgredir?.(1, 1, falas);
    return falas;
  });
  nuvem.preencherCampos.mockResolvedValue(extracao);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const INSIGHTS = {
  resumo: "A Dona Inês quer remodelar a casa de banho.", temperatura: "quente", pontuacao: 82, porque_temperatura: "Quer começar já.",
  motivacao: null, necessidades: [{ texto: "Trocar a banheira por duche", linha: 0 }],
  orcamento: { valor: null, sensibilidade: "desconhecida", notas: null }, prazo: { quando: "janeiro", urgencia: "alta", data_decisao: null, notas: null },
  decisores: [], concorrencia: { outros_orcamentos: "desconhecido", notas: null }, objecoes: [], sinais_compra: [], preferencias: [], riscos: [],
  compromissos: [], proximos_passos: [{ texto: "Ligar na véspera da visita", responsavel: "Comercial", quando: null }],
  por_perguntar: ["Perguntar qual é o orçamento."], oportunidades: [], momentos: [{ linha: 1, titulo: "Combinam a visita" }],
  coaching: { correu_bem: [], a_melhorar: [] }, sentimento: { inicio: "neutro", fim: "positivo", notas: null },
};

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
  it("corre a chamada de exemplo: transcreve-a por blocos e manda os campos do negócio mais a visita combinada, com a análise", async () => {
    await correrExemplo();
    expect(screen.getByText("É um apartamento no terceiro andar.")).toBeInTheDocument();
    expect(screen.getByText("Cliente:")).toBeInTheDocument();
    expect(nuvem.audioDeFicheiro).toHaveBeenCalledWith("/chamadas/exemplo.ogg");
    expect(nuvem.transcreverAudio.mock.calls[0][1]).toBe("chamada");
    expect(nuvem.transcreverFala).not.toHaveBeenCalled();
    expect(nuvem.preencherCampos.mock.calls[0][3]).toBe(true);  // 11/11: com a análise
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
    // 9/11: e a transcrição inteira fica no negócio (antes de preencher)
    expect(campo).toHaveBeenCalledWith(7, "transcricao_chamada", expect.stringContaining("Cliente: É um apartamento no terceiro andar."));
    expect(campo).toHaveBeenCalledTimes(5);
    // o tipo de serviço e os serviços do Catálogo vão pelas ações próprias (só os nomes que existem no Catálogo)
    expect(servicoDaChamada).toHaveBeenCalledWith(7, "wc");
    expect(servicosDoPedido).toHaveBeenCalledWith(7, ["s1", "s2"]);
    expect(screen.getByText(/Preenchidos: Tipo de imóvel, O cliente é, Tipo de serviço, Serviços do Catálogo, Visita: dia combinado, Visita: hora combinada\./)).toBeInTheDocument();
  });

  it("no fim, quem fala passa a ser o revisto pelo sentido da conversa nas falas provisórias (5/11: o cliente vinha como «Comercial»)", async () => {
    nuvem.transcreverAudio.mockResolvedValueOnce([
      { inicio: 3, fim: 5, texto: "É um apartamento no terceiro andar.", falante: "cliente", confianca_falante: 0.3 },
      { inicio: 7, fim: 8, texto: "Muito bem.", falante: "comercial", confianca_falante: 0.3 },
    ]);
    nuvem.preencherCampos.mockResolvedValueOnce({ ...extracao, falantes: ["cliente", "cliente"] });
    await correrExemplo();
    expect(screen.queryByText("Comercial:")).toBeNull();
    expect(screen.getAllByText("Cliente:")).toHaveLength(2);
    expect(screen.getByText(/Quem fala foi corrigido em 1 linha, pelo sentido da conversa\./)).toBeInTheDocument();
  });

  it("se a revisão não trouxer uma entrada por linha, ficam as etiquetas que vieram", async () => {
    nuvem.preencherCampos.mockResolvedValueOnce({ ...extracao, falantes: ["cliente"] });
    await correrExemplo();
    expect(screen.getByText("Comercial:")).toBeInTheDocument();
  });

  it("11/11: nas falas revistas por bloco, quem fala fica como veio do áudio (a revisão pelo sentido não lhes mexe)", async () => {
    nuvem.preencherCampos.mockResolvedValueOnce({ ...extracao, falantes: ["cliente", "cliente"] });
    await correrExemplo();
    expect(screen.getByText("Comercial:")).toBeInTheDocument();
    expect(screen.queryByText(/Quem fala foi corrigido/)).toBeNull();
  });

  it("11/11: a análise da conversa aparece e fica guardada no negócio, com o tempo de cada fala", async () => {
    nuvem.preencherCampos.mockResolvedValueOnce({ ...extracao, insights: INSIGHTS });
    render(<ChamadaDireto ctx={ctx} d={d} grupos={GRUPOS} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Testar com a chamada de exemplo" })); });
    await waitFor(() => expect(screen.getByRole("region", { name: "O que a Olyvia percebeu da chamada" })).toBeInTheDocument());
    expect(screen.getByText(/Quente · 82/)).toBeInTheDocument();
    expect(screen.getByText("Perguntar qual é o orçamento.")).toBeInTheDocument();
    expect(screen.getByText(/Ligar na véspera da visita/)).toBeInTheDocument();
    const guardada = campo.mock.calls.find((c) => c[1] === "insights_chamada");
    expect(guardada).toBeTruthy();
    const dados = JSON.parse(guardada![2]);
    expect(dados.tempos).toEqual([3, 7]);
    expect(dados.metricas).toMatchObject({ falas: 2, perguntasComercial: 0 });
    // o resumo da extração não se repete: está na análise
    expect(screen.queryByText(/Resumo:/)).toBeNull();
  });

  it("11/11: uma gravação carregada transcreve-se pelo mesmo caminho", async () => {
    render(<ChamadaDireto ctx={ctx} d={d} grupos={GRUPOS} />);
    const ficheiro = new File(["x"], "chamada.m4a", { type: "audio/mp4" });
    const input = document.querySelector('input[type="file"][accept^="audio"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: [ficheiro] } }); });
    await waitFor(() => expect(screen.getByText(/Apartamento, proprietária\./)).toBeInTheDocument());
    expect(nuvem.audioDeFicheiro).toHaveBeenCalledWith(ficheiro);
    expect(campo).toHaveBeenCalledWith(7, "transcricao_chamada", expect.stringContaining("Comercial: Muito bem."));
  });

  it("11/11: uma conversa guardada sem análise pode ser analisada; a análise guardada vê-se ao voltar", async () => {
    const dg = { id: 8, linhaPorDefinir: true, linha: "wc", f: { transcricao_chamada: "0:03 Cliente: Quero mudar a banheira.\n0:09 Comercial: Para quando?" } } as unknown as Negocio;
    nuvem.analisarConversa.mockResolvedValueOnce(INSIGHTS);
    render(<ChamadaDireto ctx={ctx} d={dg} grupos={GRUPOS} />);
    expect(screen.getByText(/Ver a transcrição guardada \(2 falas\)/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Analisar a conversa" })); });
    const [segs, tipo] = nuvem.analisarConversa.mock.calls[0];
    expect(tipo).toBe("chamada");
    expect(segs.map((s: { falante: string; inicio: number }) => [s.falante, s.inicio])).toEqual([["cliente", 3], ["comercial", 9]]);
    expect(screen.getByText(/Quente · 82/)).toBeInTheDocument();
    expect(campo).toHaveBeenCalledWith(8, "insights_chamada", expect.stringContaining('"pontuacao":82'));
    // e numa visita, o que se soube na chamada aparece para preparar
    cleanup();
    const guardada = campo.mock.calls.find((c) => c[1] === "insights_chamada")![2];
    const dv = { id: 8, f: { insights_chamada: guardada }, linha: "wc", visita: { med: {} } } as unknown as Negocio;
    render(<ChamadaDireto ctx={ctx} d={dv} grupos={GRUPOS} modo="visita" />);
    expect(screen.getByRole("region", { name: "O que se soube na chamada" })).toBeInTheDocument();
  });

  // 5/11 (Rúben, a visita real): o mesmo painel grava a visita; no fim propõe os campos da Visita, com as medidas ditas
  it("modo visita: os textos da visita, as medidas e as notas vão à função como «visita», e a medida dita entra nas medidas", async () => {
    nuvem.preencherCampos.mockResolvedValueOnce({ resumo: "Casa de banho toda nova.", motor: "gemini", fichas: [{ campos: [
      { chave: "med_pav", rotulo: "Pavimento (m²)", tipo: "numero", valor: "4,1", valor_rotulo: null, confianca: 1, excerto: "Comercial: são 4,1 metros quadrados", estado: "preenchido" },
      { chave: "notas_visita", rotulo: "Notas da visita", tipo: "texto_longo", valor: "Tirar a banheira e pôr duche.", valor_rotulo: null, confianca: 1, excerto: "", estado: "preenchido" },
    ] }] });
    const dv = { id: 9, f: {}, linha: "wc", visita: { med: {} } } as unknown as Negocio;
    render(<ChamadaDireto ctx={ctx} d={dv} grupos={GRUPOS} modo="visita" />);
    expect(screen.getByRole("heading", { name: "Gravar a visita" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Começar a gravar" })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Testar com a chamada de exemplo" })); });
    await waitFor(() => expect(screen.getByText(/Casa de banho toda nova\./)).toBeInTheDocument());
    const [, grupos, tipo] = nuvem.preencherCampos.mock.calls[0];
    expect(tipo).toBe("visita");
    expect(grupos.map((g: Grupo) => g.titulo)).toEqual(["Qualificação", "Medidas da área", "Da visita"]);
    fireEvent.click(screen.getByRole("button", { name: /Preencher 2 campos$/ }));
    expect((dv as unknown as { visita: { med: Record<string, number> } }).visita.med.pav).toBe(4.1);
    expect(campo).toHaveBeenCalledWith(9, "notas_visita", "Tirar a banheira e pôr duche.");
    expect(campo).not.toHaveBeenCalledWith(9, "med_pav", expect.anything());
  });

  it("11/11: o guia ao vivo marca os temas e diz a próxima pergunta enquanto a conversa se transcreve; no fim sai", async () => {
    let soltar: () => void = () => {};
    const falas = [
      { inicio: 1, fim: 3, texto: "Queria remodelar a casa de banho.", falante: "cliente", confianca_falante: 1, revista: true },
      { inicio: 4, fim: 6, texto: "Tem algum valor em mente?", falante: "comercial", confianca_falante: 1, revista: true },
      { inicio: 7, fim: 9, texto: "Até uns 6 mil euros.", falante: "cliente", confianca_falante: 1, revista: true },
    ];
    nuvem.transcreverAudio.mockImplementationOnce(async (_p: Float32Array, _t: string, aoProgredir?: (k: number, n: number, f: unknown[]) => void) => {
      aoProgredir?.(1, 2, falas);
      await new Promise<void>((ok) => { soltar = ok; });
      return falas;
    });
    nuvem.pedirGuia.mockResolvedValue({
      temas: [{ chave: "o_que_quer", estado: "respondido", resposta: "Remodelar a casa de banho", linha: 0 }, { chave: "orcamento", estado: "respondido", resposta: "Até 6 mil euros", linha: 2 }],
      proxima: { pergunta: "Para quando gostava de ter a obra feita?", porque: "Falta o prazo." }, alerta: null,
    });
    render(<ChamadaDireto ctx={ctx} d={d} grupos={GRUPOS} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Testar com a chamada de exemplo" })); });
    const guia = await screen.findByRole("region", { name: "Guia da conversa" });
    await waitFor(() => expect(screen.getByText("Para quando gostava de ter a obra feita?")).toBeInTheDocument());
    expect(nuvem.pedirGuia.mock.calls[0][1]).toBe("chamada");
    expect(nuvem.pedirGuia.mock.calls[0][2].map((t: { k: string }) => t.k)).toContain("orcamento");
    expect(guia).toHaveTextContent("2 de 9 temas com resposta");
    expect(screen.getByText("Até 6 mil euros")).toBeInTheDocument();
    // tocar no tema leva à frase
    fireEvent.click(screen.getByRole("button", { name: /Orçamento: respondido/ }));
    await act(async () => { soltar(); });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Guia da conversa" })).toBeNull());
  });
});
