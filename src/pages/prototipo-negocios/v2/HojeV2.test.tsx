// O Hoje da V2 no ecrã: a lista única por papel, os contadores que filtram, a visita e a tarefa na linha, a semana, os alertas,
// a equipa (Direção), o Financeiro e o Armazém, e as regras de desenho (um só primário, texto ≥ 15 px, cor só nos ícones).
import { useMemo, useReducer } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado, type Papel } from "../motor";
import { esquecerDiaADia } from "../diaADia";
import { HojeV2 } from "./HojeV2";
import { esquecerHojeV2 } from "./hojeV2Store";

function Raiz({ S }: { S: Estado }) {
  const [, redesenhar] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void): void => { fn(); redesenhar(); };
  const A = useMemo(() => acoes(S, vi.fn(), run), [S]);
  return <HojeV2 S={S} A={A} run={run} go={(fn) => () => run(fn)} q="" repor={vi.fn()} />;
}

function pagina(role: Papel = "comercial"): Estado {
  const S = seed(); S.role = role; S.view = "hoje";
  render(<Raiz S={S} />);
  return S;
}
const lista = (): HTMLElement => screen.getByRole("list", { name: /^(Para tratar|Contactar|Visitas|Tarefas para hoje|Faturas por registar)/ });
const linhaDe = (nome: string): HTMLElement => within(lista()).getAllByRole("listitem").find((li) => li.querySelector("p")?.textContent?.startsWith(nome))!;
const chip = (nome: RegExp): HTMLElement => within(screen.getByRole("group", { name: "Mostrar na lista" })).getByRole("button", { name: nome });

