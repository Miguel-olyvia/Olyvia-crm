// A ficha real do Pipeline é UM só ecrã: o cabeçalho, a barra de fases, o passo e o cartão do cliente são os do guia (nada empilhado por baixo do
// cabeçalho e das abas de fases antigos). Os registos, os dados da pessoa e as abas Visitas, Negócios, Submissões e Atividade NÃO existem neste modo
// (ver FichaGuiaSemApoio.test.tsx): o Pipeline faz tudo no assistente de passos.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { contactoBase, negocioBase, pessoaBase, registosBase, resumoBase, visitaPessoaBase } from "./fabricaTestes";
import { FichaPessoa, type FichaPessoaProps } from "./FichaPessoa";
import { MarcarVisitaContext } from "./marcarVisitaContexto";
import type { AcoesFicha } from "./PainelBase";
import type { Pessoa, ResumoPessoa } from "./pessoasTipos";
import { ProcessoContext } from "./processo/processoContexto";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/pessoas/useComerciaisNegocio", () => ({
  useComerciaisNegocio: () => ({ comerciais: [], isLoading: false, isError: false, repetir: vi.fn() }),
}));
vi.mock("@/components/pessoas-processo/LevantamentoDoNegocioReal", () => ({ useLevantamentoDoNegocio: () => ({ pode: true }) }));
vi.mock("@/components/pessoas-processo/DocumentosDoNegocioReal", () => ({ useDocumentosDoNegocio: () => null }));

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); repor(); reporRegistos(); });

const HOJE = "2026-10-13";
const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "manual", permissoesFecho: ["quotes.create"] };
const acoesBase = (): AcoesFicha => ({
  registarChamada: vi.fn(), adiar: vi.fn(), encerrar: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(), registarResultadoVisita: vi.fn(),
});

function montar(resumo: ResumoPessoa, sobre: Partial<FichaPessoaProps> = {}) {
  const props: FichaPessoaProps = {
    resumo, aberto: true, aoFechar: vi.fn(), idsVisiveis: ["x", "a", "y"], aoIrPara: vi.fn(), hoje: HOJE, submissoes: [], notas: [], atividade: [],
    pessoas: new Map([[resumo.pessoa.id, resumo.pessoa]]), voltou: false, podeVerSubmissoes: true, acoes: acoesBase(), comNotas: false,
    aoPedir: vi.fn(), aoVerTodasSubmissoes: vi.fn(), aoCriarNegocio: vi.fn(), comGuia: true,
    separadorSubmissoes: { total: 0, pendentes: 0, conteudo: <p>sem submissões</p> }, identidade: <p>Identidade da pessoa</p>, ...sobre,
  };
  render(
    <MemoryRouter>
      <FontePessoasContext.Provider value={REAL}>
        <ProcessoContext.Provider value={{ executar: vi.fn(), abrirVisitaLevantamento: vi.fn(), podeExecutar: () => true }}>
          <MarcarVisitaContext.Provider value={{ pedir: vi.fn(), marcadas: new Set<string>() }}>
            <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos({ podeEditar: true })}><FichaPessoa {...props} /></ComCostura>
          </MarcarVisitaContext.Provider>
        </ProcessoContext.Provider>
      </FontePessoasContext.Provider>
    </MemoryRouter>,
  );
  return props;
}

const pessoa = (extra: Partial<Pessoa> = {}) =>
  pessoaBase("a", { nome: "Pedro Lopes", contacto: { telefone: "927 118 300", email: "pedro.lopes@exemplo.pt" }, campanha: "Verão", ...extra });
const lead = () => resumoBase(pessoa(), [], HOJE, "lead");
const guia = () => screen.getByRole("region", { name: "Passo seguinte" });
const abrirMais = () => fireEvent.keyDown(within(guia()).getByRole("button", { name: "Mais" }), { key: "Enter" });
const NOME_APOIO = "Mais sobre a pessoa";

