/**
 * `PipelineAdmissoes`: o separador «Pipeline de admissões» da lista de Pessoas (P4 da V3a), ligado ao hook real
 * `useAdmissoesPipeline` (simulado aqui). Os textos sao os portugueses REAIS (`tReal`).
 *
 * O que fecha:
 *  - uma linha por processo, com os DOIS selos (admissao e portal), a validade do link e a faixa de progresso;
 *  - filtros por estado (grupos) que pedem so esses estados ao hook, com o numero de cada grupo e `aria-pressed`;
 *  - o processo terminado chega mascarado: so se sabe que terminou, e nao se oferece rever;
 *  - «Rever» so com `hr.onboarding.approve`; abrir a ficha pelo nome;
 *  - carregando, vazio, erro em portugues (nunca o codigo), «Mostrar mais»;
 *  - acessibilidade: alvos de 44 px, nada so por cor, `aria-current` no passo atual, foco devolvido ao botao «Rever».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { tPt } from "./tReal";

vi.mock("@/hooks/useTranslation", async () => {
  const { tPt: t } = await import("./tReal");
  return { useTranslation: () => ({ language: "pt", t }) };
});

let permissoes: Set<string>;
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => permissoes.has(p), loading: false }),
}));

const carregarMais = vi.fn();
const recarregar = vi.fn();
let estadoHook: Record<string, unknown>;
const chamadasDoHook: Array<{ estados: string[] | null }> = [];
const ultimaChamada = () => chamadasDoHook[chamadasDoHook.length - 1];
vi.mock("@/hooks/useAdmissoesPipeline", () => ({
  LIMITE_PIPELINE: 50,
  useAdmissoesPipeline: (opcoes: { estados: string[] | null }) => {
    chamadasDoHook.push(opcoes);
    return estadoHook;
  },
}));

vi.mock("@/hooks/useRevisaoAdmissao", () => ({
  useRevisaoAdmissao: () => ({
    carregando: false,
    erro: null,
    revisao: { campos: [], niss: { preenchido: false }, iban: { preenchido: false }, anexos: [], devolucao: null, pendencias: [], eventos: [] },
    revelar: vi.fn(),
    recarregar: vi.fn(),
  }),
}));

import { PipelineAdmissoes } from "@/components/hr/admissao/PipelineAdmissoes";

const item = (n: number, sobre: Record<string, unknown> = {}) => ({
  conviteId: `c${n}`,
  pessoaId: `p${n}`,
  nome: `Pessoa ${n}`,
  cargo: "Operador de linha",
  estado: "submetida",
  estadoPortal: "ativo",
  validUntil: "2026-12-20T10:00:00Z",
  submetidoEm: "2026-12-14T09:00:00Z",
  devolvidaEm: null,
  atualizadoEm: "2026-12-14T09:00:00Z",
  ...sobre,
});

function definirHook(sobre: Record<string, unknown> = {}) {
  estadoHook = {
    itens: [item(1), item(2, { estado: "convidada", estadoPortal: "expirado", submetidoEm: null })],
    contadores: { submetida: 1, convidada: 1 },
    carregando: false,
    aCarregarMais: false,
    temMais: false,
    erro: null,
    carregarMais,
    recarregar,
    ...sobre,
  };
}

const aoAbrirFicha = vi.fn();
const montar = () => render(<PipelineAdmissoes aoAbrirFicha={aoAbrirFicha} />);
const cartaoDe = (nome: string) => screen.getByText(nome).closest("li") as HTMLElement;

beforeEach(() => {
  permissoes = new Set(["hr.onboarding.approve", "hr.pessoas.convite.enviar"]);
  chamadasDoHook.length = 0;
  carregarMais.mockReset();
  recarregar.mockReset();
  aoAbrirFicha.mockReset();
  definirHook();
});

describe("a lista", () => {
  it("uma linha por processo, com o nome, o cargo e os DOIS selos (admissao e portal)", () => {
    montar();
    const a = cartaoDe("Pessoa 1");
    expect(within(a).getByText("Operador de linha")).toBeInTheDocument();
    const admissao = within(a).getByText("Admissão").closest("li") as HTMLElement;
    const portal = within(a).getByText("Portal").closest("li") as HTMLElement;
    expect(within(admissao).getByText("Submetida")).toBeInTheDocument();
    expect(within(portal).getByText("Ativo")).toBeInTheDocument();

    const b = cartaoDe("Pessoa 2");
    expect(within((within(b).getByText("Admissão").closest("li")) as HTMLElement).getByText("Convidada")).toBeInTheDocument();
    expect(within((within(b).getByText("Portal").closest("li")) as HTMLElement).getByText("Expirado")).toBeInTheDocument();
  });

  it("diz a validade do link (ativo e expirado) e quando foi submetida", () => {
    montar();
    expect(within(cartaoDe("Pessoa 1")).getByText(/Link válido até \d\d\/\d\d\/\d{4} \d\d:\d\d/)).toBeInTheDocument();
    expect(within(cartaoDe("Pessoa 1")).getByText(/Submetida em \d\d\/\d\d\/\d{4}/)).toBeInTheDocument();
    expect(within(cartaoDe("Pessoa 2")).getByText(/O link expirou em \d\d\/\d\d\/\d{4}/)).toBeInTheDocument();
  });

  it("NAO mostra o e-mail de destino: a leitura da lista nao o traz (so a ficha o mostra)", () => {
    montar();
    expect(screen.queryByText(/Enviado para/)).not.toBeInTheDocument();
  });

  it("um cargo em falta diz-se, em vez de ficar em branco", () => {
    definirHook({ itens: [item(1, { cargo: null })] });
    montar();
    expect(within(cartaoDe("Pessoa 1")).getByText("Sem cargo definido")).toBeInTheDocument();
  });

  it("anuncia quantas admissoes mostra, no singular e no plural", () => {
    const { unmount } = montar();
    expect(screen.getByRole("status")).toHaveTextContent("2 admissões");
    unmount();
    definirHook({ itens: [item(1)] });
    montar();
    expect(screen.getByRole("status")).toHaveTextContent("1 admissão");
  });

  it("a lista tem nome acessivel e o texto de explicacao diz que nada passa para a ficha sem aprovacao", () => {
    montar();
    expect(screen.getByRole("list", { name: "Admissões" })).toBeInTheDocument();
    expect(screen.getByText(/só passam para a ficha quando o RH aprova/)).toBeInTheDocument();
  });

  it("clicar no nome abre a ficha da pessoa", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir ficha de Pessoa 2" }));
    expect(aoAbrirFicha).toHaveBeenCalledWith("p2");
  });
});

describe("a faixa de progresso", () => {
  it("marca o passo atual com aria-current e di-lo em texto (nao so por cor)", () => {
    montar();
    const faixa = within(cartaoDe("Pessoa 1")).getByRole("list", { name: "Progresso da admissão" });
    const passos = within(faixa).getAllByRole("listitem");
    expect(passos).toHaveLength(6);
    expect(passos[2]).toHaveAttribute("aria-current", "step");
    expect(passos[2]).toHaveTextContent("Aprovação do RH");
    expect(passos[2]).toHaveTextContent("em curso");
    expect(passos[0]).toHaveTextContent("feito");
    expect(passos[5]).toHaveTextContent("por fazer");
    expect(passos.filter((p) => p.getAttribute("aria-current") === "step")).toHaveLength(1);
  });

  it("uma admissao rejeitada para na aprovacao e di-lo", () => {
    definirHook({ itens: [item(1, { estado: "rejeitada", estadoPortal: "revogado" })] });
    montar();
    const faixa = within(cartaoDe("Pessoa 1")).getByRole("list", { name: "Progresso da admissão" });
    expect(within(faixa).getAllByRole("listitem")[2]).toHaveTextContent("rejeitada");
  });

  it("cancelada e terminada nao tem faixa (nao se sabe onde pararam)", () => {
    definirHook({ itens: [item(1, { estado: "cancelada", estadoPortal: "revogado" }), item(2, { estado: "terminado", estadoPortal: "revogado" })] });
    montar();
    expect(screen.queryByRole("list", { name: "Progresso da admissão" })).not.toBeInTheDocument();
  });
});

describe("filtros por estado", () => {
  it("por omissao «Todas» esta ativo e o hook pede sem filtro", () => {
    montar();
    const grupo = screen.getByRole("group", { name: "Filtrar por estado" });
    expect(within(grupo).getByRole("button", { name: /^Todas/ })).toHaveAttribute("aria-pressed", "true");
    expect(ultimaChamada()).toEqual({ estados: null });
  });

  it("cada grupo mostra o seu numero (soma dos estados) e pede so esses estados ao hook", () => {
    definirHook({ contadores: { submetida: 5, convidada: 2, em_preenchimento: 3, devolvida: 1, rejeitada: 1, cancelada: 2 } });
    montar();
    const grupo = screen.getByRole("group", { name: "Filtrar por estado" });
    expect(within(grupo).getByRole("button", { name: /Por rever.*5/ })).toBeInTheDocument();
    const comAPessoa = within(grupo).getByRole("button", { name: /Com a pessoa.*6/ });
    fireEvent.click(comAPessoa);
    expect(ultimaChamada()).toEqual({ estados: ["convidada", "em_preenchimento", "devolvida"] });
    expect(within(grupo).getByRole("button", { name: /Com a pessoa/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(grupo).getByRole("button", { name: /^Todas/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("«Por rever» pede so as submetidas e «Todas» volta a pedir tudo", () => {
    montar();
    const grupo = screen.getByRole("group", { name: "Filtrar por estado" });
    fireEvent.click(within(grupo).getByRole("button", { name: /Por rever/ }));
    expect(ultimaChamada()).toEqual({ estados: ["submetida"] });
    fireEvent.click(within(grupo).getByRole("button", { name: /^Todas/ }));
    expect(ultimaChamada()).toEqual({ estados: null });
  });

  it("o filtro ativo leva um visto alem da cor, e os alvos tem 44 px", () => {
    montar();
    const grupo = screen.getByRole("group", { name: "Filtrar por estado" });
    const botoes = within(grupo).getAllByRole("button");
    for (const b of botoes) expect(b.className).toContain("min-h-11");
    expect(botoes[0].querySelector("svg")).not.toBeNull();
    expect(botoes[1].querySelector("svg")).toBeNull();
  });

  it("um filtro sem resultados di-lo e oferece voltar a ver todas", () => {
    definirHook({ itens: [], contadores: {} });
    montar();
    fireEvent.click(within(screen.getByRole("group", { name: "Filtrar por estado" })).getByRole("button", { name: /Concluídas/ }));
    expect(screen.getByText("Nenhuma admissão neste estado.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver todas" }));
    expect(ultimaChamada()).toEqual({ estados: null });
  });
});

describe("a mascara dos terminados", () => {
  beforeEach(() => {
    definirHook({
      itens: [item(9, { estado: "terminado", estadoPortal: "revogado", validUntil: null, submetidoEm: null, cargo: null })],
    });
  });

  it("so se sabe que terminou: selo «Terminada», sem datas, e di-lo", () => {
    montar();
    const c = cartaoDe("Pessoa 9");
    expect(within(c).getByText("Terminada")).toBeInTheDocument();
    expect(within(c).getByText(/Processo terminado/)).toBeInTheDocument();
    expect(within(c).queryByText(/Submetida em/)).not.toBeInTheDocument();
  });

  it("nao oferece rever, mesmo com hr.onboarding.approve", () => {
    montar();
    expect(screen.queryByRole("button", { name: /Rever a admissão/ })).not.toBeInTheDocument();
  });
});

describe("«Rever» e as permissoes", () => {
  it("com hr.onboarding.approve cada processo tem «Rever»", () => {
    montar();
    expect(screen.getByRole("button", { name: "Rever a admissão de Pessoa 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rever a admissão de Pessoa 2" })).toBeInTheDocument();
  });

  it("sem hr.onboarding.approve nao ha «Rever» (a base recusaria com HRA31)", () => {
    permissoes = new Set(["hr.pessoas.convite.enviar"]);
    montar();
    expect(screen.queryByRole("button", { name: /Rever a admissão/ })).not.toBeInTheDocument();
    expect(screen.getByText("Pessoa 1")).toBeInTheDocument();
  });

  it("o botao «Rever» tem alvo de 44 px e abre a revisao desse processo, devolvendo o foco ao fechar", async () => {
    montar();
    const botao = screen.getByRole("button", { name: "Rever a admissão de Pessoa 1" });
    expect(botao.className).toContain("min-h-11");
    botao.focus();
    fireEvent.click(botao);
    const dialogo = screen.getByRole("dialog", { name: "Rever a admissão de Pessoa 1" });
    expect(dialogo).toBeInTheDocument();
    fireEvent.click(within(dialogo).getAllByRole("button", { name: "Fechar" })[0]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(botao).toHaveFocus());
  });
});

describe("estados do ecra", () => {
  it("a carregar: diz-o e nao mostra «vazio»", () => {
    definirHook({ itens: [], carregando: true });
    montar();
    expect(screen.getByText("A carregar as admissões…")).toBeInTheDocument();
    expect(screen.queryByText(/Não há admissões/)).not.toBeInTheDocument();
  });

  it("sem processos: diz que nao ha admissoes em curso", () => {
    definirHook({ itens: [], contadores: {} });
    montar();
    expect(screen.getByText("Não há admissões nesta organização.")).toBeInTheDocument();
  });

  it.each([
    ["nao_encontrado", tPt("hr.convite.erro.naoEncontrado")],
    ["organizacao_nao_empregadora", tPt("hr.convite.erro.organizacaoNaoEmpregadora")],
    ["limite_excedido", tPt("hr.convite.erro.limiteExcedido")],
    [null, tPt("rhAdm.erro.generico")],
  ])("erro %s: texto em portugues, em role=alert, nunca o codigo; «Tentar novamente» recarrega", (codigo, texto) => {
    definirHook({ itens: [], erro: { codigo } });
    montar();
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(texto);
    if (codigo) expect(alerta).not.toHaveTextContent(codigo);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("«Mostrar mais» so aparece havendo mais, pede a pagina seguinte e fica desligado enquanto carrega", () => {
    const { unmount } = montar();
    expect(screen.queryByRole("button", { name: "Mostrar mais" })).not.toBeInTheDocument();
    unmount();
    definirHook({ temMais: true });
    const { unmount: u2 } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar mais" }));
    expect(carregarMais).toHaveBeenCalledTimes(1);
    u2();
    definirHook({ temMais: true, aCarregarMais: true });
    montar();
    expect(screen.getByRole("button", { name: "A carregar…" })).toHaveAttribute("aria-disabled", "true");
  });
});
