// Fecho v4, acessibilidade dos botões: cada ação aparece uma só vez na ficha (o aviso e o bloco não repetem o mesmo botão), o foco não se perde
// quando o botão ou o aviso desaparecem depois de gravar, quem usa leitor de ecrã ouve «A guardar…» e a explicação de «Fechar agora», e o
// motivo de reabrir diz que é obrigatório e fica só de leitura enquanto grava. Sem aviso útil para o estado, oferece-se «Dispensar o aviso».
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FechoV4Context } from "@/components/negocio-metas/bandeiraFecho";
import { ComCostura, dadosFalsos, mutacoesFalsas, pendente } from "@/components/negocio-metas/costuraTestUtil";
import type { MutacoesNegocio, ResultadoReavaliar } from "@/components/negocio-metas/mutacoesNegocio";
import { repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { negocioBase } from "./fabricaTestes";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

beforeAll(prepararRadixNoJsdom);
beforeEach(() => undefined);
afterEach(() => { cleanup(); repor(); reporRegistos(); });

const HOJE = "2026-10-19";
const aberto = (extra = {}) => negocioBase("n1", { pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto", fecho: "contrato", ...extra });
const ganho = (extra = {}) => ({
  ...negocioBase("n2", { pessoa: "Ana", servico: "Casa", estadoReal: "ganho", fecho: "contrato", ...extra }), resultado: "ganho" as const, mes: "2026-10",
});
const perdido = (extra = {}) => ({
  ...negocioBase("n3", { pessoa: "Ana", servico: "Sala", estadoReal: "perdido", fecho: "contrato", ...extra }), resultado: "perdido" as const, mes: "2026-10",
});
const resultado = (): ResultadoReavaliar => ({ mudou: true, estado: "ganho", origemTipo: "proposta", origemId: "p1", prova: "P1", conversao: "feita", motivo: null });

type Negocio = Parameters<typeof DetalheNegocioFicha>[0]["negocio"];
const mutacoesBase = (extra: Partial<MutacoesNegocio> = {}) =>
  mutacoesFalsas({ reavaliar: vi.fn(async () => resultado()), reabrirGanho: vi.fn(async () => ({ mudou: true })), dispensarAlerta: vi.fn(async () => ({ mudou: true })), ...extra });
const arvore = (negocio: Negocio, mutacoes: MutacoesNegocio) => (
  <MemoryRouter>
    <FechoV4Context.Provider value>
      <ComCostura mutacoes={mutacoes} dados={dadosFalsos({ podeReabrir: true, podeConverter: true })}>
        <DetalheNegocioFicha negocio={negocio} hoje={HOJE} aoVoltar={vi.fn()} />
      </ComCostura>
    </FechoV4Context.Provider>
  </MemoryRouter>
);
const abrir = (negocio: Negocio, extra: Partial<MutacoesNegocio> = {}) => {
  const mutacoes = mutacoesBase(extra);
  const vista = render(arvore(negocio, mutacoes));
  return { mutacoes, ...vista };
};

describe("cada ação aparece uma só vez", () => {
  it("ganho com a conversão falhada: um só «Converter em cliente»", () => {
    abrir(ganho({ alerta: { codigo: "conversao_falhou" }, conversaoPendente: true }));
    expect(screen.getAllByRole("button", { name: "Converter em cliente" })).toHaveLength(1);
  });

  it("ganho com proposta recusada depois de aceite: um só «Reabrir negócio»", () => {
    abrir(ganho({ alerta: { codigo: "recusa_depois_aceite" } }));
    expect(screen.getAllByRole("button", { name: "Reabrir negócio" })).toHaveLength(1);
  });

  it("aberto sem prova e pronto a ganhar: um só «Fechar agora»", () => {
    abrir(aberto({ alerta: { codigo: "sem_prova" }, prontoAGanhar: true }));
    expect(screen.getAllByRole("button", { name: "Fechar agora" })).toHaveLength(1);
  });
});

describe("um aviso sem ação própria para o estado pode sempre dispensar-se", () => {
  it("«sem prova» num negócio que ainda não está pronto a ganhar oferece «Dispensar o aviso»", () => {
    abrir(aberto({ alerta: { codigo: "sem_prova" } }));
    expect(within(screen.getByRole("region", { name: "Avisos do negócio" })).getByRole("button", { name: "Dispensar o aviso" })).toBeInTheDocument();
  });

  it("«recusada depois de aceite» num negócio já perdido oferece «Dispensar o aviso» (não há nada a reabrir)", () => {
    abrir(perdido({ alerta: { codigo: "recusa_depois_aceite" } }));
    expect(within(screen.getByRole("region", { name: "Avisos do negócio" })).getByRole("button", { name: "Dispensar o aviso" })).toBeInTheDocument();
  });
});

describe("foco depois de gravar", () => {
  it("depois de «Converter em cliente» o aviso e o botão saem e o foco vai para o título do negócio", async () => {
    const mutacoes = mutacoesBase({ ganhar: vi.fn(async () => ({ mudou: true })) } as Partial<MutacoesNegocio>);
    const { rerender } = render(arvore(ganho({ alerta: { codigo: "conversao_falhou" }, conversaoPendente: true }), mutacoes));
    const botao = screen.getByRole("button", { name: "Converter em cliente" });
    botao.focus();
    fireEvent.click(botao);
    await waitFor(() => expect(mutacoes.ganhar).toHaveBeenCalled());
    rerender(arvore(ganho({}), mutacoes));
    expect(screen.queryByRole("button", { name: "Converter em cliente" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Casa" })).toHaveFocus();
  });

  it("depois de «Manter perdido» o aviso sai e o foco vai para o título", async () => {
    const { mutacoes, rerender } = abrir(perdido({ alerta: { codigo: "positivo_depois_perda" } }));
    const botao = screen.getByRole("button", { name: "Manter perdido" });
    botao.focus();
    fireEvent.click(botao);
    await waitFor(() => expect(mutacoes.dispensarAlerta).toHaveBeenCalled());
    rerender(arvore(perdido({}), mutacoes));
    expect(screen.queryByRole("button", { name: "Manter perdido" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Sala" })).toHaveFocus();
  });
});

describe("leitor de ecrã", () => {
  it("«Dispensar o aviso» anuncia «A guardar…» enquanto espera pela base", async () => {
    const p = pendente<{ mudou: boolean }>();
    abrir(aberto({ alerta: { codigo: null } }), { dispensarAlerta: vi.fn(() => p.promessa) });
    fireEvent.click(screen.getByRole("button", { name: "Dispensar o aviso" }));
    expect(await screen.findByText("A guardar…")).toBeInTheDocument();
    await p.terminar({ mudou: true });
    await waitFor(() => expect(screen.queryByText("A guardar…")).toBeNull());
  });

  it("«Fechar agora» tem a sua explicação ligada por aria-describedby", () => {
    abrir(aberto({ prontoAGanhar: true }));
    const botao = screen.getByRole("button", { name: "Fechar agora" });
    const ids = (botao.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);
    const texto = ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
    expect(texto).toMatch(/documento decisivo com prova/);
  });
});

describe("o motivo de reabrir", () => {
  const abrirDialogo = () => {
    const p = pendente<{ mudou: boolean }>();
    const vista = abrir(ganho(), { reabrirGanho: vi.fn(() => p.promessa) });
    fireEvent.click(screen.getByRole("button", { name: "Reabrir negócio" }));
    return { p, ...vista };
  };

  it("diz que é obrigatório e o limite antes de falhar", () => {
    abrirDialogo();
    const campo = screen.getByRole("textbox", { name: /Motivo/ });
    expect(campo).toHaveAttribute("aria-required", "true");
    const ids = (campo.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    expect(ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ")).toMatch(/1000/);
  });

  it("fica só de leitura enquanto grava", async () => {
    const { p } = abrirDialogo();
    const campo = screen.getByRole("textbox", { name: /Motivo/ });
    fireEvent.change(campo, { target: { value: "Engano" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reabrir negócio" }));
    await waitFor(() => expect(campo).toHaveAttribute("readonly"));
    await p.terminar({ mudou: true });
  });
});
