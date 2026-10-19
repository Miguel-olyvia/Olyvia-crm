// A barra de ações com as capacidades da ficha real: o que a base ainda não faz sai da barra (sem botões que não fazem nada).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { contactoBase, pessoaBase, registosBase, resumoBase } from "./fabricaTestes";
import { BarraAcoesFicha } from "./BarraAcoesFicha";
import type { CapacidadesFicha } from "./PainelBase";
import { ProcessoContext } from "./processo/processoContexto";
import type { PapelPessoa, Pessoa } from "./pessoasTipos";

vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos = pessoasPaginaTranslations.pt;
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});

beforeAll(prepararRadixNoJsdom);

const TUDO: CapacidadesFicha = { chamada: true, encerrar: true, adiar: true, nota: true, visita: true };
const REAL_P2: CapacidadesFicha = { chamada: true, encerrar: true, adiar: false, nota: false, visita: false };

const resumo = (extra: Partial<Pessoa> = {}, papel: PapelPessoa = "lead") =>
  resumoBase(pessoaBase("a", extra), [], "2026-10-13", papel, registosBase({ contactos: [contactoBase()] }));

function montar(opcoes: { capacidades?: CapacidadesFicha; comCriar?: boolean; extra?: Partial<Pessoa>; papel?: PapelPessoa } = {}) {
  const props = { aoAbrir: vi.fn(), aoReativar: vi.fn(), aoCriarNegocio: opcoes.comCriar === false ? undefined : vi.fn() };
  render(
    <ProcessoContext.Provider value={{ executar: vi.fn(), abrirVisitaLevantamento: vi.fn() }}>
      <BarraAcoesFicha
        resumo={resumo(opcoes.extra, opcoes.papel)} aberta={null} painelId="p" capacidades={opcoes.capacidades} {...props}
      />
    </ProcessoContext.Provider>,
  );
  return props;
}
const abrirMais = () => fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
const item = (nome: string) => screen.queryByRole("menuitem", { name: new RegExp(nome) });

describe("BarraAcoesFicha: capacidades", () => {
  it("sem capacidades (exemplo) tudo continua como antes", () => {
    montar();
    expect(screen.getByRole("button", { name: /Registar chamada/ })).toBeInTheDocument();
    abrirMais();
    for (const nome of ["Nota", "Adiar", "Visita e levantamento", "Criar negócio", "Encerrar abordagem"]) expect(item(nome), nome).toBeInTheDocument();
  });

  it("no P2 real: sem Nota nem Adiar nem Visita e levantamento; mantém Encerrar", () => {
    montar({ capacidades: REAL_P2, comCriar: false });
    abrirMais();
    expect(item("^Nota$")).toBeNull();
    expect(item("Adiar")).toBeNull();
    expect(item("Visita e levantamento")).toBeNull();
    expect(item("Criar negócio")).toBeNull();
    expect(item("Encerrar abordagem")).toBeInTheDocument();
  });

  it("com Nota e Adiar ligados (M8 aplicada) voltam ao menu", () => {
    montar({ capacidades: { ...REAL_P2, nota: true, adiar: true }, comCriar: false });
    abrirMais();
    expect(item("^Nota$")).toBeInTheDocument();
    expect(item("Adiar")).toBeInTheDocument();
  });

  it("sem a capacidade de chamada não há «Registar chamada»", () => {
    montar({ capacidades: { ...TUDO, chamada: false } });
    expect(screen.queryByRole("button", { name: /Registar chamada/ })).toBeNull();
  });

  it("sem a capacidade de encerrar não há Encerrar nem Reativar", () => {
    montar({ capacidades: { ...TUDO, encerrar: false } });
    abrirMais();
    expect(item("Encerrar abordagem")).toBeNull();
  });

  it("uma abordagem encerrada sem a capacidade de encerrar não oferece Reativar", () => {
    montar({ capacidades: { ...TUDO, encerrar: false }, extra: { encerrada: { resultado: "semInteresse", motivo: "preco", data: "2026-10-01" } } });
    abrirMais();
    expect(item("Reativar")).toBeNull();
  });

  it("«Criar negócio» só aparece quando a página o liga (aoCriarNegocio)", () => {
    montar({ comCriar: false });
    abrirMais();
    expect(item("Criar negócio")).toBeNull();
  });

  it("sem nenhum item para o menu, o botão «Mais» também sai (um cliente no P2)", () => {
    montar({ capacidades: REAL_P2, comCriar: false, papel: "cliente" });
    expect(screen.queryByRole("button", { name: "Mais" })).toBeNull();
  });
});
