// A barra de ações da ficha: o menu «Mais» tem Nota, Adiar, Visita e levantamento, Criar negócio e, no fim, Encerrar a abordagem (ou
// Reativar). Não há pedidos nem «novo negócio com visita».
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { contactoBase, negocioBase, pessoaBase, registosBase, resumoBase, visitaPessoaBase } from "./fabricaTestes";
import { BarraAcoesFicha } from "./BarraAcoesFicha";
import { ProcessoContext, type ProcessoValor } from "./processo/processoContexto";
import type { PapelPessoa, Pessoa, ResumoPessoa } from "./pessoasTipos";

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

function abrirMenu(resumo: ResumoPessoa, processo: ProcessoValor | null = { executar: vi.fn(), abrirVisitaLevantamento: vi.fn() }) {
  const props = { aoAbrir: vi.fn(), aoReativar: vi.fn(), aoCriarNegocio: vi.fn() };
  render(
    <ProcessoContext.Provider value={processo}>
      <BarraAcoesFicha resumo={resumo} aberta={null} painelId="p" {...props} />
    </ProcessoContext.Provider>,
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
  return { ...props, processo };
}

const lead = (extra: Partial<Pessoa> = {}, papel: PapelPessoa = "lead", registos = registosBase({ contactos: [contactoBase()] })) =>
  resumoBase(pessoaBase("a", extra), [], "2026-10-13", papel, registos);

describe("BarraAcoesFicha: o menu «Mais»", () => {
  it("uma lead em abordagem tem Nota, Adiar, Visita e levantamento, Criar negócio e Encerrar abordagem", () => {
    abrirMenu(lead());
    for (const nome of ["Nota", "Adiar", "Visita e levantamento", "Criar negócio", "Encerrar abordagem"]) {
      expect(screen.getByRole("menuitem", { name: new RegExp(nome) })).toBeInTheDocument();
    }
  });

  it("não há «novo negócio com visita» nem «marcar como perdida»", () => {
    abrirMenu(lead());
    expect(screen.queryByRole("menuitem", { name: /com visita/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /perdida/ })).not.toBeInTheDocument();
  });

  it("«Visita e levantamento» abre o painel da pessoa, pelo processo", () => {
    const { processo } = abrirMenu(lead());
    fireEvent.click(screen.getByRole("menuitem", { name: "Visita e levantamento" }));
    expect((processo as ProcessoValor).abrirVisitaLevantamento).toHaveBeenCalledWith("a", expect.anything());
  });

  it("«Criar negócio» pede à página para abrir o painel; num cliente chama-se «Novo negócio»", () => {
    const { aoCriarNegocio } = abrirMenu(lead());
    fireEvent.click(screen.getByRole("menuitem", { name: "Criar negócio" }));
    expect(aoCriarNegocio).toHaveBeenCalledTimes(1);
  });

  it("um cliente tem «Novo negócio» e não pode encerrar a abordagem", () => {
    abrirMenu(lead({}, "cliente"));
    expect(screen.getByRole("menuitem", { name: "Novo negócio" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Encerrar abordagem" })).not.toBeInTheDocument();
  });

  it("com um negócio aberto não há abordagem a encerrar", () => {
    const aberto = negocioBase("n1");
    abrirMenu(resumoBase(pessoaBase("a"), [aberto], "2026-10-13", "lead", registosBase()));
    expect(screen.queryByRole("menuitem", { name: "Encerrar abordagem" })).not.toBeInTheDocument();
  });

  it("«Encerrar abordagem» abre o painel de encerrar", () => {
    const { aoAbrir } = abrirMenu(lead());
    fireEvent.click(screen.getByRole("menuitem", { name: "Encerrar abordagem" }));
    expect(aoAbrir).toHaveBeenCalledWith("encerrar", expect.anything());
  });

  it("uma abordagem encerrada tem «Reativar abordagem» em vez de encerrar", () => {
    const encerrada = { resultado: "semInteresse" as const, motivo: "preco" as const, data: "2026-10-10" };
    const { aoReativar } = abrirMenu(lead({ encerrada }));
    expect(screen.queryByRole("menuitem", { name: "Encerrar abordagem" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Reativar abordagem" }));
    expect(aoReativar).toHaveBeenCalledTimes(1);
  });

  it("com o próximo contacto numa visita, «Adiar» fica desativado e a razão diz-se em texto", () => {
    const comVisita = registosBase({ visitas: [visitaPessoaBase("rv-1", { data: "2026-10-16" })] });
    abrirMenu(lead({ proximoContacto: null }, "lead", comVisita));
    const adiar = screen.getByRole("menuitem", { name: /Adiar/ });
    expect(adiar).toHaveAttribute("aria-disabled", "true");
    expect(adiar).toHaveTextContent(/visita/i);
  });

  it("sem processo (fora do provider) não há «Visita e levantamento»", () => {
    abrirMenu(lead(), null);
    expect(screen.queryByRole("menuitem", { name: "Visita e levantamento" })).not.toBeInTheDocument();
  });
});