beforeEach(() => { esquecerHojeV2(); esquecerDiaADia(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Hoje V2 · Comercial", () => {
  it("uma só lista, cada pessoa uma vez, com a razão em texto; o HojeSimples não aparece", () => {
    pagina();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Rúben$/);
    expect(screen.getByText("Tem 16 coisas para tratar, 1 com atraso e 3 perguntas de clientes.")).toBeInTheDocument();
    expect(screen.queryByText("Comece por aqui")).not.toBeInTheDocument();
    expect(within(lista()).getAllByRole("listitem").filter((li) => li.parentElement === lista())).toHaveLength(16);
    expect(linhaDe("Ana Martins")).toHaveTextContent("Sem contacto há 10 dias");
    expect(linhaDe("Carla Nunes")).toHaveTextContent("Também: Proposta enviada há 5 dias");
  });
  it("os contadores filtram a lista aqui mesmo (aria-pressed) e o filtro é anunciado", async () => {
    pagina();
    fireEvent.click(chip(/^Contactar 7/));
    expect(chip(/^Contactar 7/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("list", { name: "Contactar" }).querySelectorAll(":scope > li")).toHaveLength(7);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Lista filtrada por Contactar: 7"));
    fireEvent.click(chip(/^Tudo 19/));
    expect(lista().querySelectorAll(":scope > li")).toHaveLength(16);
  });
  it("marcar a visita na linha: dia e hora em chips, Guardar; a pessoa passa a Visitas e entra na agenda", async () => {
    pagina();
    const abrir = within(linhaDe("Inês Carvalho")).getByRole("button", { name: "Marcar visita: Inês Carvalho" });
    fireEvent.click(abrir);
    expect(abrir).toHaveAttribute("aria-expanded", "true");
    const editor = screen.getByRole("group", { name: "Marcar visita: Inês Carvalho" });
    const guardar = within(editor).getByRole("button", { name: "Guardar" });
    expect(guardar).toBeDisabled();
    fireEvent.click(within(editor).getByRole("button", { name: "qua 14/10" }));
    fireEvent.click(within(editor).getByRole("button", { name: "11:00" }));
    expect(within(editor).getByRole("button", { name: "qua 14/10" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(guardar);
    expect(screen.queryByRole("group", { name: "Marcar visita: Inês Carvalho" })).not.toBeInTheDocument();
    expect(linhaDe("Inês Carvalho")).toHaveTextContent("Visita marcada qua 14/10 · 11:00");
    expect(chip(/^Visitas 3/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Visita marcada: Inês Carvalho, qua 14/10 às 11:00. Pessoa de exemplo"));
    fireEvent.click(within(screen.getByRole("group", { name: "Escolher o dia" })).getByRole("button", { name: /^qua 14\/10/ }));
    expect(screen.getByRole("list", { name: "Agenda de qua 14/10" })).toHaveTextContent("Inês Carvalho");
  });
  it("com o Contacto completo, Guardar usa o motor e o negócio passa a Visita", () => {
    const S = seed(); S.role = "comercial";
    S.deals.find((d) => d.id === 1038)!.f.presentes = "O cliente";
    render(<Raiz S={S} />);
    fireEvent.click(within(linhaDe("Manuel Costa")).getByRole("button", { name: "Marcar visita: Manuel Costa" }));
    const editor = screen.getByRole("group", { name: "Marcar visita: Manuel Costa" });
    expect(editor).toHaveTextContent("Ao guardar, o negócio passa a Visita");
    fireEvent.click(within(editor).getByRole("button", { name: "seg 12/10" }));
    fireEvent.click(within(editor).getByRole("button", { name: "09:30" }));
    fireEvent.click(within(editor).getByRole("button", { name: "Guardar" }));
    expect(S.deals.find((d) => d.id === 1038)!.fase).toBe(2);
    expect(linhaDe("Manuel Costa")).toHaveTextContent("Visita seg 12/10 · 09:30");
  });
  it("+ Tarefa: escolher o quê e quando; fica na linha da pessoa; Feita tira-a", async () => {
    pagina();
    fireEvent.click(within(linhaDe("Ana Martins")).getByRole("button", { name: "Tarefa para Ana Martins" }));
    const editor = screen.getByRole("group", { name: "Nova tarefa: Ana Martins" });
    fireEvent.click(within(editor).getByRole("button", { name: "Ligar" }));
    fireEvent.click(within(editor).getByRole("button", { name: "Amanhã" }));
    fireEvent.click(within(editor).getByRole("button", { name: "Guardar" }));
    expect(linhaDe("Ana Martins")).toHaveTextContent("Tarefa: Ligar · amanhã (11/10)");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Tarefa criada: Ligar, Ana Martins, para amanhã (11/10)."));
    fireEvent.click(screen.getByRole("button", { name: "Marcar como feita: Ligar, Ana Martins" }));
    expect(linhaDe("Ana Martins")).not.toHaveTextContent("Tarefa: Ligar");
  });
  it("Outro…: pede um texto curto com rótulo; uma tarefa para hoje põe a pessoa no topo", () => {
    pagina();
    fireEvent.click(within(linhaDe("Rita Sousa")).getByRole("button", { name: "Tarefa para Rita Sousa" }));
    const editor = screen.getByRole("group", { name: "Nova tarefa: Rita Sousa" });
    fireEvent.click(within(editor).getByRole("button", { name: "Outro…" }));
    fireEvent.click(within(editor).getByRole("button", { name: "Hoje" }));
    expect(within(editor).getByRole("button", { name: "Guardar" })).toBeDisabled();
    fireEvent.change(within(editor).getByLabelText("Qual?"), { target: { value: "Pedir fotos da cozinha" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Guardar" }));
    const primeira = lista().querySelector(":scope > li")!;
    expect(primeira).toHaveTextContent("Rita Sousa");
    expect(primeira).toHaveTextContent("Tarefa para hoje: Pedir fotos da cozinha");
    expect(chip(/^Tarefas para hoje 1/)).toBeInTheDocument();
  });
  it("só um editor aberto (um só botão primário); Esc fecha e devolve o foco ao botão", () => {
    pagina();
    fireEvent.click(within(linhaDe("Ana Martins")).getByRole("button", { name: "Tarefa para Ana Martins" }));
    fireEvent.click(within(linhaDe("Pedro Lopes")).getByRole("button", { name: "Marcar visita: Pedro Lopes" }));
    expect(screen.getAllByRole("button", { name: "Guardar" })).toHaveLength(1);
    const editor = screen.getByRole("group", { name: "Marcar visita: Pedro Lopes" });
    fireEvent.keyDown(within(editor).getByRole("button", { name: "seg 12/10" }), { key: "Escape" });
    expect(screen.queryAllByRole("button", { name: "Guardar" })).toHaveLength(0);
    expect(document.activeElement).toBe(within(linhaDe("Pedro Lopes")).getByRole("button", { name: "Marcar visita: Pedro Lopes" }));
  });
  it("a faixa da semana filtra a agenda", () => {
    pagina();
    const dias = screen.getByRole("group", { name: "Escolher o dia" });
    expect(screen.getByRole("list", { name: "Agenda" }).querySelectorAll(":scope > li")).toHaveLength(2);
    fireEvent.click(within(dias).getByRole("button", { name: /^qui 15\/10: 1 compromisso/ }));
    expect(within(dias).getByRole("button", { name: /^qui 15\/10/ })).toHaveAttribute("aria-pressed", "true");
    const ag = screen.getByRole("list", { name: "Agenda de qui 15/10" });
    expect(ag.querySelectorAll(":scope > li")).toHaveLength(1);
    expect(ag).toHaveTextContent("Luísa Freitas");
    fireEvent.click(within(dias).getByRole("button", { name: /^Hoje, sáb 10\/10/ }));
    expect(screen.getByText("Nada marcado para sáb 10/10.")).toBeInTheDocument();
  });
  it("o alerta dos atrasos abre Negócios já com o filtro Com atraso", () => {
    const S = pagina();
    fireEvent.click(screen.getByRole("button", { name: /^Ver com o filtro: Negócios com atraso/ }));
    expect(S.view).toBe("negocios");
    expect(S.filtro).toBe("atraso");
  });
  it("regras de desenho: texto ≥ 15 px, alvos de 44 px, cor só nos ícones", () => {
    const { container } = render(<Raiz S={(() => { const S = seed(); S.role = "comercial"; return S; })()} />);
    expect(container.querySelectorAll('[class*="text-xs"], [class*="text-sm"]')).toHaveLength(0);
    for (const el of container.querySelectorAll('[class*="text-primary"], [class*="text-destructive"], [class*="text-warning"]')) expect(el.tagName.toLowerCase()).toBe("svg");
    for (const b of container.querySelectorAll("button")) expect(b.className).toMatch(/min-h-11|h-11/);
  });
});

describe("Hoje V2 · outros papéis", () => {
  it("Direção: a equipa numa tabela, com um botão para os negócios do comercial", () => {
    const S = pagina("direcao");
    const tabela = screen.getByRole("table");
    expect(within(tabela).getByRole("rowheader", { name: "Rúben" })).toBeInTheDocument();
    expect(within(tabela).getAllByRole("columnheader").map((c) => c.textContent)).toContain("Orçamentos por enviar");
    fireEvent.click(screen.getByRole("button", { name: "Ver os negócios de Rúben" }));
    expect([S.view, S.filtro]).toEqual(["negocios", "meus"]);
  });
  it("Financeiro: Faturas por registar e Pagamentos por validar, com o passo na linha", () => {
    pagina("financeiro");
    expect(chip(/^Faturas por registar 1/)).toBeInTheDocument();
    expect(chip(/^Pagamentos por validar 0/)).toBeInTheDocument();
    fireEvent.click(chip(/^Pagamentos por validar 0/));
    expect(screen.getByText("Nada em Pagamentos por validar.")).toBeInTheDocument();
    fireEvent.click(chip(/^Faturas por registar 1/));
    expect(within(lista()).getByRole("button", { name: "Registar fatura" })).toBeInTheDocument();
  });
  it("Armazém: os números do Inventário e o caminho para lá", () => {
    const S = pagina("armazem");
    expect(screen.getByRole("heading", { name: "Inventário" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir o Inventário" }));
    expect(S.view).toBe("inventario");
  });
  it("Operações: a obra em curso na lista e na agenda de hoje", () => {
    pagina("operacoes");
    expect(chip(/^Obras em curso 1/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Agenda" })).toHaveTextContent("Marta Lima");
  });
});

describe("Hoje V2 · perguntas do cliente", () => {
  const perguntas = (): HTMLElement => screen.getByRole("list", { name: "Perguntas do cliente" });
  const linhaP = (nome: string): HTMLElement => within(perguntas()).getAllByRole("listitem").find((li) => li.querySelector("p")?.textContent === nome)!;

  it("o Comercial vê as perguntas com a mensagem inteira, de onde vieram e o contacto; o contador Perguntas filtra", async () => {
    pagina();
    expect(chip(/^Perguntas 3/)).toHaveAttribute("aria-pressed", "false");
    const carla = linhaP("Carla Nunes");
    expect(carla).toHaveTextContent("A bancada em pedra que está na proposta é em granito ou em quartzo? E o preço já inclui a retirada da bancada antiga?");
    expect(carla).toHaveTextContent("Portal do cliente · Proposta");
    expect(carla).toHaveTextContent("Email carla.nunes@exemplo.pt · WhatsApp 938 101 777");
    fireEvent.click(chip(/^Perguntas 3/));
    expect(within(perguntas()).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByRole("list", { name: "Para tratar" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Lista filtrada por Perguntas: 3"));
  });
  it("2 cliques: uma resposta rápida e Enviar; a pergunta sai da lista e fica 'Respondida há instantes'", async () => {
    const { container } = render(<Raiz S={(() => { const S = seed(); S.role = "comercial"; return S; })()} />);
    fireEvent.click(within(linhaP("Sérgio Pinto")).getByRole("button", { name: "Vou confirmar e respondo hoje" }));
    const editor = screen.getByRole("group", { name: "Responder a Sérgio Pinto" });
    expect(within(editor).getByRole("button", { name: /^Email · sergio.pinto@exemplo.pt/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(editor).getByRole("button", { name: /^WhatsApp · 919 440 222/ })).toHaveAttribute("aria-pressed", "false");
    expect(editor).toHaveTextContent("Vai enviar: “Olá Sérgio, obrigado pela pergunta.");
    const prim = [...container.querySelectorAll("button")].filter((b) => /(^|\s)bg-primary(\s|$)/.test(b.className));
    expect(prim.map((b) => b.textContent)).toEqual(["Enviar"]);
    fireEvent.click(within(editor).getByRole("button", { name: "Enviar" }));
    expect(within(perguntas()).queryByText("Sérgio Pinto")).toBeNull();
    expect(screen.getByRole("list", { name: "Perguntas respondidas" })).toHaveTextContent("Sérgio Pinto · Respondida há instantes por Email (sergio.pinto@exemplo.pt)");
    expect(chip(/^Perguntas 2/)).toBeInTheDocument();
    expect(chip(/^Tudo 18/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Resposta enviada a Sérgio Pinto por Email"));
  });
  it("escrever outra: um texto curto, com rótulo; o canal muda para WhatsApp; Esc fecha e devolve o foco", () => {
    pagina();
    fireEvent.click(within(linhaP("Marta Lima")).getByRole("button", { name: "Escrever outra" }));
    const editor = screen.getByRole("group", { name: "Responder a Marta Lima" });
    const enviar = within(editor).getByRole("button", { name: "Enviar" });
    expect(enviar).toBeDisabled();
    fireEvent.change(within(editor).getByLabelText("A sua resposta (curta)"), { target: { value: "Deixe com a vizinha, nós passamos lá às 8h30." } });
    fireEvent.click(within(editor).getByRole("button", { name: /^WhatsApp/ }));
    expect(enviar).toBeEnabled();
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Responder a Marta Lima" })).toBeNull();
    expect(document.activeElement).toBe(within(linhaP("Marta Lima")).getByRole("button", { name: "Vou confirmar e respondo hoje" }));
  });
  it("só um editor aberto: abrir a resposta fecha a tarefa", () => {
    pagina();
    fireEvent.click(within(linhaDe("Ana Martins")).getByRole("button", { name: "Tarefa para Ana Martins" }));
    expect(screen.getByRole("group", { name: "Nova tarefa: Ana Martins" })).toBeInTheDocument();
    fireEvent.click(within(linhaP("Carla Nunes")).getByRole("button", { name: "Ligo-lhe para explicar" }));
    expect(screen.queryByRole("group", { name: "Nova tarefa: Ana Martins" })).toBeNull();
    expect(screen.getByRole("group", { name: "Responder a Carla Nunes" })).toBeInTheDocument();
  });
  it("a Direção também as vê; o Financeiro não", () => {
    pagina("direcao");
    expect(chip(/^Perguntas 3/)).toBeInTheDocument();
    cleanup();
    pagina("financeiro");
    expect(screen.queryByRole("list", { name: "Perguntas do cliente" })).toBeNull();
    expect(within(screen.getByRole("group", { name: "Mostrar na lista" })).queryByRole("button", { name: /^Perguntas/ })).toBeNull();
  });
});
