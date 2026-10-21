// «Novo negócio» na ficha REAL (neg_criar_negocio): título obrigatório, a lead a que o negócio corresponde, «Reabrir a abordagem» numa lead
// encerrada, os registos a ligar (só com permissão de editar), os documentos (só com a M6), e o ciclo de gravação (a guardar, erro dentro
// do painel, só fecha em sucesso, id estável entre reenvios e novo depois de um sucesso). O exemplo está em NovoNegocioDialogo.test.tsx.
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AnuncioFichaContext } from "@/components/ficha-comum/anuncioFicha";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import type { DadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { repor } from "@/components/negocio-metas/registosPessoa";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { contactoBase, levantamentoBase, registosBase, visitaPessoaBase } from "./fabricaTestes";
import { NovoNegocioReal } from "./NovoNegocioReal";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
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
      pessoaId="a" pessoaNome="Ana" aberto={aberto} aoCriado={p.aoCriado ?? vi.fn()}
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

describe("NovoNegocioReal: abrir", () => {
  it("mostra o painel «Novo negócio» com o foco no título, sem o selo «por gravar» do exemplo", () => {
    montar();
    const painel = screen.getByRole("dialog", { name: "Novo negócio" });
    expect(painel).toHaveTextContent("Ana");
    expect(painel).not.toHaveTextContent("por gravar");
    expect(painel).not.toHaveTextContent("Só exemplo");
    expect(titulo()).toHaveFocus();
  });

  it("sem permissão para criar (pessoas.create) não desenha nada", () => {
    montar(mutacoesFalsas(), { podeCriar: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sem as mutações da ficha real (o exemplo) não desenha nada", () => {
    render(<ComCostura mutacoes={null}><Harness /></ComCostura>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("NovoNegocioReal: validar", () => {
  it("sem título: o erro diz-se em texto, o campo fica inválido e com o foco, e a base não é chamada", () => {
    const { mutacoes } = montar();
    fireEvent.click(criar());
    const erro = screen.getByText("Escreva o título do negócio (até 200 caracteres).");
    expect(titulo()).toHaveAttribute("aria-invalid", "true");
    expect(titulo().getAttribute("aria-describedby")).toContain(erro.id);
    expect(titulo()).toHaveFocus();
    expect(mutacoes.criar).not.toHaveBeenCalled();
  });

  it("só espaços também é sem título; o campo limita a 200 caracteres", () => {
    const { mutacoes } = montar();
    escrever("   ");
    fireEvent.click(criar());
    expect(screen.getByText("Escreva o título do negócio (até 200 caracteres).")).toBeInTheDocument();
    expect(titulo()).toHaveAttribute("maxlength", "200");
    expect(mutacoes.criar).not.toHaveBeenCalled();
  });

  it("as notas limitam-se a 5000 caracteres", () => {
    montar();
    expect(screen.getByRole("textbox", { name: "Notas (opcional)" })).toHaveAttribute("maxlength", "5000");
  });
});

describe("NovoNegocioReal: criar", () => {
  it("chama criar com o id gerado ao abrir, o título, as notas, os registos por ligar marcados e o levantamento mais recente", async () => {
    const { mutacoes } = montar();
    escrever("  Casa de banho  ");
    fireEvent.change(screen.getByRole("textbox", { name: "Notas (opcional)" }), { target: { value: "Tudo novo" } });
    fireEvent.click(criar());
    expect(mutacoes.criar).toHaveBeenCalledWith({
      id: "id-1", titulo: "Casa de banho", notas: "Tudo novo", comercialId: null, leadId: null, reabrirAbordagem: false, fecho: "contrato",
      registos: [{ tipo: "contacto", id: "c1" }, { tipo: "visita", id: "v1" }], levantamentoId: "l1",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("com os levantamentos por carregar (a lista pode estar incompleta) não propõe «o mais recente»: nasce sem levantamento", () => {
    const { mutacoes } = montar(mutacoesFalsas(), { levantamentosCompletos: false });
    escrever("Casa de banho");
    fireEvent.click(criar());
    expect(mutacoes.criar).toHaveBeenCalledWith(expect.objectContaining({ registos: [{ tipo: "contacto", id: "c1" }, { tipo: "visita", id: "v1" }], levantamentoId: null }));
  });

  it("desmarcar um registo (e dispensar o levantamento) tira-o do pedido; um registo já ligado a outro negócio nem se oferece", () => {
    const { mutacoes } = montar();
    escrever("Sala");
    aba("Registos");
    expect(screen.queryByRole("checkbox", { name: /12 de outubro/ })).toBeNull();
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("radio", { name: /Não fazer levantamento|Dispensar|sem levantamento/i }));
    fireEvent.click(criar());
    expect(mutacoes.criar).toHaveBeenCalledWith(expect.objectContaining({ registos: [{ tipo: "visita", id: "v1" }], levantamentoId: null }));
  });

  it("não oferece «fazer um levantamento novo»: é do P5, e a base não o cria daqui", () => {
    montar();
    aba("Registos");
    expect(screen.queryByRole("radio", { name: /fazer um levantamento novo|Fazer um novo/i })).toBeNull();
  });

  it("sem registos por ligar o negócio nasce sem registos e sem levantamento", () => {
    const { mutacoes } = montar(mutacoesFalsas(), { registos: registosBase() });
    escrever("Sala");
    fireEvent.click(criar());
    expect(mutacoes.criar).toHaveBeenCalledWith(expect.objectContaining({ registos: [], levantamentoId: null }));
  });

  it("sem permissão para editar (pessoas.edit) não há aba de registos e o negócio nasce vazio", () => {
    const { mutacoes } = montar(mutacoesFalsas(), { podeEditar: false });
    expect(screen.queryByRole("tab", { name: /^Registos/ })).toBeNull();
    escrever("Sala");
    fireEvent.click(criar());
    expect(mutacoes.criar).toHaveBeenCalledWith(expect.objectContaining({ registos: [], levantamentoId: null }));
  });
});

describe("NovoNegocioReal: a lead do negócio", () => {
  const duas = {
    leadsAbertas: [{ id: "velha", criadaEm: "2026-09-01", encerrada: false }, { id: "nova", criadaEm: "2026-10-01", encerrada: false }],
  };

  it("com duas ou mais leads abertas há um seletor, com a mais recente escolhida, e a escolhida vai no pedido", () => {
    const { mutacoes } = montar(mutacoesFalsas(), duas);
    const seletor = screen.getByRole("combobox", { name: "Lead do negócio" });
    expect(seletor).toHaveValue("nova");
    fireEvent.change(seletor, { target: { value: "velha" } });
    escrever("Sala");
    fireEvent.click(criar());
    expect(mutacoes.criar).toHaveBeenCalledWith(expect.objectContaining({ leadId: "velha", reabrirAbordagem: false }));
  });

  it("com uma só lead aberta não há seletor e a lead vai no pedido; sem leads (um cliente) vai null", () => {
    const um = montar(mutacoesFalsas(), { leadsAbertas: [{ id: "unica", criadaEm: "2026-10-01", encerrada: false }] });
    expect(screen.queryByRole("combobox", { name: "Lead do negócio" })).toBeNull();
    escrever("Sala");
    fireEvent.click(criar());
    expect(um.mutacoes.criar).toHaveBeenCalledWith(expect.objectContaining({ leadId: "unica" }));
    cleanup();
    const nenhuma = montar();
    escrever("Sala");
    fireEvent.click(criar());
    expect(nenhuma.mutacoes.criar).toHaveBeenCalledWith(expect.objectContaining({ leadId: null }));
  });

  it("uma lead com a abordagem encerrada exige «Reabrir a abordagem»: sem marcar, erro em texto e a base não é chamada", () => {
    const { mutacoes } = montar(mutacoesFalsas(), { leadsAbertas: [{ id: "morta", criadaEm: "2026-10-01", encerrada: true }] });
    escrever("Sala");
    const caixa = screen.getByRole("checkbox", { name: "Reabrir a abordagem desta lead" });
    expect(screen.getByText("A abordagem desta lead está encerrada. Para criar o negócio é preciso reabri-la.")).toBeInTheDocument();
    fireEvent.click(criar());
    expect(screen.getByText("Marque «Reabrir a abordagem desta lead» para criar o negócio.")).toBeInTheDocument();
    expect(caixa).toHaveAttribute("aria-invalid", "true");
    expect(caixa).toHaveFocus();
    expect(mutacoes.criar).not.toHaveBeenCalled();
    fireEvent.click(caixa);
    fireEvent.click(criar());
    expect(mutacoes.criar).toHaveBeenCalledWith(expect.objectContaining({ leadId: "morta", reabrirAbordagem: true }));
  });

  it("uma lead aberta não mostra a opção de reabrir", () => {
    montar(mutacoesFalsas(), { leadsAbertas: [{ id: "l", criadaEm: "2026-10-01", encerrada: false }] });
    expect(screen.queryByRole("checkbox", { name: "Reabrir a abordagem desta lead" })).toBeNull();
  });
});
