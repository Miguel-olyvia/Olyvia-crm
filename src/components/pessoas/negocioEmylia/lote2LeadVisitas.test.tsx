// 19/11 (auditoria, lote 2): a primeira visita marcada na agenda do CRM (VisitasDoCrm, modo «primeira») com o negócio ainda na Lead («Tudo
// na chamada»): antes a visita ficava no CRM e o negócio em «Por contactar», com um aviso que falava de um botão que ali não existia. Agora
// a chamada fica registada (Contacto) e, com o Contacto completo, segue para a Visita; sem «Atendeu · interessado», a agenda não se mostra.
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Negocio } from "@/emylia/motor";
import { CONTACTO, LEAD, emFalta, type Grupo } from "@/emylia/campos";
import type { Ctx } from "@/emylia/pecas";
import { FontePessoasContext } from "@/hooks/pessoas/useFontePessoas";
import type { VisitaDoNegocio } from "@/hooks/pessoas/useVisitasDoNegocio";
import type { VisitaGravada } from "./MarcarVisitaNegocio";
import { VisitasDoCrm } from "./VisitasDoCrm";
import { comVisitasDoCrm } from "./visitasDosPassos";
import type { Passo } from "@/emylia/CamposFase";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org1" } }) }));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-query")>()), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/hooks/pessoas/useVisitasDoNegocio", async (orig) => ({
  ...(await orig<typeof import("@/hooks/pessoas/useVisitasDoNegocio")>()),
  useEntidadeDoNegocio: () => ({ entityId: "p1", isLoading: false, isError: false }),
  useVisitasDoNegocio: () => ({ visitas: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/hooks/pessoas/useAgendaVisita", () => ({ useAgendaVisita: () => ({ recursos: [{ id: "u1", name: "Catarina" }], isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock("@/hooks/pessoas/useAcoesVisita", () => ({ useAcoesVisita: () => ({ cancelar: vi.fn(), concluir: vi.fn() }) }));
vi.mock("../useExecutarAcao", () => ({ useExecutarAcao: () => ({ executar: vi.fn(), aGuardar: false, erro: null, erroExtra: null }) }));
vi.mock("../ErroAcao", () => ({ ErroAcao: () => null }));
// o formulário da agenda: um botão que «grava» uma visita a 14 de janeiro do ano seguinte
const VISITA: VisitaDoNegocio = {
  id: "crm-1", boardId: null, inicio: "2027-01-14T10:00:00Z", fim: "2027-01-14T11:00:00Z", minutos: 60, estado: "marcada", tipo: "levantamento", numeroEmylia: null,
  titulo: "Visita", notas: null, local: null, recursos: ["u1"], dia: "2027-01-14", hora: "10:00",
};
vi.mock("./MarcarVisitaNegocio", () => ({
  MarcarVisitaNegocio: ({ aoGuardada }: { aoGuardada: (g: VisitaGravada) => void }) => (
    <button type="button" onClick={() => aoGuardada({ visitaId: VISITA.id, visita: VISITA, presentes: "", remarcada: false, responsavel: null })}>Gravar na agenda (teste)</button>
  ),
}));

afterEach(cleanup);

const preencher = (d: Negocio, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0]! : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-12-20" : "x";
};
const comFonte = (filhos: ReactNode) => (
  <FontePessoasContext.Provider value={{ modo: "real", organizationId: "org1", momentoGanho: null }}>{filhos}</FontePessoasContext.Provider>
);
const montar = () => {
  const S = seed();
  const run = (fn: () => void) => fn();
  const ctx = { S, A: acoes(S, () => {}, run), run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  const d = S.deals.find((x) => x.fase === 0 && !x.perdido)!;
  return { S, ctx, d };
};

describe("«Tudo na chamada»: a visita marcada na Lead", () => {
  it("com o cliente interessado e o Contacto completo, o negócio passa da Lead à Visita, com a data do ano certo", () => {
    const { ctx, d } = montar();
    preencher(d, [...LEAD, ...CONTACTO]); // o resultado fica «Atendeu · interessado» (a 1.ª opção), escrito sem passar pela ação
    expect(d.fase).toBe(0);
    render(comFonte(<VisitasDoCrm c={{ negocioId: "n1", ctx, d, podeEditar: true }} modo="primeira" />));
    fireEvent.click(screen.getByRole("button", { name: "Gravar na agenda (teste)" }));
    expect(d.fase).toBe(2);
    expect(d.hist.some((h) => h.t.startsWith("Chamada registada"))).toBe(true);
    expect(d.f[`v${d.vis![0]}_data`]).toBe("2027-01-14");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("com respostas do Contacto em falta, passa a Contacto e o aviso diz o que fazer (o «Passar à visita» está à vista)", () => {
    const { ctx, d } = montar();
    preencher(d, [...LEAD, ...CONTACTO]);
    d.f.posse = "";
    render(comFonte(<VisitasDoCrm c={{ negocioId: "n1", ctx, d, podeEditar: true }} modo="primeira" />));
    fireEvent.click(screen.getByRole("button", { name: "Gravar na agenda (teste)" }));
    expect(d.fase).toBe(1);
    expect(screen.getByRole("alert")).toHaveTextContent("«Passar à visita», aqui em cima");
  });

  it("sem «Atendeu · interessado» a agenda não aparece: diz-se porquê", () => {
    const { ctx, d } = montar();
    delete d.f.resultado;
    render(comFonte(<VisitasDoCrm c={{ negocioId: "n1", ctx, d, podeEditar: true }} modo="primeira" />));
    expect(screen.queryByRole("button", { name: "Gravar na agenda (teste)" })).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent("Registe primeiro como correu a chamada");
  });
});

describe("o passo Estúdio leva as visitas da agenda do CRM", () => {
  it("comVisitasDoCrm põe as visitas do CRM no bloco «Visitas» do Estúdio", async () => {
    const { ctx, S } = montar();
    const d = S.deals.find((x) => x.linha === "wc" && x.fase === 2)!;
    const { VisitasNoEstudio } = await import("@/emylia/VisitasNoEstudio");
    const estudio: Passo = { id: "estudio", titulo: "Estúdio", icone: (() => null) as unknown as Passo["icone"], feito: false, resumo: [], corpo: <VisitasNoEstudio ctx={ctx} d={d} falta={0} /> };
    const [p] = comVisitasDoCrm([estudio], { negocioId: "n1", ctx, d, podeEditar: true });
    render(comFonte(<>{p!.corpo}</>));
    // o corpo do CRM (sem visitas lidas, e com as do protótipo antigas só para ler); o «Marcar outra visita» é o da agenda
    expect(screen.getByText(/só leitura/)).toBeInTheDocument();
  });
});