describe("a ficha real é um só ecrã", () => {
  it("há UM só cabeçalho: um só nome (o título da ficha, dentro do guia), sem o avatar e o título de antes", () => {
    montar(lead());
    const nomes = screen.getAllByRole("heading", { name: /Pedro Lopes/ });
    expect(nomes).toHaveLength(1);
    expect(nomes[0].tagName).toBe("H2");
    expect(nomes[0]).toHaveAttribute("data-ficha-nome");
    expect(guia()).toContainElement(nomes[0]);
    expect(screen.getByText("Lead · Por contactar")).toBeInTheDocument();
  });

  it("há UMA só barra de fases (a do guia): as abas Lead | Contacto | Visita | Negócio | Cliente de antes saem", () => {
    montar(lead());
    expect(screen.getAllByRole("list", { name: "Fases" })).toHaveLength(1);
    expect(screen.queryByRole("list", { name: "Percurso da lead" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Percurso da lead" })).toBeNull();
  });

  it("há UM só botão de «Registar chamada»: o do passo; o da barra de ações saiu", () => {
    montar(lead());
    expect(screen.getAllByRole("button", { name: /^Registar a chamada/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Registar chamada/ })).toBeNull();
    expect(screen.queryByRole("group", { name: "Ações da pessoa" })).toBeNull();
  });

  it("o Email, o menu Mais, o paginador «1 de N» e Fechar vivem no cabeçalho do guia", () => {
    montar(lead());
    const g = within(guia());
    expect(g.getByRole("link", { name: /Email/ })).toHaveAttribute("href", expect.stringContaining("pedro.lopes@exemplo.pt"));
    expect(g.getByRole("button", { name: "Mais" })).toBeInTheDocument();
    expect(g.getByText("2 de 3")).toBeInTheDocument();
    expect(g.getByRole("button", { name: "Fechar a ficha" })).toBeInTheDocument();
    expect(g.getByRole("button", { name: "Marcar como perdido" })).toBeInTheDocument();
  });

  it("o telefone do cabeçalho é a ligação (o botão «Ligar» de antes já não existe)", () => {
    montar(lead());
    expect(within(guia()).getAllByRole("link", { name: /927 118 300/ })[0]).toHaveAttribute("href", expect.stringMatching(/^tel:/));
    expect(screen.queryByRole("link", { name: "Ligar" })).toBeNull();
  });

  it("a ficha não mostra abas nem secções recolhíveis por omissão: só o guia (a ficha antiga saiu da vista)", () => {
    montar(lead());
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    for (const nome of ["Registos", "Dados da pessoa", "Lead"]) {
      expect(screen.queryByRole("button", { name: new RegExp(`^${nome}`) }), nome).toBeNull();
    }
    expect(screen.queryByText("Em lista")).toBeNull();
    expect(screen.queryByText("Lixo")).toBeNull();
    expect(screen.queryByText(/Ainda sem negócios/)).toBeNull();
    expect(screen.queryByRole("dialog", { name: NOME_APOIO })).toBeNull();
  });

  it("o bloco «Próximo passo e prazo» de antes não existe e o cartão do cliente aparece uma só vez", () => {
    montar(lead());
    expect(screen.queryByText("Próximo passo e prazo")).toBeNull();
    expect(screen.getAllByRole("heading", { name: "Cliente" })).toHaveLength(1);
    expect(screen.getAllByText("pedro.lopes@exemplo.pt").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Contacto" })).toBeNull();
  });

  it("o prazo vê-se no passo e «Alterar prazo» abre o painel Adiar", () => {
    montar(resumoBase(pessoa({ campanha: "Verão" }), [], HOJE, "lead", registosBase({ contactos: [] })));
    fireEvent.click(within(guia()).getByRole("button", { name: "Alterar prazo" }));
    expect(screen.getByRole("region", { name: /Adiar/i })).toBeInTheDocument();
  });

  it("«Registar a chamada» abre o formulário SEM esconder o guia", () => {
    montar(lead());
    fireEvent.click(screen.getByRole("button", { name: /^Registar a chamada/ }));
    expect(screen.getByRole("heading", { name: "Registar chamada" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Fases" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("o foco inicial vai para o nome", () => {
    montar(lead());
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: /Pedro Lopes/ }));
  });
});

describe("pessoas sem passo a fazer continuam com o ecrã único", () => {
  const cliente = () => resumoBase(pessoa(), [], HOJE, "cliente", registosBase({ contactos: [contactoBase()] }));
  const perdida = () => resumoBase(pessoa({ perdida: { motivo: "preco", data: "2026-10-01", passo: 1 } }), [], HOJE, "lead", registosBase({ contactos: [contactoBase()] }));
  const encerrada = () => resumoBase(pessoa({ encerrada: { resultado: "semInteresse", motivo: "preco", data: "2026-10-01" } }), [], HOJE, "lead");

  it.each([["cliente", cliente], ["perdida", perdida], ["encerrada", encerrada]])("%s: cabeçalho, barra de fases e cartão do cliente, sem botão primário", (_n, fazer) => {
    montar(fazer());
    expect(screen.getAllByRole("heading", { name: /Pedro Lopes/ })).toHaveLength(1);
    expect(screen.getAllByRole("list", { name: "Fases" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "Cliente" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Registar a chamada/ })).toBeNull();
  });

  it("perdida e encerrada: o aviso de estado está no cabeçalho; «Registar chamada» passa ao menu Mais", () => {
    montar(perdida());
    // O selo «Perdida» e o aviso de estado (motivo, data e passo) vivem os dois no cabeçalho do guia.
    expect(within(guia()).getAllByText("Perdida").length).toBeGreaterThan(1);
    abrirMais();
    expect(screen.getByRole("menuitem", { name: "Registar chamada" })).toBeInTheDocument();
  });

  it("o encerramento diz-se no cabeçalho do guia", () => {
    montar(encerrada());
    expect(within(guia()).getByText(/Abordagem encerrada · Sem interesse/)).toBeInTheDocument();
  });

  it("uma lead com passo NÃO tem «Registar chamada» no menu Mais (já tem o botão do passo)", () => {
    montar(lead());
    abrirMais();
    expect(screen.queryByRole("menuitem", { name: "Registar chamada" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Encerrar abordagem" })).toBeInTheDocument();
  });
});

describe("com um negócio aberto", () => {
  const aberto = () => negocioBase("n1", { pessoaId: "a", pessoa: "Pedro Lopes", servico: "WC social", comercial: "Ana Ribeiro", estadoReal: "aberto", contacto: { telefone: "927 118 300", email: null } });
  const resumoComNegocio = () => resumoBase(pessoa(), [aberto()], HOJE, "lead", registosBase({ contactos: [contactoBase()] }));

  it("há um só cabeçalho (o nome da pessoa e o serviço como linha) e uma só barra de fases", () => {
    montar(resumoComNegocio(), { negocioInicial: "n1" });
    expect(screen.getAllByRole("heading", { name: /Pedro Lopes/ })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "WC social" })).toHaveLength(1);
    expect(screen.getAllByRole("list", { name: "Fases" })).toHaveLength(1);
    expect(within(guia()).getByRole("button", { name: "Mais" })).toBeInTheDocument();
  });

  it("o valor e o comercial estão no passo, e já não há os selos «Negócio» nem o da fase", () => {
    montar(resumoComNegocio(), { negocioInicial: "n1" });
    expect(within(guia()).getByText("Ana Ribeiro")).toBeInTheDocument();
    expect(screen.queryByText("Negócio", { selector: "[data-slot=badge], .inline-flex" })).toBeNull();
  });

  it("«Registar chamada» do menu Mais abre o formulário também com o negócio aberto, e o guia do negócio fica à vista", () => {
    montar(resumoComNegocio(), { negocioInicial: "n1" });
    abrirMais();
    fireEvent.click(screen.getByRole("menuitem", { name: "Registar chamada" }));
    expect(screen.getByRole("heading", { name: "Registar chamada" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Fases" })).toBeInTheDocument();
  });

  it("«← Negócios» (discreto, por cima do cabeçalho) devolve o guia da pessoa, sem abas nem lista por baixo", () => {
    montar(resumoComNegocio(), { negocioInicial: "n1" });
    fireEvent.click(screen.getByRole("button", { name: /Voltar aos negócios/ }));
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("heading", { name: "WC social" })).toBeNull();
    expect(screen.getAllByRole("heading", { name: /Pedro Lopes/ })).toHaveLength(1);
    expect(screen.getAllByRole("list", { name: "Fases" })).toHaveLength(1);
  });

  it("o negócio aberto não deixa por baixo do guia as secções recolhíveis (Percurso, Orçamentos...) nem as ações de editar: vivem em «Detalhes do negócio»", () => {
    montar(resumoComNegocio(), { negocioInicial: "n1" });
    for (const nome of ["Percurso", "Registos ligados", "Orçamentos"]) {
      expect(screen.queryByRole("button", { name: new RegExp(`^${nome}`) }), nome).toBeNull();
    }
    expect(screen.queryByText("Detalhes")).toBeNull();
    abrirMais();
    fireEvent.click(screen.getByRole("menuitem", { name: "Detalhes do negócio" }));
    const d = within(screen.getByRole("dialog", { name: "Detalhes do negócio" }));
    expect(d.getByRole("button", { name: /^Percurso/ })).toBeInTheDocument();
    expect(d.getByRole("button", { name: /^Orçamentos/ })).toBeInTheDocument();
  });
});

describe("«Registar chamada» no menu Mais, quando o botão do passo é outro", () => {
  it("uma lead contactada (o passo é marcar a visita) continua a poder registar outra chamada, pelo menu Mais", () => {
    montar(resumoBase(pessoa(), [], HOJE, "lead", registosBase({ contactos: [contactoBase()] })));
    expect(screen.queryByRole("button", { name: /^Registar a chamada/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Marcar a visita/ })).toBeInTheDocument();
    abrirMais();
    fireEvent.click(screen.getByRole("menuitem", { name: "Registar chamada" }));
    expect(screen.getByRole("heading", { name: "Registar chamada" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Fases" })).toBeInTheDocument();
  });

  it("as fases de uma pessoa perdida marcam, por texto, a fase onde ficou", () => {
    montar(resumoBase(pessoa({ perdida: { motivo: "preco", data: "2026-10-01", passo: 1 } }), [], HOJE, "lead", registosBase({ contactos: [contactoBase()] })));
    const itens = within(screen.getByRole("list", { name: "Fases" })).getAllByRole("listitem");
    expect(itens[0]).toHaveTextContent("concluída");
    expect(itens[1]).toHaveTextContent("perdida");
    expect(itens[2]).toHaveTextContent("por fazer");
  });
});

describe("a faixa fina de alertas", () => {
  const FAIXA = { name: "Alertas da ficha" };
  const comPorFechar = () => resumoBase(pessoa({ ultimoContactoDias: 1 }), [], HOJE, "lead", registosBase({ contactos: [contactoBase()], visitas: [visitaPessoaBase("rv-1", { data: "2026-10-10" })] }));

  it("não existe quando não há alertas", () => {
    montar(resumoBase(pessoa({ ultimoContactoDias: 1 }), [], HOJE, "lead"));
    expect(screen.queryByRole("region", FAIXA)).toBeNull();
  });

  it("visitas por fechar: uma linha só com o texto (a visita fecha-se no assistente, não há botão que abra a ficha antiga)", () => {
    montar(comPorFechar());
    const faixa = screen.getByRole("region", FAIXA);
    expect(within(faixa).getByText(/1 visita por fechar/)).toBeInTheDocument();
    expect(within(faixa).queryByRole("button")).toBeNull();
  });

  it("voltou a contactar: diz-se na faixa, sem botão", () => {
    montar(resumoBase(pessoa({ ultimoContactoDias: 1 }), [], HOJE, "lead"), {
      voltou: true, separadorSubmissoes: { total: 2, pendentes: 2, conteudo: <p>sem submissões</p> },
    });
    const faixa = screen.getByRole("region", FAIXA);
    expect(within(faixa).getByText(/Voltou a contactar/)).toBeInTheDocument();
    expect(within(faixa).queryByRole("button", { name: /^Ver submissões/ })).toBeNull();
  });

  it("todos os negócios perdidos: o aviso vive na faixa, com «Encerrar abordagem»", () => {
    const perdido = { ...negocioBase("n1", { pessoaId: "a", pessoa: "Pedro Lopes", servico: "WC social" }), resultado: "perdido" as const };
    const base = resumoBase(pessoa({ ultimoContactoDias: 1 }), [], HOJE, "lead", registosBase({ contactos: [contactoBase()] }));
    montar({ ...base, negocios: [perdido] } as unknown as ResumoPessoa);
    const faixa = screen.getByRole("region", FAIXA);
    expect(within(faixa).getByText(/Todos os negócios desta lead estão perdidos/)).toBeInTheDocument();
    fireEvent.click(within(faixa).getByRole("button", { name: "Encerrar abordagem" }));
    expect(screen.getByRole("region", { name: /Encerrar/i })).toBeInTheDocument();
  });
});

describe("a hierarquia de títulos da ficha não salta níveis", () => {
  const niveis = () => screen.getAllByRole("heading").map((h) => Number(h.tagName.slice(1)));
  const semSaltos = (n: number[]) => n.every((v, i) => i === 0 || v <= n[i - 1] + 1);

  it("pessoa: o nome é o único h2, o título do passo é h3 e não há h4 sem h3 antes", () => {
    montar(lead());
    expect(niveis().filter((n) => n === 2)).toHaveLength(1);
    // Em Por contactar o guia é o de sempre (um só passo): tem pelo menos um título h3, sem saltos de nível.
    expect(niveis().filter((n) => n === 3).length).toBeGreaterThan(0);
    expect(semSaltos(niveis())).toBe(true);
  });

  it("negócio aberto: sem saltos de nível", () => {
    const n = negocioBase("n1", { pessoaId: "a", pessoa: "Pedro Lopes", servico: "WC social", comercial: "Ana Ribeiro", estadoReal: "aberto", contacto: { telefone: "927 118 300", email: null } });
    montar(resumoBase(pessoa(), [n], HOJE, "lead", registosBase({ contactos: [contactoBase()] })), { negocioInicial: "n1" });
    expect(niveis().filter((x) => x === 2)).toHaveLength(1);
    expect(semSaltos(niveis())).toBe(true);
  });

  it("o foco inicial continua no nome", () => {
    montar(lead());
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: /Pedro Lopes/ }));
  });
});

describe("os painéis em linha levam o utilizador até eles", () => {
  it("«Alterar prazo» abre o painel Adiar e rola até ele", () => {
    const rolar = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    try {
      montar(resumoBase(pessoa({ campanha: "Verão" }), [], HOJE, "lead", registosBase({ contactos: [] })));
      rolar.mockClear();
      fireEvent.click(within(guia()).getByRole("button", { name: "Alterar prazo" }));
      const painel = screen.getByRole("region", { name: /Adiar/i });
      expect(rolar.mock.contexts).toContain(painel);
    } finally {
      rolar.mockRestore();
    }
  });

  it("o painel Encerrar do menu Mais rola até ele", () => {
    const rolar = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    try {
      montar(lead());
      rolar.mockClear();
      abrirMais();
      fireEvent.click(screen.getByRole("menuitem", { name: "Encerrar abordagem" }));
      expect(rolar.mock.contexts.some((c) => (c as HTMLElement).tagName === "SECTION" && (c as HTMLElement).id.endsWith("-encerrar"))).toBe(true);
    } finally {
      rolar.mockRestore();
    }
  });
});

describe("as teclas [ e ]", () => {
  it("passam à pessoa seguinte", () => {
    const props = montar(lead());
    fireEvent.keyDown(document.body, { key: "]" });
    expect(props.aoIrPara).toHaveBeenCalledWith("y");
  });
});
