// O passo «marcar visita» da chamada na ficha REAL (gerirVisitas): em vez do dia, hora e morada do exemplo mostra a agenda da base (quadro, recursos,
// dia, hora obrigatória, duração, conflito) e a morada, e entrega a visita completa a `registarChamada`. O exemplo (sem capacidades) não muda.
// Os hooks da base estão simulados: nunca se chama a base.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
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
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

const R1 = "11111111-1111-4111-8111-111111111111";
const estado = vi.hoisted(() => ({
  agenda: null as unknown,
  agendaArgs: [] as unknown[][],
  conflito: { emConflito: [] as string[], aVerificar: false, falharam: [] },
}));
vi.mock("@/hooks/pessoas/useAgendaVisita", () => ({ useAgendaVisita: (...a: unknown[]) => { estado.agendaArgs.push(a); return estado.agenda; } }));
vi.mock("@/hooks/pessoas/useConflitoVisita", () => ({ useConflitoVisita: () => estado.conflito }));

import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import { FormChamada } from "./FormChamada";
import { pessoaBase, registosBase, resumoBase, visitaPessoaBase } from "./fabricaTestes";
import type { AcoesFicha } from "./PainelBase";

beforeAll(prepararRadixNoJsdom);

const QUADROS = [{ id: "q1", name: "Visitas", board_type: "visits", settings: null }];
const RECURSOS = [{ id: R1, name: "Rita Gomes", resource_type: "user", user_id: "u1" }];
const MORADA = { linha: "Rua A 1", cp: "1000-001", localidade: "Lisboa" };

beforeEach(() => {
  estado.agenda = { quadros: QUADROS, recursos: RECURSOS, isLoading: false, isError: false, refetch: vi.fn(), omissao: { boardId: "q1", recursoId: R1 } };
  estado.agendaArgs.length = 0;
  estado.conflito = { emConflito: [], aVerificar: false, falharam: [] };
});

const CAPACIDADES_REAIS = { chamada: true, encerrar: true, adiar: true, nota: true, visita: true, negocios: true, gerirVisitas: true };

function montar(extra: { acoes?: Partial<AcoesFicha>; visitas?: ReturnType<typeof visitaPessoaBase>[] } = {}) {
  const pessoa = pessoaBase("a", { nome: "Ana Lopes", morada: MORADA });
  const registarChamada = vi.fn().mockResolvedValue(undefined);
  const acoes = { registarChamada, capacidades: CAPACIDADES_REAIS, responsavelUserId: "u1", ...extra.acoes } as unknown as AcoesFicha;
  const aoConcluir = vi.fn();
  render(
    <FormChamada
      id="c" pessoa={pessoa} resumo={resumoBase(pessoa, [], "2026-10-20", "lead", registosBase({ visitas: extra.visitas ?? [] }))} hoje="2026-10-20"
      acoes={acoes} aoFechar={vi.fn()} aoConcluir={aoConcluir}
    />,
  );
  return { registarChamada, aoConcluir };
}
// O formulário ligado à base carrega-se à parte (import dinâmico): espera-se por ele.
const escolherInteressado = async () => fireEvent.click(await screen.findByRole("radio", { name: /Atendeu · interessado/ }));
const guardar = () => fireEvent.click(screen.getByRole("button", { name: /^Guardar/ }));

