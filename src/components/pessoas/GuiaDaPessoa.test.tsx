// O guia no topo da ficha de uma PESSOA sem negócio aberto: o guia simples (um passo, um botão), sem o assistente de passos. O assistente de Contacto e Visita é
// do negócio (ver `GuiaDoNegocioAssistente.test.tsx`): o Pipeline só tem negócios. Cada passo faz-se no próprio ecrã (formulário da chamada, diálogo de marcar
// visita, novo negócio).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ComClienteQuery } from "@/test/clienteQueryTeste";
import { contactoBase, negocioBase, pessoaBase, registosBase, resumoBase, visitaPessoaBase } from "./fabricaTestes";
import { FichaPessoa, type FichaPessoaProps } from "./FichaPessoa";
import { MarcarVisitaContext, type MarcarVisitaValor } from "./marcarVisitaContexto";
import type { AcoesFicha } from "./PainelBase";
import type { ItemAtividade, Pessoa, ResumoPessoa } from "./pessoasTipos";
import { ProcessoContext, type ProcessoValor } from "./processo/processoContexto";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);

const HOJE = "2026-10-13";
const acoesBase = (extra: Partial<AcoesFicha> = {}): AcoesFicha => ({
  registarChamada: vi.fn(), adiar: vi.fn(), encerrar: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(),
  registarResultadoVisita: vi.fn(), ...extra,
});

interface Ambiente {
  processo?: Partial<ProcessoValor> | null;
  marcar?: MarcarVisitaValor | null;
  ficha?: Partial<FichaPessoaProps>;
}

function montar(resumo: ResumoPessoa, a: Ambiente = {}) {
  const processo: ProcessoValor | null = a.processo === null ? null : { executar: vi.fn(), abrirVisitaLevantamento: vi.fn(), ...a.processo };
  const marcar = a.marcar === undefined ? { pedir: vi.fn(), marcadas: new Set<string>() } : a.marcar;
  const props: FichaPessoaProps = {
    resumo, aberto: true, aoFechar: vi.fn(), idsVisiveis: [], aoIrPara: vi.fn(), hoje: HOJE, submissoes: [], notas: [], atividade: [],
    pessoas: new Map([[resumo.pessoa.id, resumo.pessoa]]), voltou: false, podeVerSubmissoes: false, acoes: acoesBase(),
    aoPedir: vi.fn(), aoVerTodasSubmissoes: vi.fn(), aoCriarNegocio: vi.fn(), comGuia: true, ...a.ficha,
  };
  render(
    <ComClienteQuery>
      <ProcessoContext.Provider value={processo}>
        <MarcarVisitaContext.Provider value={marcar}><FichaPessoa {...props} /></MarcarVisitaContext.Provider>
      </ProcessoContext.Provider>
    </ComClienteQuery>,
  );
  return { props, processo, marcar };
}

const pessoa = (extra: Partial<Pessoa> = {}) => pessoaBase("a", { nome: "Pedro Lopes", contacto: { telefone: "927 118 300", email: "pedro.lopes@exemplo.pt" }, ...extra });
const porContactar = () => resumoBase(pessoa({ campanha: "Verão" }), [], HOJE, "lead");
const contactada = () => resumoBase(pessoa(), [], HOJE, "lead", registosBase({ contactos: [contactoBase()] }));
const comVisita = () => resumoBase(pessoa(), [], HOJE, "lead", registosBase({ contactos: [contactoBase()], visitas: [visitaPessoaBase("v1", { data: "2026-10-20" })] }));
const visitaFeita = () => resumoBase(pessoa(), [], HOJE, "lead", registosBase({
  contactos: [contactoBase()], visitas: [visitaPessoaBase("v1", { data: "2026-10-10", estado: "feita" })],
}));

