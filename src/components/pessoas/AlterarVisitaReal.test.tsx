// «Alterar visita» ligado à base (naBase): parte da visita da ficha (quadro, recursos, duração, morada, nota), reenvia TODOS os campos por
// useAcoesVisita, avisa se o responsável da lead mudou, e aguenta duplo clique e fecho a meio. Os hooks da base estão simulados.
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
const { sucesso, informacao } = vi.hoisted(() => ({ sucesso: vi.fn(), informacao: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: informacao, error: vi.fn(), success: sucesso } }));

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";
const R3 = "33333333-3333-4333-8333-333333333333";
const estado = vi.hoisted(() => ({
  agenda: null as unknown,
  acoesArgs: [] as unknown[][],
  alterar: vi.fn(),
  conflitoArgs: [] as unknown[][],
}));
vi.mock("@/hooks/pessoas/useAgendaVisita", () => ({ useAgendaVisita: () => estado.agenda }));
vi.mock("@/hooks/pessoas/useAcoesVisita", () => ({
  useAcoesVisita: (...a: unknown[]) => { estado.acoesArgs.push(a); return { marcar: vi.fn(), alterar: estado.alterar, cancelar: vi.fn(), resultado: vi.fn() }; },
}));
vi.mock("@/hooks/pessoas/useConflitoVisita", () => ({
  useConflitoVisita: (...a: unknown[]) => { estado.conflitoArgs.push(a); return { emConflito: [], aVerificar: false, falhou: false }; },
}));

import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import { AlterarVisita } from "./AlterarVisita";
import { pessoaBase, visitaPessoaBase } from "./fabricaTestes";

beforeAll(prepararRadixNoJsdom);

