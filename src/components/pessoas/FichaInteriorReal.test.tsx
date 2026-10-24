// A ficha com as props da versão real: sem aba Notas, sem «Criar negócio», com «Reativar» a esperar pela ação e sem botões soltos.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { contactoBase, negocioBase, pessoaBase, registosBase, resumoBase, visitaPessoaBase } from "./fabricaTestes";
import { FichaPessoa, type FichaPessoaProps } from "./FichaPessoa";
import type { AcoesFicha } from "./PainelBase";
import type { Pessoa, ResumoPessoa } from "./pessoasTipos";

// A ficha real monta o fornecedor do questionário (importa o cliente da base): nenhum destes testes fala com a base.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const textos: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt };
  const t = (key: string, params?: Record<string, string | number>) =>
    Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key);
  return { useTranslation: () => ({ language: "pt", t }) };
});

beforeAll(prepararRadixNoJsdom);

const HOJE = "2026-10-13";
const acoesBase = (extra: Partial<AcoesFicha> = {}): AcoesFicha => ({
  registarChamada: vi.fn(), adiar: vi.fn(), encerrar: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(),
  registarResultadoVisita: vi.fn(), ...extra,
});

function montar(resumo: ResumoPessoa, sobre: Partial<FichaPessoaProps> = {}) {
  const props: FichaPessoaProps = {
    resumo, aberto: true, aoFechar: vi.fn(), idsVisiveis: [], aoIrPara: vi.fn(), hoje: HOJE, submissoes: [], notas: [], atividade: [],
    pessoas: new Map([[resumo.pessoa.id, resumo.pessoa]]), voltou: false, podeVerSubmissoes: false, acoes: acoesBase(),
    aoPedir: vi.fn(), aoVerTodasSubmissoes: vi.fn(), aoCriarNegocio: vi.fn(), ...sobre,
  };
  render(<FichaPessoa {...props} />);
  return props;
}

const lead = (extra: Partial<Pessoa> = {}) =>
  resumoBase(pessoaBase("a", { nome: "Ana", ...extra }), [], HOJE, "lead", registosBase({ contactos: [contactoBase()] }));
const abrirMais = () => fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });

describe("FichaInterior: comNotas e aoCriarNegocio opcionais", () => {
  it("por defeito tem a aba Notas e o «Criar negócio»", () => {
    montar(lead());
    expect(screen.getByRole("tab", { name: /Notas/ })).toBeInTheDocument();
    abrirMais();
    expect(screen.getByRole("menuitem", { name: "Criar negócio" })).toBeInTheDocument();
  });

  it("com comNotas={false} a aba Notas não existe (as outras ficam)", () => {
    montar(lead(), { comNotas: false });
    expect(screen.queryByRole("tab", { name: /Notas/ })).toBeNull();
    for (const nome of ["Resumo", "Negócios", "Atividade"]) expect(screen.getByRole("tab", { name: new RegExp(nome) })).toBeInTheDocument();
  });

  it("sem aoCriarNegocio não há «Criar negócio» no menu", () => {
    montar(lead(), { aoCriarNegocio: undefined });
    abrirMais();
    expect(screen.queryByRole("menuitem", { name: "Criar negócio" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Encerrar abordagem" })).toBeInTheDocument();
  });
});

describe("FichaInterior: Reativar espera pela ação", () => {
  const encerrada = () => lead({ encerrada: { resultado: "semInteresse", motivo: "preco", data: "2026-10-01" } });

  it("síncrona (exemplo): reativa e anuncia logo", () => {
    const acoes = acoesBase();
    montar(encerrada(), { acoes });
    abrirMais();
    fireEvent.click(screen.getByRole("menuitem", { name: /Reativar/ }));
    expect(acoes.reativar).toHaveBeenCalledExactlyOnceWith("a");
    expect(screen.getByRole("status", { hidden: true })).toBeTruthy();
  });

  it("assíncrona: só anuncia no fim; uma falha mostra o erro em role=alert", async () => {
    let rejeitar: (e: unknown) => void = () => undefined;
    const promessa = new Promise<void>((_, rej) => { rejeitar = rej; });
    const acoes = acoesBase({ reativar: vi.fn(() => promessa) });
    montar(encerrada(), { acoes });
    abrirMais();
    fireEvent.click(screen.getByRole("menuitem", { name: /Reativar/ }));
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => { rejeitar(Object.assign(new Error("x"), { chave: "pessoasPagina.erroNeg.ng002" })); await promessa.catch(() => undefined); });
    expect(screen.getByRole("alert")).toHaveTextContent("O estado atual não permite esta ação.");
  });
});

describe("FichaInterior: o que a ficha real não liga ainda", () => {
  const comVisita = () => resumoBase(
    pessoaBase("a", { nome: "Ana" }), [], HOJE, "lead", registosBase({ visitas: [visitaPessoaBase("v1", { data: "2026-10-20" })] }),
  );

  it("sem a capacidade de visita não há «Alterar visita» na secção das visitas", () => {
    const acoes = acoesBase({ capacidades: { chamada: true, encerrar: true, adiar: false, nota: false, visita: false } });
    montar(comVisita(), { acoes });
    expect(screen.getByText("Visitas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Alterar/ })).toBeNull();
  });

  it("com a capacidade de visita (ou sem capacidades, no exemplo) o botão «Alterar» existe", () => {
    montar(comVisita());
    expect(screen.getAllByRole("button", { name: /Alterar/ }).length).toBeGreaterThan(0);
  });

  it("sem a capacidade «negocios» a aba Negócios lê-se mas os negócios não abrem", () => {
    const aberto = negocioBase("n1", { pessoaId: "a", servico: "Casa de banho" });
    const resumo = resumoBase(pessoaBase("a", { nome: "Ana" }), [aberto], HOJE);
    const acoes = acoesBase({ capacidades: { chamada: true, encerrar: true, adiar: false, nota: false, visita: false, negocios: false } });
    montar(resumo, { acoes });
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Negócios/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Negócios/ }));
    const painel = screen.getByRole("tabpanel");
    expect(within(painel).getByText("Casa de banho")).toBeInTheDocument();
    expect(within(painel).queryByRole("button")).toBeNull();
  });
});