describe("o guia da pessoa em abordagem", () => {
  it("por contactar: o guia de sempre («Registar a chamada»), sem o assistente de 5 passos, com o cartão do cliente e a barra com o nome certo", () => {
    montar(porContactar());
    expect(screen.getByRole("button", { name: /^Registar a chamada/ })).toBeInTheDocument();
    expect(screen.queryByText(/^Passo \d de 5/)).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Cliente" })).toBeInTheDocument();
    expect(screen.getAllByText("pedro.lopes@exemplo.pt").length).toBeGreaterThan(0);
    const atual = within(screen.getByRole("list", { name: "Fases" })).getAllByRole("listitem").filter((li) => li.getAttribute("aria-current") === "step");
    expect(atual).toHaveLength(1);
    expect(atual[0]).toHaveTextContent("Por contactar");
  });

  it("«Registar a chamada» abre o formulário da chamada dentro da ficha (sem sair da página), e o guia fica à vista (só a zona de apoio é substituída)", () => {
    montar(porContactar());
    fireEvent.click(screen.getByRole("button", { name: /^Registar a chamada/ }));
    expect(screen.getByRole("heading", { name: "Registar chamada" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Fases" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("contactado: o guia simples (sem o assistente, que é do negócio): «Marcar a visita» abre o diálogo de marcar visita desta pessoa", () => {
    const { marcar } = montar(contactada());
    expect(screen.queryByRole("button", { name: /^Continuar/ })).toBeNull();
    expect(screen.queryByText(/^Passo \d de \d/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Marcar a visita/ }));
    expect(marcar?.pedir).toHaveBeenCalledTimes(1);
    expect(vi.mocked(marcar!.pedir).mock.calls[0][0]).toMatchObject({ pessoaId: "a", nome: "Pedro Lopes" });
  });

  it("visita marcada: sem assistente e sem botão morto (a visita dá-se como feita no negócio)", () => {
    montar(comVisita());
    expect(screen.queryByRole("button", { name: /^Continuar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Marcar a visita como feita/ })).toBeNull();
  });

  it("visita feita: o passo é criar o negócio e abre «Novo negócio» (a ponte, só para quem ainda não tem negócio)", () => {
    const { props } = montar(visitaFeita());
    expect(screen.queryByRole("button", { name: /^Continuar/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Criar o negócio/ }));
    expect(props.aoCriarNegocio).toHaveBeenCalledTimes(1);
    expect(vi.mocked(props.aoCriarNegocio!).mock.calls[0][0]).toMatchObject({ id: "a" });
  });

  it("sem permissão de criar negócios o passo diz-o e não abre nada", () => {
    const { props } = montar(visitaFeita(), { ficha: { aoCriarNegocio: undefined } });
    const botao = screen.getByRole("button", { name: /^Criar o negócio/ });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao);
    expect(props.aoCriarNegocio).toBeUndefined();
  });

  it("sem permissão de escrever na pessoa (comPainelVisita falso), «Marcar a visita» fica desativado e não abre nada", () => {
    const { marcar } = montar(contactada(), { processo: { comPainelVisita: false } });
    const botao = screen.getByRole("button", { name: /^Marcar a visita/ });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao);
    expect(marcar?.pedir).not.toHaveBeenCalled();
  });

  it("sem o diálogo de marcar visita nesta página o botão de marcar não abre nada", () => {
    montar(contactada(), { marcar: null });
    const botao = screen.getByRole("button", { name: /^Marcar a visita/ });
    expect(botao).toHaveAttribute("aria-disabled", "true");
  });

  it("«Marcar como perdido» abre o painel de encerrar a abordagem", () => {
    montar(porContactar());
    fireEvent.click(screen.getByRole("button", { name: "Marcar como perdido" }));
    expect(screen.getByRole("region", { name: /Encerrar/i })).toBeInTheDocument();
  });

  it("um cliente não encerra a abordagem: sem «Marcar como perdido»", () => {
    montar(resumoBase(pessoa(), [], HOJE, "cliente", registosBase({ contactos: [contactoBase()] })));
    expect(screen.queryByRole("button", { name: "Marcar como perdido" })).toBeNull();
  });

  it("os últimos acontecimentos vêm da atividade da ficha", () => {
    const atividade: ItemAtividade[] = [{ id: "e1", pessoaId: "a", tipo: "historico", titulo: "Pedido pelo site", detalhe: "", quando: "2026-10-06", exemplo: false }];
    montar(porContactar(), { ficha: { atividade } });
    expect(screen.getByText("Historico · Pedido pelo site".replace("Historico", "Histórico"))).toBeInTheDocument();
    expect(screen.getByText("06/10/2026")).toBeInTheDocument();
  });

  it("com um negócio aberto (ainda por abrir) a pessoa não tem passo: fica o cabeçalho, a barra de fases e o cartão do cliente (o passo vive no negócio)", () => {
    const aberto = negocioBase("n1", { pessoaId: "a", servico: "Casa de banho" });
    montar(resumoBase(pessoa(), [aberto], HOJE, "lead", registosBase({ contactos: [contactoBase()] })));
    expect(screen.getAllByRole("list", { name: "Fases" })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 3, name: "Cliente" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Passos da fase" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Registar a chamada|^Marcar a visita|^Criar o negócio/ })).toBeNull();
  });

  it("o prazo vê-se no passo, com «Alterar prazo» que abre o painel Adiar (o prazo que antes estava no «Próximo passo e prazo»)", () => {
    montar(porContactar());
    expect(screen.getByText("Sem prazo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Alterar prazo" }));
    expect(screen.getByRole("region", { name: /Adiar/i })).toBeInTheDocument();
  });

  it("com prazo, diz o dia (com a hora quando o prazo é o próximo contacto)", () => {
    montar(resumoBase(pessoa({ proximoContacto: "2026-10-20", proximoHora: "14:30" }), [], HOJE, "lead", registosBase({ contactos: [contactoBase()] })));
    expect(screen.getByText(/14:30/)).toBeInTheDocument();
  });

  it("sem a bandeira do guia (o exemplo) a ficha fica como estava: sem guia e com o botão do passo na secção da visita", () => {
    montar(comVisita(), { ficha: { comGuia: false } });
    expect(screen.queryByRole("list", { name: "Fases" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Marcar a visita como feita/ })).toHaveLength(1);
  });

  it("com o guia o botão antigo «Marcar a visita como feita» já não existe: a visita dá-se como feita no negócio, na lista de visitas do assistente", () => {
    montar(comVisita());
    expect(screen.queryByRole("button", { name: /Marcar a visita como feita/ })).toBeNull();
  });
});