const LEAD = { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" };
const ANA = pessoaBase("p1", { nome: "Ana Lopes", morada: { linha: "Rua A 1", cp: "1000-001", localidade: "Lisboa" } });
const RECURSOS = [
  { id: R1, name: "Rita Gomes", resource_type: "user", user_id: "u1" },
  { id: R2, name: "Rui Costa", resource_type: "user", user_id: "u2" },
];
const VISITA = visitaPessoaBase("v1", {
  data: "2026-10-24", hora: "10:00", duracao: "h1", tipo: "levantamento", quemVaiEstar: "casal", nota: "Portão azul", igualALead: true,
  morada: LEAD, agenda: { boardId: "q1", recursos: [{ id: R1, nome: "Rita Gomes" }], duracaoMinutos: 60 },
});

beforeEach(() => {
  sucesso.mockReset();
  informacao.mockReset();
  estado.alterar.mockReset();
  estado.acoesArgs.length = 0;
  estado.conflitoArgs.length = 0;
  estado.agenda = {
    quadros: [{ id: "q1", name: "Visitas", board_type: "visits", settings: null }, { id: "q2", name: "Obras", board_type: null, settings: null }],
    recursos: RECURSOS, isLoading: false, isError: false, refetch: vi.fn(), omissao: { boardId: "q1", recursoId: R1 },
  };
});

async function montar(visita = VISITA) {
  const aoGuardar = vi.fn();
  const aoMudarAberto = vi.fn();
  render(<AlterarVisita aberto aoMudarAberto={aoMudarAberto} pessoa={ANA} visita={visita} hoje="2026-10-20" aoGuardar={aoGuardar} naBase />);
  // O formulário ligado à base carrega-se quando se abre (import dinâmico): espera-se por ele.
  await screen.findByLabelText("Duração");
  return { aoGuardar, aoMudarAberto };
}
const dialogo = () => screen.getByRole("dialog", { name: "Alterar visita" });
const guardar = () => within(dialogo()).getByRole("button", { name: /^Guardar visita$|^A guardar…$/ });

describe("AlterarVisita ligado à base", () => {
  it("abre com o que a visita já tem: quadro, recursos, dia, hora, duração, morada e a nota de acesso", async () => {
    await montar();
    expect(screen.getByLabelText("Quadro da agenda")).toHaveValue("q1");
    expect(screen.getByRole("button", { name: "Rita Gomes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Rui Costa" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Dia")).toHaveValue("2026-10-24");
    expect(screen.getByLabelText("Hora")).toHaveValue("10:00");
    expect(screen.getByLabelText("Duração")).toHaveValue("h1");
    expect(screen.getByRole("radio", { name: /Na morada da lead/ })).toBeChecked();
    // A descrição não fala em «exemplo»: grava mesmo na agenda.
    expect(dialogo()).not.toHaveTextContent(/exemplo|memória/i);
  });

  it("reenvia TODOS os campos (nota, tipo, quem vai estar e morada incluídos) e os recursos atuais para a base decidir se mudaram", async () => {
    estado.alterar.mockResolvedValue({ mudou: true, recursosMudaram: false, donoAlterado: false, novoDono: null, outrasVisitas: [], desconfirmada: false });
    const { aoGuardar, aoMudarAberto } = await montar();
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "11:00" } });
    fireEvent.click(guardar());
    expect(estado.alterar).toHaveBeenCalledExactlyOnceWith(
      "v1",
      {
        boardId: "q1", data: "2026-10-24", hora: "11:00", duracao: "h1", duracaoMinutos: 60, recursos: [R1], tipo: "levantamento", titulo: "",
        nota: "Portão azul", morada: LEAD, igualALead: true, quemVaiEstar: "casal",
      },
      [R1],
    );
    await waitFor(() => expect(aoMudarAberto).toHaveBeenCalledWith(false));
    expect(sucesso).toHaveBeenCalledExactlyOnceWith("Visita de Ana Lopes alterada");
    expect(informacao).not.toHaveBeenCalled();
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it("trocar os recursos envia a nova lista; se o responsável mudou, o aviso diz quem é e quantas visitas seguiram", async () => {
    estado.alterar.mockResolvedValue({ mudou: true, recursosMudaram: true, donoAlterado: true, novoDono: "u2", outrasVisitas: ["a", "b"], desconfirmada: false });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Rui Costa" }));
    fireEvent.click(screen.getByRole("button", { name: "Rita Gomes" }));
    fireEvent.click(guardar());
    expect(estado.alterar).toHaveBeenCalledWith("v1", expect.objectContaining({ recursos: [R2] }), [R1]);
    await waitFor(() => expect(informacao).toHaveBeenCalledTimes(1));
    expect(informacao).toHaveBeenCalledWith("O responsável de Ana Lopes passou a ser Rui Costa. Visitas futuras reatribuídas: 2.");
  });

  it("responsável mudou mas o novo dono não é um dos recursos escolhidos: aviso sem nome; sem outras visitas, sem a contagem", async () => {
    estado.alterar.mockResolvedValue({ mudou: true, recursosMudaram: true, donoAlterado: true, novoDono: "desconhecido", outrasVisitas: [], desconfirmada: false });
    await montar();
    fireEvent.click(guardar());
    await waitFor(() => expect(informacao).toHaveBeenCalledTimes(1));
    expect(informacao).toHaveBeenCalledWith("O responsável de Ana Lopes mudou.");
  });

  it("se a visita deixou de estar confirmada, avisa", async () => {
    estado.alterar.mockResolvedValue({ mudou: true, recursosMudaram: false, donoAlterado: false, novoDono: null, outrasVisitas: [], desconfirmada: true });
    await montar();
    fireEvent.click(guardar());
    await waitFor(() => expect(informacao).toHaveBeenCalledWith("A visita deixou de estar confirmada: confirme-a de novo na agenda."));
  });

  it("um recurso da visita que já não está ativo na agenda continua visível e escolhido", async () => {
    await montar({ ...VISITA, agenda: { boardId: "q1", recursos: [{ id: R1, nome: "Rita Gomes" }, { id: R3, nome: "Zé Antigo" }], duracaoMinutos: 60 } });
    expect(screen.getByRole("button", { name: "Zé Antigo" })).toHaveAttribute("aria-pressed", "true");
  });

  it("uma duração da base fora das quatro mantém-se tal e qual quando não se mexe nela", async () => {
    estado.alterar.mockResolvedValue({ mudou: true, recursosMudaram: false, donoAlterado: false, novoDono: null, outrasVisitas: [], desconfirmada: false });
    await montar({ ...VISITA, duracao: "", agenda: { boardId: "q1", recursos: [{ id: R1, nome: "Rita Gomes" }], duracaoMinutos: 45 } });
    expect(screen.getByLabelText("Duração")).toHaveValue("custom");
    fireEvent.click(guardar());
    expect(estado.alterar).toHaveBeenCalledWith("v1", expect.objectContaining({ duracao: "", duracaoMinutos: 45 }), [R1]);
  });

  it("uma visita sem recursos lidos NÃO assume o recurso de quem está na sessão: pede a escolha e não grava (senão mudava o responsável da lead sem o utilizador mexer)", async () => {
    await montar({ ...VISITA, agenda: { boardId: "q1", recursos: [], duracaoMinutos: 60 } });
    expect(screen.getByRole("button", { name: "Rita Gomes" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(guardar());
    expect(estado.alterar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Escolha quem vai à visita.");
  });

  it("uma visita sem agenda lida (sem quadro nem recursos) também pede a escolha dos recursos", async () => {
    await montar({ ...VISITA, agenda: undefined });
    expect(screen.getByRole("button", { name: "Rita Gomes" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(guardar());
    expect(estado.alterar).not.toHaveBeenCalled();
  });

  it("uma visita sem fim legível (duração por saber) mostra a duração que vai gravar (1 hora), em vez de gravar 60 minutos sem se ver", async () => {
    estado.alterar.mockResolvedValue({ mudou: true, recursosMudaram: false, donoAlterado: false, novoDono: null, outrasVisitas: [], desconfirmada: false });
    await montar({ ...VISITA, duracao: "", agenda: { boardId: "q1", recursos: [{ id: R1, nome: "Rita Gomes" }], duracaoMinutos: null } });
    expect(screen.getByLabelText("Duração")).toHaveValue("h1");
    fireEvent.click(guardar());
    expect(estado.alterar).toHaveBeenCalledWith("v1", expect.objectContaining({ duracao: "h1" }), [R1]);
  });

  it("uma nota que passa dos 140 caracteres (nota mais nota de acesso unidas) com «outra morada» vê-se no campo da nota de acesso e encurta-se: há saída", async () => {
    estado.alterar.mockResolvedValue({ mudou: true, recursosMudaram: false, donoAlterado: false, novoDono: null, outrasVisitas: [], desconfirmada: false });
    await montar({ ...VISITA, igualALead: false, morada: { rua: "Rua B 2", codigoPostal: "", localidade: "", andar: "" }, nota: "x".repeat(200) });
    fireEvent.click(guardar());
    expect(estado.alterar).not.toHaveBeenCalled();
    const campo = screen.getByLabelText(/Nota de acesso/i);
    expect(campo).toHaveValue("x".repeat(200));
    expect(campo).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(campo, { target: { value: "x".repeat(100) } });
    fireEvent.click(guardar());
    expect(estado.alterar).toHaveBeenCalledWith("v1", expect.objectContaining({ nota: "x".repeat(100) }), [R1]);
  });

  it("a hora não pode ficar vazia; sem ela não grava", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "" } });
    fireEvent.click(guardar());
    expect(estado.alterar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Indique a hora da visita.");
  });

  it("42501 na troca de recursos: mensagem própria dentro do diálogo, que continua aberto", async () => {
    estado.alterar.mockRejectedValueOnce(new ErroNeg(null, "42501", "pessoasPagina.real.visit.ownerForbidden"));
    const { aoMudarAberto } = await montar();
    fireEvent.click(guardar());
    expect(await screen.findByRole("alert")).toHaveTextContent("Não pode mudar quem vai a esta visita: mudaria o responsável da lead.");
    expect(aoMudarAberto).not.toHaveBeenCalledWith(false);
    expect(sucesso).not.toHaveBeenCalled();
  });

  it("NG010: recurso em conflito marcado, foco nos recursos, diálogo aberto", async () => {
    estado.alterar.mockRejectedValueOnce(new ErroNeg({ code: "NG010", details: R1 }, "NG010", "pessoasPagina.real.visit.err.alterar.ng010"));
    await montar();
    fireEvent.click(guardar());
    expect(await screen.findByRole("alert")).toHaveTextContent("Um dos recursos já tem uma marcação ou uma ausência a essa hora.");
    expect(screen.getByRole("button", { name: /Rita Gomes/ })).toHaveTextContent("ocupado nesse horário");
    await waitFor(() => expect(screen.getByRole("group", { name: "Quem vai à visita" })).toHaveFocus());
  });

  it("o pré-aviso de conflito exclui a própria visita (não conflitua consigo mesma)", async () => {
    await montar();
    expect(estado.conflitoArgs.at(-1)).toEqual([[R1], "2026-10-24T09:00:00.000Z", "2026-10-24T10:00:00.000Z", "v1"]);
  });

  it("enquanto grava: aria-busy, duplo clique grava uma vez, Escape e Cancelar não fecham; só fecha quando a base responde", async () => {
    let resolver!: (v: unknown) => void;
    estado.alterar.mockReturnValue(new Promise((ok) => { resolver = ok; }));
    const { aoMudarAberto } = await montar();
    fireEvent.click(guardar());
    const botao = within(dialogo()).getByRole("button", { name: "A guardar…" });
    expect(botao).toHaveAttribute("aria-busy", "true");
    expect(botao).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao);
    expect(estado.alterar).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialogo(), { key: "Escape" });
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Cancelar" }));
    expect(aoMudarAberto).not.toHaveBeenCalledWith(false);
    resolver({ mudou: true, recursosMudaram: false, donoAlterado: false, novoDono: null, outrasVisitas: [], desconfirmada: false });
    await waitFor(() => expect(aoMudarAberto).toHaveBeenCalledWith(false));
  });

  it("fora da base (sem naBase) continua a ser o diálogo de exemplo: guarda pelo aoGuardar e não lê a agenda", async () => {
    const aoGuardar = vi.fn();
    render(<AlterarVisita aberto aoMudarAberto={vi.fn()} pessoa={ANA} visita={visitaPessoaBase("v9")} hoje="2026-10-20" aoGuardar={aoGuardar} />);
    expect(screen.queryByLabelText("Quadro da agenda")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar visita" }));
    expect(aoGuardar).toHaveBeenCalledTimes(1);
    expect(estado.alterar).not.toHaveBeenCalled();
  });
});
