// A barra e a ficha com «Reativar» a guardar, e a explicação do «Adiar» desativado ligada por aria-describedby.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { BarraAcoesFicha } from "./BarraAcoesFicha";
import { contactoBase, pessoaBase, registosBase, resumoBase, visitaPessoaBase } from "./fabricaTestes";
import { FichaPessoa, type FichaPessoaProps } from "./FichaPessoa";
import type { AcoesFicha } from "./PainelBase";
import { ProcessoContext } from "./processo/processoContexto";

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
const encerrada = { encerrada: { resultado: "semInteresse" as const, motivo: "preco" as const, data: "2026-10-01" } };
const abrirMais = () => fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });

describe("BarraAcoesFicha: aGuardar", () => {
  const montar = (aGuardar: boolean) => {
    const resumo = resumoBase(pessoaBase("a", encerrada), [], HOJE, "lead", registosBase({ contactos: [contactoBase()] }));
    render(<BarraAcoesFicha resumo={resumo} aberta={null} painelId="p" aoAbrir={vi.fn()} aoReativar={vi.fn()} aGuardar={aGuardar} />);
  };

  it("o gatilho «Mais» fica aria-busy enquanto guarda", () => {
    montar(true);
    expect(screen.getByRole("button", { name: "Mais" })).toHaveAttribute("aria-busy", "true");
  });

  it("sem guardar, o gatilho não está ocupado", () => {
    montar(false);
    expect(screen.getByRole("button", { name: "Mais" })).not.toHaveAttribute("aria-busy");
  });
});

describe("«Adiar» desativado: a explicação liga-se por aria-describedby", () => {
  it("o item aponta para um texto que está fora do próprio item", () => {
    const resumo = resumoBase(
      pessoaBase("a"), [], HOJE, "lead", registosBase({ visitas: [visitaPessoaBase("v1", { data: "2026-10-20" })] }),
    );
    render(
      <ProcessoContext.Provider value={{ executar: vi.fn(), abrirVisitaLevantamento: vi.fn() }}>
        <BarraAcoesFicha resumo={resumo} aberta={null} painelId="p" aoAbrir={vi.fn()} aoReativar={vi.fn()} aoCriarNegocio={vi.fn()} />
      </ProcessoContext.Provider>,
    );
    abrirMais();
    const adiar = screen.getByRole("menuitem", { name: /Adiar/ });
    expect(adiar).toHaveAttribute("aria-disabled", "true");
    const id = adiar.getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    const explicacao = document.getElementById(id as string);
    expect(explicacao).not.toBeNull();
    expect(explicacao?.textContent).toContain("O próximo contacto é uma visita");
    expect(adiar.contains(explicacao)).toBe(false);
  });

  it("com o adiar ativo não há explicação nem aria-describedby", () => {
    const resumo = resumoBase(pessoaBase("a"), [], HOJE, "lead", registosBase({ contactos: [contactoBase()] }));
    render(<BarraAcoesFicha resumo={resumo} aberta={null} painelId="p" aoAbrir={vi.fn()} aoReativar={vi.fn()} aoCriarNegocio={vi.fn()} />);
    abrirMais();
    expect(screen.getByRole("menuitem", { name: /Adiar/ })).not.toHaveAttribute("aria-describedby");
  });
});

describe("FichaInterior: Reativar a guardar", () => {
  const acoesBase = (extra: Partial<AcoesFicha> = {}): AcoesFicha => ({
    registarChamada: vi.fn(), adiar: vi.fn(), encerrar: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(),
    registarResultadoVisita: vi.fn(), ...extra,
  });
  function montar(acoes: AcoesFicha) {
    const resumo = resumoBase(pessoaBase("a", { nome: "Ana", ...encerrada }), [], HOJE, "lead", registosBase({ contactos: [contactoBase()] }));
    const props: FichaPessoaProps = {
      resumo, aberto: true, aoFechar: vi.fn(), idsVisiveis: [], aoIrPara: vi.fn(), hoje: HOJE, submissoes: [], notas: [], atividade: [],
      pessoas: new Map([["a", resumo.pessoa]]), voltou: false, podeVerSubmissoes: false, acoes, aoPedir: vi.fn(), aoVerTodasSubmissoes: vi.fn(),
    };
    render(<FichaPessoa {...props} />);
  }

  it("anuncia «A guardar…» e marca o «Mais» como ocupado até terminar", async () => {
    let resolver: () => void = () => undefined;
    const promessa = new Promise<void>((r) => { resolver = r; });
    montar(acoesBase({ reativar: vi.fn(() => promessa) }));
    abrirMais();
    fireEvent.click(screen.getByRole("menuitem", { name: /Reativar/ }));
    expect(screen.getByRole("button", { name: "Mais" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByRole("status").some((s) => s.textContent?.includes("A guardar…"))).toBe(true);
    await act(async () => { resolver(); await promessa; });
    expect(screen.getByRole("button", { name: "Mais" })).not.toHaveAttribute("aria-busy");
  });
});
