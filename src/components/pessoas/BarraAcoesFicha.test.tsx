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
    const props = { aoAbrir: vi.fn(), aoReativar: vi.fn(), aoCriarNegocio: vi.fn() };
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

  it("o menu mantém todos os itens; «Registar chamada» só entra com comItemChamada", () => {
    montar(comContacto(), true);
    fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
    for (const nome of ["Nota", "Adiar", "Visita e levantamento", "Criar negócio", "Encerrar abordagem", "Registar chamada"]) {
      expect(screen.getByRole("menuitem", { name: new RegExp(nome) })).toBeInTheDocument();
    }
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

describe("AcoesSecundariasFicha: o apoio a pedido (Mais e atalhos)", () => {
  const CONTAGENS = { visitas: 2, negocios: 1, submissoes: 3, submissoesNovas: 2 };
  const montar = (resumo: ResumoPessoa, extra: Partial<Parameters<typeof AcoesSecundariasFicha>[0]> = {}) => {
    const props = { aoAbrir: vi.fn(), aoReativar: vi.fn(), aoCriarNegocio: vi.fn(), aoAbrirApoio: vi.fn(), contagens: CONTAGENS };
    render(
      <ProcessoContext.Provider value={{ executar: vi.fn(), abrirVisitaLevantamento: vi.fn() }}>
        <AcoesSecundariasFicha resumo={resumo} aberta={null} painelId="p" comItemChamada={false} {...props} {...extra} />
      </ProcessoContext.Provider>,
    );
    return props;
  };
  const abrir = () => fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });

  it("o Mais tem Registos e dados, Visitas (2), Negócios (1), Submissões (3) e Atividade, e cada um chama o apoio com a aba certa", () => {
    const p = montar(lead());
    abrir();
    for (const nome of ["Registos e dados", "Visitas (2)", "Negócios (1)", "Submissões (3)", "Atividade"]) {
      expect(screen.getByRole("menuitem", { name: nome }), nome).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("menuitem", { name: "Visitas (2)" }));
    expect(p.aoAbrirApoio).toHaveBeenCalledWith("visitas", expect.anything());
  });

  it("sem a contagem de submissões (sem permissão) não há o item Submissões", () => {
    montar(lead(), { contagens: { ...CONTAGENS, submissoes: undefined } });
    abrir();
    expect(screen.queryByRole("menuitem", { name: /^Submissões/ })).toBeNull();
  });

  it("uma pessoa cliente sem outras ações continua a ter o menu Mais (tem o apoio)", () => {
    montar(lead({}, "cliente"), { aoCriarNegocio: undefined, capacidades: { chamada: false, encerrar: false, adiar: false, nota: false, visita: false } });
    expect(screen.getByRole("button", { name: "Mais" })).toBeInTheDocument();
  });

  it("«Detalhes do negócio» só aparece com um negócio aberto (aoAbrirDetalhesNegocio)", () => {
    const aoDetalhes = vi.fn();
    montar(lead(), { aoAbrirDetalhesNegocio: aoDetalhes });
    abrir();
    fireEvent.click(screen.getByRole("menuitem", { name: "Detalhes do negócio" }));
    expect(aoDetalhes).toHaveBeenCalledTimes(1);
  });

  it("sem aoAbrirApoio o menu fica como era (o exemplo): sem itens de apoio nem atalhos", () => {
    montar(lead(), { aoAbrirApoio: undefined, contagens: undefined });
    abrir();
    expect(screen.queryByRole("menuitem", { name: /^Registos e dados/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /^Atividade/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Detalhes do negócio" })).toBeNull();
  });

  it("os atalhos «2 visitas», «1 negócio» e «2 submissões novas» abrem a aba certa, com o botão como origem do foco", () => {
    const p = montar(lead());
    fireEvent.click(screen.getByRole("button", { name: "2 visitas" }));
    expect(p.aoAbrirApoio).toHaveBeenLastCalledWith("visitas", screen.getByRole("button", { name: "2 visitas" }));
    fireEvent.click(screen.getByRole("button", { name: "1 negócio" }));
    expect(p.aoAbrirApoio).toHaveBeenLastCalledWith("negocios", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "2 submissões novas" }));
    expect(p.aoAbrirApoio).toHaveBeenLastCalledWith("submissoes", expect.anything());
  });

  it("os atalhos só existem com contagem maior que zero", () => {
    montar(lead(), { contagens: { visitas: 0, negocios: 0, submissoes: 0, submissoesNovas: 0 } });
    expect(screen.queryByRole("button", { name: /visita/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /negócio/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /submiss/ })).toBeNull();
  });
});
