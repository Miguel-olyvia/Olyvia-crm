// As secções novas das Definições da V2 no ecrã: Funil e pontuação, Agenda, Marketing e Plataforma.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "../motor";
import { DefinicoesV2 } from "./DefinicoesV2";
import { esquecerDefinicoes, lerDefinicoes } from "./definicoesDados";
import { INDICE, SECOES } from "./definicoesIndice";

afterEach(cleanup);
beforeEach(() => esquecerDefinicoes());

function pagina(S: Estado = seed()) {
  const run = (fn: () => void) => fn();
  return render(<DefinicoesV2 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" repor={vi.fn()} />);
}
const direcao = (): Estado => { const S = seed(); S.role = "direcao"; return S; };
const bloco = (id: string): HTMLElement => document.getElementById(id)!.parentElement as HTMLElement;
const lead = (nome: string): HTMLElement => within(screen.getByRole("list", { name: "Leads de exemplo" })).getByRole("listitem", { name: nome });

describe("Definições V2 · secções novas", () => {
  it("cada secção nova tem âncora, link em 'Nesta página' e '?'", () => {
    pagina();
    const nav = screen.getByRole("navigation", { name: "Nesta página" });
    for (const [id, t, ajuda] of [["funil", "Funil e pontuação", "Funil e pontuação das leads"], ["agenda", "Agenda", "Agenda"], ["marketing", "Marketing", "Marketing"]]) {
      expect(document.getElementById(id)).not.toBeNull();
      expect(within(nav).getByRole("link", { name: t })).toHaveAttribute("href", `#${id}`);
      fireEvent.click(screen.getByRole("button", { name: `Ajuda: ${ajuda}` }));
      expect(screen.getByRole("button", { name: `Ajuda: ${ajuda}` })).toHaveAttribute("aria-expanded", "true");
    }
  });

  it("o funil: cada fase avança por uma escolha, lida como frase, e o Experimentar acompanha", () => {
    pagina();
    expect(screen.getByText(/Entra como Por contactar quando/)).toBeInTheDocument();
    expect(lead("Paulo Antunes")).toHaveTextContent("Fica em Contacto");
    const quando = screen.getByRole("combobox", { name: "Quando passa a Contacto" });
    expect(quando).toHaveDisplayValue("houver chamada registada");
    fireEvent.change(quando, { target: { value: "email_respondido" } });
    expect(lerDefinicoes().avanco[1]).toBe("email_respondido");
    expect(lead("Paulo Antunes")).toHaveTextContent("Fica em Por contactar");
  });

  it("a pontuação: regras com listas, juntar e tirar, e os pontos no Experimentar", () => {
    pagina();
    const regras = screen.getByRole("list", { name: "Regras de pontuação" });
    expect(within(regras).getAllByRole("listitem")).toHaveLength(5);
    expect(within(regras).getByRole("listitem", { name: "Se Origem é Indicação → +20 pontos" })).toBeInTheDocument();
    expect(lead("Teresa Gomes")).toHaveTextContent("50 pontos · SQL");

    fireEvent.change(screen.getByRole("combobox", { name: "Pontos da regra 1" }), { target: { value: "-10" } });
    expect(lerDefinicoes().regrasPontos[0].pontos).toBe(-10);
    expect(lead("Teresa Gomes")).toHaveTextContent("20 pontos · MQL");

    // mudar o campo põe o primeiro valor desse campo
    fireEvent.change(screen.getByRole("combobox", { name: "Campo da regra 1" }), { target: { value: "servico" } });
    expect(lerDefinicoes().regrasPontos[0]).toMatchObject({ campo: "servico", valor: "Casa de banho" });

    fireEvent.click(screen.getByRole("button", { name: /^Tirar a regra: Se Zona é Mais de 30 km/ }));
    fireEvent.click(screen.getByRole("button", { name: "Juntar regra" }));
    expect(lerDefinicoes().regrasPontos).toHaveLength(5);
    expect(lerDefinicoes().regrasPontos.at(-1)).toMatchObject({ id: "r5", campo: "origem" });
  });

  it("os limiares MQL e SQL mudam com mais/menos e o MQL não passa o SQL", () => {
    pagina();
    const mais = screen.getByRole("button", { name: "Mais · Pronta para o marketing (MQL) a partir de" });
    for (let i = 0; i < 6; i++) fireEvent.click(mais);
    expect(lerDefinicoes().limiares).toEqual({ mql: 40, sql: 40 });
    expect(lead("Paulo Antunes")).toHaveTextContent("Por qualificar");
  });

  it("a agenda: quadros com cor só no ícone e quem vê, recursos com dias, regras de marcação", () => {
    pagina();
    const quadros = screen.getByRole("list", { name: "Quadros" });
    expect(within(quadros).getAllByRole("listitem")).toHaveLength(3);
    fireEvent.change(screen.getByRole("combobox", { name: "Quem vê Obras" }), { target: { value: "direcao" } });
    expect(lerDefinicoes().quadros[1].quemVe).toBe("direcao");
    fireEvent.change(screen.getByRole("combobox", { name: "Cor de Obras" }), { target: { value: "Roxo" } });
    const linha = within(quadros).getAllByRole("listitem")[1];
    expect(linha.querySelector("svg")!.getAttribute("class")).toMatch(/text-violet-600/);
    const nome = within(linha).getByRole("textbox", { name: "Nome do quadro" });
    fireEvent.change(nome, { target: { value: "Obras em curso" } });
    fireEvent.blur(nome);
    expect(lerDefinicoes().quadros[1].nome).toBe("Obras em curso");
    fireEvent.click(screen.getByRole("button", { name: "Juntar quadro" }));
    expect(lerDefinicoes().quadros).toHaveLength(4);

    const dias = screen.getByRole("group", { name: "Dias de Rebarbadora de parede" });
    fireEvent.click(within(dias).getByRole("button", { name: "terça" }));
    expect(lerDefinicoes().recursos[3].dias[1]).toBe(true);
    expect(within(bloco("agenda-recursos")).getByText("Seg, Ter, Qua, Sex")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mais · Duração · Visita de levantamento" }));
    expect(lerDefinicoes().marcacao.duracoes[0].minutos).toBe(75);
    expect(screen.getByText("1 h 15 min")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("group", { name: "Antecedência mínima" })).getByRole("button", { name: "2 horas" }));
    expect(lerDefinicoes().marcacao.antecedencia).toBe("2 horas");
    fireEvent.change(screen.getByRole("combobox", { name: "Começa às" }), { target: { value: "19:00" } });
    expect(lerDefinicoes().marcacao).toMatchObject({ inicio: "19:00", fim: "19:30" });
  });

  it("marketing: os cinco tipos de canal com as origens e se são pagos", () => {
    pagina();
    const canais = screen.getByRole("list", { name: "Tipos de canal" });
    expect(within(canais).getAllByRole("listitem")).toHaveLength(5);
    expect(within(canais).getByText("Meta Ads, TikTok Ads")).toBeInTheDocument();
    const parcerias = screen.getByRole("switch", { name: "Parcerias é pago" });
    expect(parcerias).toHaveAttribute("aria-checked", "false");
    fireEvent.click(parcerias);
    expect(lerDefinicoes().canalPago.Parcerias).toBe(true);
    expect(screen.getByRole("switch", { name: "Parcerias é pago" })).toHaveAttribute("aria-checked", "true");
  });

  it("a Plataforma só aparece a quem vê como Direção, com a nota e a lista única", () => {
    pagina();
    expect(document.getElementById("plataforma")).toBeNull();
    expect(screen.queryByRole("link", { name: "Plataforma" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar nas Definições" }), { target: { value: "rgpd" } });
    expect(screen.getByText("Nada com esse nome nas Definições.")).toBeInTheDocument();
    cleanup();

    const { container } = pagina(direcao());
    for (const s of SECOES) expect(container.querySelector(`#${s.id}`), s.id).not.toBeNull();
    for (const e of INDICE) expect(container.querySelector(`#${e.ancora}`), e.ancora).not.toBeNull();
    expect(screen.getByText(/Só para o administrador da Olyvia/)).toBeInTheDocument();
    const lista = screen.getByRole("list", { name: "Registo da plataforma" });
    const itens = within(lista).getAllByRole("listitem");
    expect(itens.length).toBeGreaterThanOrEqual(3);
    for (const t of ["Acesso de suporte", "Entrada na conta", "Pedido de apagamento (RGPD)"]) expect(within(lista).getAllByText(new RegExp(t.replace(/[()]/g, "\\$&"))).length).toBeGreaterThan(0);
    expect(within(lista).queryAllByRole("button")).toHaveLength(0);
  });

  it("com as secções novas continua a haver um só botão primário, sem separadores nem diálogos", () => {
    const { container } = pagina(direcao());
    const primarios = [...container.querySelectorAll("button")].filter((b) => /(^|\s)bg-primary(\s|$)/.test(b.className) && !b.hasAttribute("aria-pressed") && b.getAttribute("role") !== "switch");
    expect(primarios).toHaveLength(1);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
