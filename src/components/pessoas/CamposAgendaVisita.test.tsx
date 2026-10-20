// CamposAgendaVisita: quadro, recursos, dia, hora (obrigatória), duração, o aviso de conflito e a morada da visita, tudo controlado por quem o usa.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { CamposAgendaVisita } from "./CamposAgendaVisita";
import { destinoInicial } from "./moradaVisita";
import type { ValorAgenda } from "./agendaVisitaForm";

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

const QUADROS = [
  { id: "q1", name: "Visitas", board_type: "visits", settings: null },
  { id: "q2", name: "Obras", board_type: null, settings: null },
];
const RECURSOS = [
  { id: "r1", name: "Rita Gomes", resource_type: "user", user_id: "u1" },
  { id: "r2", name: "Rui Costa", resource_type: "user", user_id: "u2" },
];
const LEAD = { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" };
const VALOR: ValorAgenda = { boardId: "q1", recursos: ["r1"], data: "2026-10-24", hora: "10:00", duracao: "h1" };

function montar(extra: Partial<Parameters<typeof CamposAgendaVisita>[0]> = {}) {
  const aoMudar = vi.fn();
  const aoMudarDestino = vi.fn();
  const refetch = vi.fn();
  render(
    <CamposAgendaVisita
      id="x" hoje="2026-10-20" agenda={{ quadros: QUADROS, recursos: RECURSOS, isLoading: false, isError: false, refetch }} valor={VALOR}
      aoMudar={aoMudar} erro={null} conflito={{ emConflito: [], aVerificar: false, falharam: [] }} recursoOcupado={null}
      moradaLead={LEAD} destino={destinoInicial(LEAD)} aoMudarDestino={aoMudarDestino} erroMorada={null} {...extra}
    />,
  );
  return { aoMudar, aoMudarDestino, refetch };
}

describe("CamposAgendaVisita: quadro", () => {
  it("com vários quadros é uma lista com etiqueta; escolher um muda o quadro", () => {
    const { aoMudar } = montar();
    const lista = screen.getByLabelText("Quadro da agenda");
    expect(lista).toHaveValue("q1");
    expect(within(lista).getAllByRole("option").map((o) => o.textContent)).toEqual(["Visitas", "Obras"]);
    fireEvent.change(lista, { target: { value: "q2" } });
    expect(aoMudar).toHaveBeenCalledExactlyOnceWith({ boardId: "q2" });
  });

  it("com um só quadro mostra-o em texto, sem lista para escolher", () => {
    montar({ agenda: { quadros: [QUADROS[0]], recursos: RECURSOS, isLoading: false, isError: false, refetch: vi.fn() } });
    expect(screen.queryByLabelText("Quadro da agenda", { selector: "select" })).toBeNull();
    expect(screen.getByText("Visitas", { selector: "p, span" })).toBeInTheDocument();
  });

  it("sem nenhum quadro diz que é preciso criar um na Agenda", () => {
    montar({ agenda: { quadros: [], recursos: RECURSOS, isLoading: false, isError: false, refetch: vi.fn() } });
    expect(screen.getByText(/Não há nenhum quadro de agenda/)).toBeInTheDocument();
  });

  it("o erro de quadro em falta fica ligado à lista", () => {
    montar({ erro: "quadroEmFalta" });
    const lista = screen.getByLabelText("Quadro da agenda");
    expect(lista).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Escolha o quadro da agenda onde marcar a visita.");
  });
});

describe("CamposAgendaVisita: leitura da agenda", () => {
  it("a ler: aviso em região de estado", () => {
    montar({ agenda: { quadros: [], recursos: [], isLoading: true, isError: false, refetch: vi.fn() } });
    expect(screen.getByText("A ler a agenda…").closest("[role='status']")).not.toBeNull();
  });

  it("falhou: alerta com «Tentar de novo», que volta a ler", () => {
    const refetch = vi.fn();
    montar({ agenda: { quadros: [], recursos: [], isLoading: false, isError: true, refetch } });
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível ler os quadros e os recursos da agenda.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("CamposAgendaVisita: recursos, dia, hora e duração", () => {
  it("os recursos são o seletor de chips; escolher um segue para quem usa", () => {
    const { aoMudar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Rui Costa" }));
    expect(aoMudar).toHaveBeenCalledExactlyOnceWith({ recursos: ["r1", "r2"] });
  });

  it("dia e hora escrevem-se nos campos com etiqueta; a hora vazia diz que é obrigatória", () => {
    const { aoMudar } = montar({ valor: { ...VALOR, hora: "" }, erro: "horaVazia" });
    fireEvent.change(screen.getByLabelText("Dia"), { target: { value: "2026-10-28" } });
    expect(aoMudar).toHaveBeenLastCalledWith({ data: "2026-10-28" });
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "09:30" } });
    expect(aoMudar).toHaveBeenLastCalledWith({ hora: "09:30" });
    expect(screen.getByLabelText("Hora")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Indique a hora da visita.");
  });

  it("o erro do dia usa os textos que a visita já tinha", () => {
    montar({ erro: "dataPassada" });
    expect(screen.getByLabelText("Dia")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(/anterior|passad|hoje/i);
  });

  it("a duração é uma lista com as quatro opções; mudar escolhe a chave", () => {
    const { aoMudar } = montar();
    const lista = screen.getByLabelText("Duração");
    expect(within(lista).getAllByRole("option").map((o) => o.textContent)).toEqual(["30 min", "1 h", "1 h 30", "2 h"]);
    expect(lista).toHaveValue("h1");
    fireEvent.change(lista, { target: { value: "h2" } });
    expect(aoMudar).toHaveBeenCalledExactlyOnceWith({ duracao: "h2", duracaoMinutos: undefined });
  });

  it("uma duração da base fora das quatro aparece como «45 min» e mantém-se escolhida", () => {
    montar({ valor: { ...VALOR, duracao: "", duracaoMinutos: 45 } });
    const lista = screen.getByLabelText("Duração");
    expect(within(lista).getAllByRole("option").map((o) => o.textContent)).toEqual(["30 min", "1 h", "1 h 30", "2 h", "45 min"]);
    expect(lista).toHaveValue("custom");
  });
});

describe("CamposAgendaVisita: conflito e morada", () => {
  it("há sempre uma região de estado do conflito, vazia quando não há nada a dizer (e nunca diz «disponível»)", () => {
    montar();
    const estado = screen.getByTestId("conflito-visita");
    expect(estado).toHaveAttribute("role", "status");
    expect(estado).toBeEmptyDOMElement();
  });

  it("os recursos ocupados dizem-se pelo nome, com a nota de que a base confirma ao guardar", () => {
    montar({ conflito: { emConflito: ["r2", "r1"], aVerificar: false, falharam: [] } });
    expect(screen.getByTestId("conflito-visita")).toHaveTextContent("Rui Costa, Rita Gomes já tem uma marcação ou uma ausência a essa hora");
    expect(screen.getByRole("button", { name: /Rui Costa/ })).toHaveTextContent("ocupado nesse horário");
  });

  it("o recurso que a base recusou (NG010) também fica marcado como ocupado", () => {
    montar({ recursoOcupado: "r2" });
    expect(screen.getByRole("button", { name: /Rui Costa/ })).toHaveTextContent("ocupado nesse horário");
  });

  it("se a verificação falhou, diz de que recurso não foi possível verificar (aberto: a base decide ao guardar)", () => {
    montar({ conflito: { emConflito: [], aVerificar: false, falharam: ["r2"] } });
    const aviso = screen.getByTestId("conflito-visita");
    expect(aviso).toHaveTextContent("Não foi possível verificar o horário de Rui Costa");
    expect(aviso).not.toHaveTextContent("já tem uma marcação");
  });

  it("um recurso ocupado e OUTRO por verificar: as duas frases, cada uma com o seu recurso (a ocupada não esconde a que falhou)", () => {
    montar({ conflito: { emConflito: ["r1"], aVerificar: false, falharam: ["r2"] } });
    const aviso = screen.getByTestId("conflito-visita");
    expect(aviso).toHaveTextContent("Rita Gomes já tem uma marcação ou uma ausência a essa hora");
    expect(aviso).toHaveTextContent("Não foi possível verificar o horário de Rui Costa");
    expect(aviso).not.toHaveTextContent("horário de Rita Gomes");
  });

  it("vários recursos por verificar dizem-se todos pelo nome", () => {
    montar({ conflito: { emConflito: [], aVerificar: false, falharam: ["r1", "r2"] } });
    expect(screen.getByTestId("conflito-visita")).toHaveTextContent("Não foi possível verificar o horário de Rita Gomes, Rui Costa");
  });

  it("uma falha de um recurso que a agenda já não lista cai na frase geral, em vez de ficar sem nome", () => {
    montar({ conflito: { emConflito: [], aVerificar: false, falharam: ["desconhecido"] } });
    expect(screen.getByTestId("conflito-visita")).toHaveTextContent("Não foi possível verificar se há conflitos de horário");
  });

  it("a verificar, diz que está a verificar", () => {
    montar({ conflito: { emConflito: [], aVerificar: true, falharam: [] } });
    expect(screen.getByTestId("conflito-visita")).toHaveTextContent("A verificar o horário…");
  });

  it("a morada da visita vem do mesmo componente que as outras páginas usam (na morada da lead ou outra)", () => {
    const { aoMudarDestino } = montar();
    expect(screen.getByRole("group", { name: "Morada da visita" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Outra morada/ }));
    expect(aoMudarDestino).toHaveBeenCalledWith(expect.objectContaining({ igualALead: false }));
  });

  it("desativado (a guardar): os campos de texto ficam só de leitura e a lista de quadro desativada, sem esconder nada", () => {
    montar({ desativado: true });
    expect(screen.getByLabelText("Dia")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Hora")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Quadro da agenda")).toBeDisabled();
    expect(screen.getByLabelText("Duração")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rui Costa" })).toHaveAttribute("aria-disabled", "true");
  });
});
