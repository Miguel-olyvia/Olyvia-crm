// «Marcar visita» ligado à base (naBase): quadro, recursos, dia, hora obrigatória, duração e morada; grava por useAcoesVisita (nunca pelo store de
// exemplo), aguenta duplo clique, não deixa fechar a meio e traduz os erros. Os hooks da base estão simulados: nunca se chama a base.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const { sucesso } = vi.hoisted(() => ({ sucesso: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: sucesso } }));

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";
const estado = vi.hoisted(() => ({
  agenda: null as unknown,
  agendaArgs: [] as unknown[][],
  acoesArgs: [] as unknown[][],
  marcar: vi.fn(),
  conflitoArgs: [] as unknown[][],
  conflito: { emConflito: [] as string[], aVerificar: false, falhou: false },
}));
vi.mock("@/hooks/pessoas/useAgendaVisita", () => ({ useAgendaVisita: (...a: unknown[]) => { estado.agendaArgs.push(a); return estado.agenda; } }));
vi.mock("@/hooks/pessoas/useAcoesVisita", () => ({
  useAcoesVisita: (...a: unknown[]) => { estado.acoesArgs.push(a); return { marcar: estado.marcar, alterar: vi.fn(), cancelar: vi.fn(), resultado: vi.fn() }; },
}));
vi.mock("@/hooks/pessoas/useConflitoVisita", () => ({ useConflitoVisita: (...a: unknown[]) => { estado.conflitoArgs.push(a); return estado.conflito; } }));

import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import { MarcarVisitaProvider } from "./MarcarVisita";
import { useMarcarVisita } from "./marcarVisitaContexto";

beforeAll(prepararRadixNoJsdom);

