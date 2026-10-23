// «Novo negócio» na ficha REAL: nenhum documento se oferece ao criar, e o ciclo de gravação (a guardar, erro dentro do painel, só fecha em sucesso,
// id estável entre reenvios e novo depois de um sucesso). O resto está em NovoNegocioReal.test.tsx.
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AnuncioFichaContext } from "@/components/ficha-comum/anuncioFicha";
import { ComCostura, dadosFalsos, erroNegFalso, mutacoesFalsas, pendente } from "@/components/negocio-metas/costuraTestUtil";
import type { DadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import type { MutacoesNegocio, ResultadoCriar } from "@/components/negocio-metas/mutacoesNegocio";
import { registosAtuais, repor } from "@/components/negocio-metas/registosPessoa";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { contactoBase, levantamentoBase, registosBase, visitaPessoaBase } from "./fabricaTestes";
import { fichaDb } from "@/hooks/pessoas/fichaFabrica";
import { NovoNegocioReal } from "./NovoNegocioReal";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const { sucesso, info } = vi.hoisted(() => ({ sucesso: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info, error: vi.fn(), success: sucesso } }));

let contador = 0;
beforeAll(prepararRadixNoJsdom);
beforeEach(() => {
  contador = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `id-${++contador}` });
});
afterEach(() => { cleanup(); repor(); sucesso.mockReset(); info.mockReset(); vi.unstubAllGlobals(); });

const registos = registosBase({
  contactos: [contactoBase("c1", { data: "2026-10-10" }), contactoBase("c2", { data: "2026-10-12", negocioId: "outro" })],
  visitas: [visitaPessoaBase("v1", { data: "2026-10-11" })],
  levantamentos: [levantamentoBase("l1", { data: "2026-10-11" })],
});

function Harness(p: { aoCriado?: (id: string) => void; aoMudar?: (a: boolean) => void }) {
  const [aberto, setAberto] = useState(true);
  return (
    <NovoNegocioReal
      pessoaId="a" pessoaNome="Ana" ficha={fichaDb()} aberto={aberto} aoCriado={p.aoCriado ?? vi.fn()}
      aoMudarAberto={(v) => { p.aoMudar?.(v); setAberto(v); }}
    />
  );
}

function montar(mutacoes: MutacoesNegocio = mutacoesFalsas(), dados: Partial<DadosNegocio> = {}, extra: Parameters<typeof Harness>[0] = {}) {
  const anunciar = vi.fn();
  render(
    <AnuncioFichaContext.Provider value={anunciar}>
      <ComCostura mutacoes={mutacoes} dados={dadosFalsos({ registos, ...dados })}><Harness {...extra} /></ComCostura>
    </AnuncioFichaContext.Provider>,
  );
  return { mutacoes, anunciar };
}
const titulo = () => screen.getByRole("textbox", { name: /^Título do negócio/ });
const criar = () => screen.getByRole("button", { name: /^(Criar o negócio|A guardar…)$/ });
const escrever = (texto: string) => fireEvent.change(titulo(), { target: { value: texto } });
const aba = (nome: string) => fireEvent.mouseDown(screen.getByRole("tab", { name: new RegExp(`^${nome}`) }), { button: 0 });

