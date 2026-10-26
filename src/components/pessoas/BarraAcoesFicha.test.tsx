// A barra de ações da ficha: o menu «Mais» tem Nota, Adiar, Visita e levantamento, Criar negócio e, no fim, Encerrar a abordagem (ou
// Reativar). Não há pedidos nem «novo negócio com visita».
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { contactoBase, negocioBase, pessoaBase, registosBase, resumoBase, visitaPessoaBase } from "./fabricaTestes";
import { AcoesSecundariasFicha, BarraAcoesFicha } from "./BarraAcoesFicha";
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
    // A razão deixou de estar DENTRO do item (item 17 da ronda de revisão): está fora e liga-se por aria-describedby.
    expect(document.getElementById(adiar.getAttribute("aria-describedby") ?? "")).toHaveTextContent(/visita/i);
  });

  it("sem processo (fora do provider) não há «Visita e levantamento»", () => {
    abrirMenu(lead(), null);
    expect(screen.queryByRole("menuitem", { name: "Visita e levantamento" })).not.toBeInTheDocument();
  });
});

describe("AcoesSecundariasFicha: o Email e o Mais no cabeçalho do guia", () => {
  const montar = (resumo: ResumoPessoa, comItemChamada = false) => {
    const props = { aoAbrir: vi.fn(), aoReativar: vi.fn() };
    render(
      <ProcessoContext.Provider value={{ executar: vi.fn(), abrirVisitaLevantamento: vi.fn() }}>
        <AcoesSecundariasFicha resumo={resumo} aberta={null} painelId="p" comItemChamada={comItemChamada} {...props} />
      </ProcessoContext.Provider>,
    );
    return props;
  };
  const comContacto = (extra: Partial<Pessoa> = {}) => lead({ contacto: { telefone: "927118300", email: "a@b.pt" }, ...extra });

  it("tem Email e WhatsApp (só se existem), nunca «Ligar», e o menu Mais", () => {
    montar(comContacto());
    expect(screen.getByRole("link", { name: /Email/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ligar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Mais" })).toBeInTheDocument();
  });

  it("sem email nem telefone não há ligações", () => {
    montar(lead({ contacto: { telefone: null, email: null } }));
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("o botão «Registar chamada» solto não existe", () => {
    montar(comContacto());
    expect(screen.queryByRole("button", { name: /Registar chamada/ })).toBeNull();
  });

  it("o menu do guia tem Nota, Adiar, Encerrar abordagem e, com comItemChamada, Registar chamada; nunca «Visita e levantamento» nem «Criar negócio»", () => {
    montar(comContacto(), true);
    fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
    for (const nome of ["Nota", "Adiar", "Encerrar abordagem", "Registar chamada"]) {
      expect(screen.getByRole("menuitem", { name: new RegExp(nome) })).toBeInTheDocument();
    }
    expect(screen.queryByRole("menuitem", { name: "Visita e levantamento" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Criar negócio|Novo negócio/ })).toBeNull();
  });

  it("sem comItemChamada o menu não tem «Registar chamada»", () => {
    montar(comContacto());
    fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
    expect(screen.queryByRole("menuitem", { name: "Registar chamada" })).toBeNull();
  });

  it("«Registar chamada» do menu abre o painel da chamada", () => {
    const p = montar(comContacto(), true);
    fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Registar chamada" }));
    expect(p.aoAbrir).toHaveBeenCalledWith("chamada", expect.anything());
  });
});

describe("AcoesSecundariasFicha: sem a ficha antiga no Mais", () => {
  const montar = (resumo: ResumoPessoa, extra: Partial<Parameters<typeof AcoesSecundariasFicha>[0]> = {}) => {
    const props = { aoAbrir: vi.fn(), aoReativar: vi.fn() };
    render(
      <ProcessoContext.Provider value={{ executar: vi.fn(), abrirVisitaLevantamento: vi.fn() }}>
        <AcoesSecundariasFicha resumo={resumo} aberta={null} painelId="p" comItemChamada={false} {...props} {...extra} />
      </ProcessoContext.Provider>,
    );
    return props;
  };
  const abrir = () => fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });

  it("o Mais nunca tem Registos e dados, Visitas, Negócios, Submissões nem Atividade, e não há atalhos «N visitas»", () => {
    montar(lead());
    abrir();
    for (const nome of [/^Registos e dados/, /^Visitas/, /^Negócios/, /^Submissões/, /^Atividade/]) {
      expect(screen.queryByRole("menuitem", { name: nome }), String(nome)).toBeNull();
    }
    expect(screen.queryByRole("button", { name: /\d+ (visita|negócio|submiss)/ })).toBeNull();
  });

  it("uma pessoa cliente sem outras ações e sem negócio aberto não tem menu Mais (não há nada para pôr nele)", () => {
    montar(lead({}, "cliente"), { capacidades: { chamada: false, encerrar: false, adiar: false, nota: false, visita: false } });
    expect(screen.queryByRole("button", { name: "Mais" })).toBeNull();
  });

  it("«Detalhes do negócio» só aparece com um negócio aberto (aoAbrirDetalhesNegocio)", () => {
    const aoDetalhes = vi.fn();
    montar(lead(), { aoAbrirDetalhesNegocio: aoDetalhes });
    abrir();
    fireEvent.click(screen.getByRole("menuitem", { name: "Detalhes do negócio" }));
    expect(aoDetalhes).toHaveBeenCalledTimes(1);
  });

  it("sem aoAbrirDetalhesNegocio não há «Detalhes do negócio»", () => {
    montar(lead());
    abrir();
    expect(screen.queryByRole("menuitem", { name: "Detalhes do negócio" })).toBeNull();
  });
});