const LEAD = { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" };
const QUADROS = [{ id: "q1", name: "Visitas", board_type: "visits", settings: null }];
const RECURSOS = [
  { id: R1, name: "Rita Gomes", resource_type: "user", user_id: "u1" },
  { id: R2, name: "Rui Costa", resource_type: "user", user_id: "u2" },
];

function agendaCom(sobre: Record<string, unknown> = {}) {
  return { quadros: QUADROS, recursos: RECURSOS, isLoading: false, isError: false, refetch: vi.fn(), omissao: { boardId: "q1", recursoId: R1 }, ...sobre };
}

beforeEach(() => {
  sucesso.mockReset();
  estado.marcar.mockReset();
  estado.agenda = agendaCom();
  estado.agendaArgs.length = 0;
  estado.acoesArgs.length = 0;
  estado.conflitoArgs.length = 0;
  estado.conflito = { emConflito: [], aVerificar: false, falhou: false };
});

function Abrir({ responsavelUserId }: { responsavelUserId?: string }) {
  const marcar = useMarcarVisita();
  return (
    <button type="button" onClick={() => marcar?.pedir({ pessoaId: "p1", nome: "Ana Lopes", moradaLead: LEAD, responsavelUserId })}>
      Abrir
    </button>
  );
}

async function montar(extra: { jaComVisita?: ReadonlySet<string>; responsavelUserId?: string } = {}) {
  const aoMarcar = vi.fn();
  const r = render(
    <MarcarVisitaProvider hoje="2026-10-20" aoMarcar={aoMarcar} naBase jaComVisita={extra.jaComVisita}>
      <Abrir responsavelUserId={extra.responsavelUserId} />
    </MarcarVisitaProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
  // O formulário ligado à base carrega-se quando se abre (import dinâmico): espera-se por ele.
  await screen.findByLabelText("Duração");
  return { aoMarcar, ...r };
}
const dialogo = () => screen.getByRole("dialog", { name: "Marcar visita" });
const submeter = () => within(dialogo()).getByRole("button", { name: /^Marcar visita$|^A guardar…$/ });
function preencher(hora = "10:00") {
  fireEvent.change(screen.getByLabelText("Dia"), { target: { value: "2026-10-24" } });
  if (hora) fireEvent.change(screen.getByLabelText("Hora"), { target: { value: hora } });
}

describe("MarcarVisita ligado à base", () => {
  it("abre com o quadro, o recurso e a duração por omissão; lê a agenda pelo responsável da pessoa", async () => {
    await montar({ responsavelUserId: "u1" });
    expect(screen.getByLabelText("Duração")).toHaveValue("h1");
    expect(within(dialogo()).getByText("Visitas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rita Gomes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Rui Costa" })).toHaveAttribute("aria-pressed", "false");
    expect(estado.agendaArgs.at(-1)).toEqual(["u1"]);
    expect(estado.acoesArgs.at(-1)).toEqual(["p1", null]);
  });

  it("a hora é obrigatória: sem ela não grava, diz porquê e põe o foco no campo certo", async () => {
    await montar();
    preencher("");
    fireEvent.click(submeter());
    expect(estado.marcar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Indique a hora da visita.");
    await waitFor(() => expect(screen.getByLabelText("Hora")).toHaveFocus());
  });

  it("sem recursos escolhidos não grava e diz que falta escolher quem vai", async () => {
    await montar();
    preencher();
    fireEvent.click(screen.getByRole("button", { name: "Rita Gomes" }));
    fireEvent.click(submeter());
    expect(estado.marcar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Escolha quem vai à visita.");
  });

  it("sem quadro elegível não grava e remete para a Agenda", async () => {
    estado.agenda = agendaCom({ quadros: [], omissao: { boardId: null, recursoId: R1 } });
    await montar();
    preencher();
    fireEvent.click(submeter());
    expect(estado.marcar).not.toHaveBeenCalled();
    expect(screen.getByText(/Não há nenhum quadro de agenda/)).toBeInTheDocument();
  });

  it("grava pela base com a entrada completa, avisa e fecha; o store de exemplo nunca é chamado", async () => {
    estado.marcar.mockResolvedValue({ visitaId: "v-novo", mudou: true });
    const { aoMarcar } = await montar();
    preencher();
    fireEvent.click(submeter());
    expect(estado.marcar).toHaveBeenCalledExactlyOnceWith({
      boardId: "q1", data: "2026-10-24", hora: "10:00", duracao: "h1", duracaoMinutos: undefined, recursos: [R1], tipo: "levantamento",
      titulo: "Levantamento · Ana Lopes", nota: "", morada: LEAD, igualALead: true, quemVaiEstar: "",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sucesso).toHaveBeenCalledExactlyOnceWith("Visita de Ana Lopes marcada");
    expect(aoMarcar).not.toHaveBeenCalled();
  });

  it("quem já tem uma visita não cancelada marca uma revisita", async () => {
    estado.marcar.mockResolvedValue({ visitaId: "v2", mudou: true });
    await montar({ jaComVisita: new Set(["p1"]) });
    preencher();
    fireEvent.click(submeter());
    expect(estado.marcar).toHaveBeenCalledWith(expect.objectContaining({ tipo: "revisita", titulo: "Revisita · Ana Lopes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("trocar de pessoa na ficha a meio (a lista «já com visita» passa a ser a da pessoa nova) não muda o tipo da visita da pessoa com que o diálogo abriu", async () => {
    estado.marcar.mockResolvedValue({ visitaId: "v2", mudou: true });
    const { rerender } = await montar({ jaComVisita: new Set(["p1"]) });
    rerender(
      <MarcarVisitaProvider hoje="2026-10-20" aoMarcar={vi.fn()} naBase jaComVisita={new Set(["outra-pessoa"])}>
        <Abrir />
      </MarcarVisitaProvider>,
    );
    preencher();
    fireEvent.click(submeter());
    expect(estado.marcar).toHaveBeenCalledWith(expect.objectContaining({ tipo: "revisita", titulo: "Revisita · Ana Lopes" }));
  });

  it("a nota e a morada escolhidas seguem: outra morada, com a nota de acesso", async () => {
    estado.marcar.mockResolvedValue({ visitaId: "v3", mudou: true });
    await montar();
    preencher();
    fireEvent.change(screen.getByLabelText("Nota (opcional)"), { target: { value: "Trazer trena" } });
    fireEvent.click(screen.getByRole("radio", { name: /Outra morada/ }));
    fireEvent.change(screen.getByLabelText("Rua e número"), { target: { value: "Rua B 2" } });
    fireEvent.change(screen.getByLabelText("Código postal"), { target: { value: "2000-002" } });
    fireEvent.change(screen.getByLabelText("Nota de acesso (opcional)"), { target: { value: "Portão azul" } });
    fireEvent.click(submeter());
    expect(estado.marcar).toHaveBeenCalledWith(expect.objectContaining({
      nota: "Trazer trena · Portão azul", igualALead: false, morada: { rua: "Rua B 2", codigoPostal: "2000-002", localidade: "", andar: "" },
    }));
  });

  it("enquanto grava: botão aria-busy e aria-disabled, duplo clique grava uma vez, Escape e Cancelar não fecham", async () => {
    let resolver!: (v: unknown) => void;
    estado.marcar.mockReturnValue(new Promise((ok) => { resolver = ok; }));
    await montar();
    preencher();
    fireEvent.click(submeter());
    const botao = within(dialogo()).getByRole("button", { name: "A guardar…" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).toHaveAttribute("aria-busy", "true");
    fireEvent.click(botao);
    fireEvent.submit(dialogo().querySelector("form") as HTMLFormElement);
    expect(estado.marcar).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialogo(), { key: "Escape" });
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    resolver({ visitaId: "v-novo", mudou: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(estado.marcar).toHaveBeenCalledTimes(1);
  });

  it("um erro fica dentro do diálogo, traduzido; os dados escritos ficam e repetir volta a gravar", async () => {
    estado.marcar
      .mockRejectedValueOnce(new ErroNeg(null, "NG008", "pessoasPagina.real.visit.err.marcar.ng008"))
      .mockResolvedValueOnce({ visitaId: "v-novo", mudou: true });
    await montar();
    preencher("11:30");
    fireEvent.click(submeter());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("O quadro ou o recurso escolhido já não está disponível.");
    expect(screen.getByLabelText("Hora")).toHaveValue("11:30");
    expect(sucesso).not.toHaveBeenCalled();
    fireEvent.click(submeter());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(estado.marcar).toHaveBeenCalledTimes(2);
  });

  it("NG010: o diálogo fica aberto, o recurso em conflito fica marcado e o foco vai para os recursos", async () => {
    estado.marcar.mockRejectedValueOnce(new ErroNeg({ code: "NG010", details: R1 }, "NG010", "pessoasPagina.real.visit.err.marcar.ng010"));
    await montar();
    preencher();
    fireEvent.click(submeter());
    expect(await screen.findByRole("alert")).toHaveTextContent("Um dos recursos já tem uma marcação ou uma ausência a essa hora.");
    expect(screen.getByRole("button", { name: /Rita Gomes/ })).toHaveTextContent("ocupado nesse horário");
    await waitFor(() => expect(screen.getByRole("group", { name: "Quem vai à visita" })).toHaveFocus());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("o pré-aviso de conflito recebe os recursos e o horário escolhidos (início e fim em Lisboa)", async () => {
    await montar();
    preencher("10:00");
    expect(estado.conflitoArgs.at(-1)).toEqual([[R1], "2026-10-24T09:00:00.000Z", "2026-10-24T10:00:00.000Z", null]);
  });

  it("um aviso de conflito não impede de gravar (a recusa verdadeira é da base)", async () => {
    estado.conflito = { emConflito: [R1], aVerificar: false, falhou: false };
    estado.marcar.mockResolvedValue({ visitaId: "v-novo", mudou: true });
    await montar();
    preencher();
    expect(screen.getByTestId("conflito-visita")).toHaveTextContent("Rita Gomes já tem uma marcação");
    fireEvent.click(submeter());
    expect(estado.marcar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("depois de marcar, a pessoa deixa de ter o botão «Marcar visita» pendente: fica nas marcadas deste ecrã", async () => {
    estado.marcar.mockResolvedValue({ visitaId: "v-novo", mudou: true });
    function Estado() {
      const m = useMarcarVisita();
      return <p data-testid="marcadas">{m ? [...m.marcadas].join(",") : ""}</p>;
    }
    render(
      <MarcarVisitaProvider hoje="2026-10-20" aoMarcar={vi.fn()} naBase>
        <Abrir />
        <Estado />
      </MarcarVisitaProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    await screen.findByLabelText("Duração");
    preencher();
    fireEvent.click(submeter());
    await waitFor(() => expect(screen.getByTestId("marcadas")).toHaveTextContent("p1"));
  });
});