describe("FormChamada na ficha real: passo «marcar visita»", () => {
  it("mostra a agenda da base (quadro, recursos, dia, hora, duração) e lê a agenda pelo responsável da pessoa", async () => {
    montar();
    await escolherInteressado();
    expect(screen.getByLabelText("Duração")).toHaveValue("h1");
    expect(screen.getByRole("button", { name: "Rita Gomes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Dia")).toHaveValue("2026-10-21");
    expect(screen.getByLabelText("Hora")).toHaveValue("10:00");
    expect(estado.agendaArgs.at(-1)).toEqual(["u1"]);
  });

  it("guardar entrega a visita completa a registarChamada (levantamento, título com o nome, quadro e recursos), com o dia e a hora da agenda", async () => {
    const { registarChamada, aoConcluir } = montar();
    await escolherInteressado();
    fireEvent.change(screen.getByLabelText("Dia"), { target: { value: "2026-10-24" } });
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "15:30" } });
    guardar();
    await waitFor(() => expect(registarChamada).toHaveBeenCalledTimes(1));
    const [pessoaId, dados] = registarChamada.mock.calls[0];
    expect(pessoaId).toBe("a");
    expect(dados).toMatchObject({ passo: "marcarVisita", resultado: "atendeuInteressado", data: "2026-10-24", hora: "15:30" });
    expect(dados.visita).toMatchObject({
      boardId: "q1", recursos: [R1], data: "2026-10-24", hora: "15:30", duracao: "h1", tipo: "levantamento", titulo: "Levantamento · Ana Lopes", igualALead: true,
    });
    expect(dados.visita).not.toHaveProperty("negocioId");
    await waitFor(() => expect(aoConcluir).toHaveBeenCalledTimes(1));
  });

  it("a pessoa que já tem uma visita não cancelada leva uma revisita", async () => {
    const { registarChamada } = montar({ visitas: [visitaPessoaBase("v1", { pessoaId: "a", estado: "feita" })] });
    await escolherInteressado();
    guardar();
    await waitFor(() => expect(registarChamada).toHaveBeenCalled());
    expect(registarChamada.mock.calls[0][1].visita).toMatchObject({ tipo: "revisita", titulo: "Revisita · Ana Lopes" });
  });

  it("a visita cancelada não conta: continua a ser um levantamento", async () => {
    const { registarChamada } = montar({ visitas: [visitaPessoaBase("v1", { pessoaId: "a", estado: "cancelada" })] });
    await escolherInteressado();
    guardar();
    await waitFor(() => expect(registarChamada).toHaveBeenCalled());
    expect(registarChamada.mock.calls[0][1].visita).toMatchObject({ tipo: "levantamento" });
  });

  it("a hora é obrigatória: sem ela não grava e diz porquê", async () => {
    const { registarChamada } = montar();
    await escolherInteressado();
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "" } });
    guardar();
    expect(registarChamada).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Indique a hora da visita.");
  });

  it("sem recurso escolhido não grava e diz que falta escolher quem vai", async () => {
    const { registarChamada } = montar();
    await escolherInteressado();
    fireEvent.click(screen.getByRole("button", { name: "Rita Gomes" }));
    guardar();
    expect(registarChamada).not.toHaveBeenCalled();
    expect(screen.getByText("Escolha quem vai à visita.")).toBeInTheDocument();
  });

  it("sem nenhum quadro na agenda não grava, diz-o e leva o foco à mensagem (não há campo com aria-invalid para onde o foco ir)", async () => {
    estado.agenda = { quadros: [], recursos: RECURSOS, isLoading: false, isError: false, refetch: vi.fn(), omissao: { boardId: null, recursoId: R1 } };
    const { registarChamada } = montar();
    await escolherInteressado();
    guardar();
    expect(registarChamada).not.toHaveBeenCalled();
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("Não há nenhum quadro de agenda onde marcar visitas.");
    await waitFor(() => expect(alerta).toHaveFocus());
  });

  it("enquanto a chamada grava, os campos da agenda deixam de se editar (a hora, a duração, o quadro e os recursos)", async () => {
    const registarChamada = vi.fn(() => new Promise<void>(() => {}));
    montar({ acoes: { registarChamada } });
    await escolherInteressado();
    expect(screen.getByLabelText("Hora")).not.toHaveAttribute("readonly");
    guardar();
    await waitFor(() => expect(registarChamada).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Hora")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Duração")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rita Gomes" })).toHaveAttribute("aria-disabled", "true");
  });

  it("uma falha parcial (contacto gravado, visita recusada) diz as duas coisas, em role=alert, e não conclui", async () => {
    const parcial = new ErroNeg(null, "NG010", "pessoasPagina.real.ficha.partialCallVisit", "pessoasPagina.real.visit.err.marcar.ng010");
    const { aoConcluir } = montar({ acoes: { registarChamada: vi.fn().mockRejectedValue(parcial) } });
    await escolherInteressado();
    guardar();
    const alerta = await screen.findByText(/O contacto ficou registado, mas a visita não foi marcada/);
    expect(alerta.closest("[role=alert]")).toHaveTextContent("Um dos recursos já tem uma marcação ou uma ausência a essa hora.");
    expect(aoConcluir).not.toHaveBeenCalled();
  });

  it("no exemplo (sem capacidades) continua o dia, a hora e a morada de sempre, sem agenda", async () => {
    montar({ acoes: { capacidades: undefined } });
    await escolherInteressado();
    expect(screen.queryByLabelText("Duração")).toBeNull();
    expect(estado.agendaArgs).toHaveLength(0);
  });
});
