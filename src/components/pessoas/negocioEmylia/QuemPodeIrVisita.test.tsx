// 4/11 (Rúben): «Marcar a visita»: a data primeiro, depois os comerciais que podem ir; sem nenhum, técnicos e outros dias sugeridos
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FontePessoasContext } from "@/hooks/pessoas/useFontePessoas";
import { HORARIO_POR_OMISSAO, SEM_FERIADOS } from "@/hooks/pessoas/horasLivresVisita";
import { agruparQuemVai, QuemPodeIrVisita } from "./QuemPodeIrVisita";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
afterEach(() => rpc.mockReset());

const R = (id: string, name: string) => ({ id, name, resource_type: "user", user_id: `u-${id}` });
const ANA = R("ana", "Ana"), RUI = R("rui", "Rui"), TO = R("to", "Tó");
const PAPEIS = [{ resource_id: "ana", papeis: ["comercial"] }, { resource_id: "rui", papeis: ["comercial"] }, { resource_id: "to", papeis: ["tecnico"] }];
const DIA = "2030-03-12", DEPOIS = "2030-03-13";
const slot = (dia: string, h: string) => ({ slot_start: `${dia}T${h}:00+00:00`, slot_end: `${dia}T${h}:00+00:00` });

/** livres[dia][recurso] = horas */
function base(livres: Record<string, Record<string, string[]>>, papeis: unknown = PAPEIS) {
  rpc.mockImplementation(async (nome: string, a: { p_resource_id?: string; p_date?: string }) => {
    if (nome === "neg_papeis_dos_recursos") return papeis === null ? { data: null, error: { code: "PGRST202" } } : { data: papeis, error: null };
    if (nome === "neg_visitas_vizinhas") return { data: null, error: { code: "PGRST202" } };
    return { data: (livres[a.p_date ?? ""]?.[a.p_resource_id ?? ""] ?? []).map((h) => slot(a.p_date as string, h)), error: null };
  });
}
function desenhar(data: string, escolhidos: string[] = []) {
  const aoMudar = vi.fn(), aoMudarRecursos = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FontePessoasContext.Provider value={{ modo: "real", organizationId: "org", momentoGanho: null } as never}>
        <QuemPodeIrVisita
          a={{ id: "v", data, hora: "", hoje: "2030-03-01", campoData: undefined, erroData: null, erroHora: null, somenteLeitura: false, aoMudar,
            escolhidos, aoMudarRecursos, ocupados: [], erroRecursos: null, grupoRef: undefined }}
          recursos={[ANA, RUI, TO]} duracaoMin={60} horario={HORARIO_POR_OMISSAO} feriados={SEM_FERIADOS} horarioPronto excluirId={null}
          hora={<p>As horas</p>}
        />
      </FontePessoasContext.Provider>
    </QueryClientProvider>,
  );
  return { aoMudar, aoMudarRecursos };
}

describe("QuemPodeIrVisita", () => {
  it("agrupa: comerciais (e os já escolhidos) à frente; técnicos à parte; sem papéis, toda a gente", () => {
    const papeis = new Map(PAPEIS.map((p) => [p.resource_id, p.papeis]));
    expect(agruparQuemVai([ANA, RUI, TO], papeis, []).principais.map((r) => r.id)).toEqual(["ana", "rui"]);
    expect(agruparQuemVai([ANA, RUI, TO], papeis, ["to"]).principais.map((r) => r.id)).toEqual(["ana", "rui", "to"]);
    expect(agruparQuemVai([ANA, RUI, TO], papeis, []).tecnicos.map((r) => r.id)).toEqual(["to"]);
    expect(agruparQuemVai([ANA, RUI, TO], null, []).principais).toHaveLength(3);
  });

  it("sem data: só a «Data da visita», sem atalhos de dia, e diz que a seguir vêm os comerciais", () => {
    base({});
    desenhar("");
    // 4/11: um calendário à vista (o campo de data do browser parecia desativado)
    expect(screen.getByRole("group", { name: "Data da visita" })).toBeInTheDocument();
    expect(screen.getByText("Escolha o dia no calendário.")).toBeInTheDocument();
    for (const t of ["Hoje", "Amanhã", "Daqui a 1 semana"]) expect(screen.queryByRole("button", { name: t })).toBeNull();
    expect(screen.getByText(/a seguir aparecem os comerciais/)).toBeInTheDocument();
    expect(screen.queryByText("As horas")).toBeNull();
  });

  it("escolher um dia no calendário muda a data; os dias que já passaram não se escolhem", () => {
    base({});
    const { aoMudar } = desenhar("");
    fireEvent.click(screen.getByRole("gridcell", { name: "15" }));
    expect(aoMudar).toHaveBeenCalledWith({ data: "2030-03-15" });
    expect(screen.getAllByRole("gridcell", { name: "1" })[0]).not.toBeDisabled();
  });

  it("com data: o dia por extenso", () => {
    base({});
    desenhar(DIA);
    expect(screen.getByText("terça-feira, 12 de março")).toBeInTheDocument();
  });

  it("com data: os comerciais com as horas livres nesse dia, e a hora a seguir", async () => {
    base({ [DIA]: { ana: ["10:00", "11:00"], rui: [] } });
    desenhar(DIA, ["ana"]);
    expect(await screen.findByRole("button", { name: /Ana · 2 horas livres/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Rui · sem horas livres/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tó/ })).toBeNull();
    expect(screen.getByText("As horas")).toBeInTheDocument();
  });

  it("um só comercial livre nesse dia fica escolhido", async () => {
    base({ [DIA]: { ana: ["10:00"], rui: [] } });
    const { aoMudarRecursos } = desenhar(DIA);
    await waitFor(() => expect(aoMudarRecursos).toHaveBeenCalledWith(["ana"]));
  });

  it("sem comerciais livres: sugere os técnicos livres e os próximos dias com comerciais; escolher um dia muda a data", async () => {
    base({ [DIA]: { ana: [], rui: [], to: ["09:00"] }, [DEPOIS]: { rui: ["15:00"] } });
    const { aoMudar } = desenhar(DIA);
    expect(await screen.findByText("Nenhum comercial está livre a 12/03.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Tó · 1 hora livre/ })).toBeInTheDocument();
    const outroDia = await screen.findByRole("button", { name: /13\/03 · Rui/ });
    fireEvent.click(outroDia);
    expect(aoMudar).toHaveBeenCalledWith({ data: DEPOIS });
  });

  it("sem a função dos papéis na base: toda a gente, como antes", async () => {
    base({ [DIA]: { ana: ["10:00"], rui: ["10:00"], to: ["10:00"] } }, null);
    desenhar(DIA, ["ana"]);
    expect(await screen.findByText("Quem vai à visita")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Tó/ })).toBeInTheDocument();
  });
});