describe("NovoNegocioReal: não oferece documentos (a ligação dos documentos faz-se no fim)", () => {
  const documentosPorLigar: DadosNegocio["documentosPorLigar"] = [
    { tipo: "orcamento", id: "o1", numero: "O-1", temBase: true },
    { tipo: "contrato", id: "k1", numero: "C-9", temBase: true },
  ];

  it.each([false, true])("com a bandeira em %s nenhuma aba tem documentos nem caixas deles", (criarComDocumentos) => {
    montar(mutacoesFalsas({ criarComDocumentos }), { documentosPorLigar });
    for (const nome of ["Geral", "Visita", "Levantamento"]) {
      aba(nome);
      expect(screen.queryByRole("group", { name: "Documentos a ligar" })).toBeNull();
      expect(screen.queryByRole("checkbox", { name: /Orçamento O-1|Contrato C-9/ })).toBeNull();
    }
  });

  it("o pedido de criar nunca leva documentos, e a escolha de contactos e visitas continua a ir", () => {
    const { mutacoes } = montar(mutacoesFalsas({ criarComDocumentos: true }), { documentosPorLigar });
    escrever("Sala");
    fireEvent.click(criar());
    const pedido = (mutacoes.criar as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(pedido.registos.some((r: { tipo: string }) => ["orcamento", "proposta", "contrato"].includes(r.tipo))).toBe(false);
    expect(pedido.registos).toEqual(expect.arrayContaining([{ tipo: "contacto", id: "c1" }, { tipo: "visita", id: "v1" }]));
  });
});

describe("NovoNegocioReal: gravar", () => {
  it("a guardar: o botão fica aria-disabled e aria-busy (com o nome de sempre), «A guardar…» só na região de estado, um segundo clique não repete e nada fecha", () => {
    const acao = pendente<ResultadoCriar>();
    const { mutacoes } = montar(mutacoesFalsas({ criar: vi.fn(() => acao.promessa) }));
    escrever("Sala");
    fireEvent.click(criar());
    const botao = criar();
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).toHaveAttribute("aria-busy", "true");
    // O nome do botão não muda (o «A guardar…» só se anuncia na região de estado, senão leria-se duas vezes) e o aria-disabled tem pista visual.
    expect(botao).toHaveTextContent("Criar o negócio");
    expect(botao).not.toHaveTextContent("A guardar…");
    expect(botao.className).toMatch(/aria-disabled:/);
    expect(screen.getByRole("status")).toHaveTextContent("A guardar…");
    fireEvent.click(botao);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mutacoes.criar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("a guardar: o X do cabeçalho também mostra que está ocupado (aria-disabled, com pista visual) e não fecha o painel", () => {
    const acao = pendente<ResultadoCriar>();
    montar(mutacoesFalsas({ criar: vi.fn(() => acao.promessa) }));
    const x = screen.getByRole("button", { name: "Fechar" });
    expect(x).not.toHaveAttribute("aria-disabled");
    escrever("Sala");
    fireEvent.click(criar());
    expect(x).toHaveAttribute("aria-disabled", "true");
    expect(x.className).toMatch(/aria-disabled:/);
    fireEvent.click(x);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("depois de uma falha o X volta a fechar o painel", async () => {
    const acao = pendente<ResultadoCriar>();
    montar(mutacoesFalsas({ criar: vi.fn(() => acao.promessa) }));
    escrever("Sala");
    fireEvent.click(criar());
    await acao.falhar(erroNegFalso("pessoasPagina.erroNeg.generico"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Fechar" })).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("em sucesso fecha, abre o negócio novo e avisa (toast e anúncio da ficha)", async () => {
    const aoCriado = vi.fn();
    const { anunciar } = montar(mutacoesFalsas(), {}, { aoCriado });
    escrever("Sala");
    fireEvent.click(criar());
    await waitFor(() => expect(aoCriado).toHaveBeenCalledWith("id-1"));
    expect(sucesso).toHaveBeenCalledWith("Negócio «Sala» criado para Ana.");
    expect(anunciar).toHaveBeenCalledWith("Negócio «Sala» criado para Ana.");
    expect(info).not.toHaveBeenCalled();
  });

  it("registos recusados avisam no ecrã e no anúncio e ficam por ligar", async () => {
    const criarMock = vi.fn(async (p: { id: string }): Promise<ResultadoCriar> => ({
      negocioId: p.id, mudou: true, recusados: [{ tipo: "contacto", id: "c1" }, { tipo: "visita", id: "v1" }],
    }));
    const { anunciar } = montar(mutacoesFalsas({ criar: criarMock as MutacoesNegocio["criar"] }));
    escrever("Sala");
    fireEvent.click(criar());
    await waitFor(() => expect(info).toHaveBeenCalledWith("2 registos não puderam ser ligados e ficam por ligar na ficha."));
    expect(anunciar).toHaveBeenCalledWith("2 registos não puderam ser ligados e ficam por ligar na ficha.");
  });

  it("mudou: false (reenvio do mesmo id) é sucesso e não repete avisos de recusados", async () => {
    const aoCriado = vi.fn();
    montar(mutacoesFalsas({ criar: vi.fn(async (p) => ({ negocioId: p.id, mudou: false, recusados: [{ tipo: "contacto" as const, id: "c1" }] })) }), {}, { aoCriado });
    escrever("Sala");
    fireEvent.click(criar());
    await waitFor(() => expect(aoCriado).toHaveBeenCalledTimes(1));
    expect(info).not.toHaveBeenCalled();
  });

  it("um erro traduz-se pelo código em role=alert dentro do painel; fica aberto e o reenvio usa o MESMO id", async () => {
    const acao = pendente<ResultadoCriar>();
    const criarMock = vi.fn()
      .mockReturnValueOnce(acao.promessa)
      .mockImplementationOnce(async (p: { id: string }) => ({ negocioId: p.id, mudou: true, recusados: [] }));
    const aoCriado = vi.fn();
    montar(mutacoesFalsas({ criar: criarMock }), {}, { aoCriado });
    escrever("Sala");
    fireEvent.click(criar());
    await acao.falhar(erroNegFalso("pessoasPagina.erroNeg.ng002", "NG002"));
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("O estado atual não permite esta ação.");
    expect(screen.getByRole("dialog")).toContainElement(alerta);
    expect(aoCriado).not.toHaveBeenCalled();
    fireEvent.click(criar());
    await waitFor(() => expect(aoCriado).toHaveBeenCalledTimes(1));
    expect(criarMock.mock.calls.map((c) => c[0].id)).toEqual(["id-1", "id-1"]);
  });

  it("depois de um sucesso, abrir outra vez gera um id novo", async () => {
    const criarMock = vi.fn(async (p: { id: string }): Promise<ResultadoCriar> => ({ negocioId: p.id, mudou: true, recusados: [] }));
    function Dois() {
      const [aberto, setAberto] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setAberto(true)}>reabrir</button>
          <NovoNegocioReal pessoaId="a" pessoaNome="Ana" ficha={fichaDb()} aberto={aberto} aoCriado={vi.fn()} aoMudarAberto={setAberto} />
        </>
      );
    }
    render(<ComCostura mutacoes={mutacoesFalsas({ criar: criarMock as MutacoesNegocio["criar"] })} dados={dadosFalsos({ registos })}><Dois /></ComCostura>);
    escrever("Sala");
    fireEvent.click(criar());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "reabrir" }));
    escrever("Quarto");
    fireEvent.click(criar());
    await waitFor(() => expect(criarMock).toHaveBeenCalledTimes(2));
    expect(criarMock.mock.calls.map((c) => c[0].id)).toEqual(["id-1", "id-2"]);
  });

  it("o store do exemplo fica intacto", async () => {
    const aoCriado = vi.fn();
    montar(mutacoesFalsas(), {}, { aoCriado });
    escrever("Sala");
    fireEvent.click(criar());
    await waitFor(() => expect(aoCriado).toHaveBeenCalled());
    expect(registosAtuais().contactos).toHaveLength(0);
  });
});
