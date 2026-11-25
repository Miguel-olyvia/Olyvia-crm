// 19/11/2026 (Rúben: «preciso mesmo que garantas que o técnico, ao completar uma task, que esteja ligado o input de término no Estúdio
// da obra. Depois as Operações da obra têm de ser o Estúdio da obra, não o outro antigo.»)
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TECS, acoes, seed, type Estado, type Negocio, type Plano } from "../motor";
import type { Ctx } from "../pecas";
import { canonico, juntar3, novidadesDaObra, obraJunta } from "./juntarObra";
import { obraVazia } from "./obraReal";
import { fotografarNegocios, gravarMudancas, juntarObrasDaBase, obraMudou } from "./sincronizarNegocios";
import { terminadasHoje, trabalhoDoTecnico } from "../trabalhoObra";
import { HojeTecnico } from "../HojeTecnico";
import { EstudioObra } from "../estudioObra/EstudioObra";
import { OperacoesSimples } from "../OperacoesSimples";
import { terminadasDe } from "../estudioObra/ComandoObra";

afterEach(cleanup);

const plano = (): Plano => ({
  estado: "em curso", dia: 1, inicio: "2026-11-16",
  tasks: [
    { nome: "Demolição", svcs: [], dia: 0, dur: 1, sk: "Pedreiro", h: 8, tec: "t1", fase: 1, exec: { estado: "validada", horas: 8, fotos: [] } },
    { nome: "Canalização", svcs: [], dia: 1, dur: 1, sk: "Canalizador", h: 8, tec: "t2", fase: 2, exec: { estado: "em curso", horas: 2, fotos: [] } },
    { nome: "Revestimento", svcs: [], dia: 2, dur: 2, sk: "Ladrilhador", h: 16, tec: "t3", fase: 3 },
  ],
});
const obraCom = (p: Plano): Negocio["obra"] => ({ ...obraVazia(), plano: p, diario: [] });
const clone = <T,>(x: T): T => structuredClone(x);

describe("juntar3: o que cada lado mudou fica", () => {
  it("o técnico deu a tarefa por feita (na base) e o gestor, com o ecrã antigo, mudou as datas: ficam as duas coisas", () => {
    const antes = obraCom(plano());
    const base = clone(antes);
    base.plano!.tasks[1].exec = { estado: "feita", horas: 8, fotos: ["f1"], envios: [{ q: "hoje 17:00", dia: 1, quem: "Rui", k: "feita", horas: 6 }] };
    base.diario!.push({ q: "hoje 17:00", quem: "Rui", t: "Canalização: feita", k: "horas" });
    const local = clone(antes);
    local.plano!.tasks[2].dia = 3;
    local.diario!.push({ q: "hoje 17:05", quem: "Filipe", t: "Plano ajustado", k: "marco" });
    const j = obraJunta(antes, local, base).obra;
    expect(j.plano!.tasks[1].exec?.estado).toBe("feita");
    expect(j.plano!.tasks[1].exec?.envios).toHaveLength(1);
    expect(j.plano!.tasks[2].dia).toBe(3);
    expect(j.diario!.map((x) => x.quem).sort()).toEqual(["Filipe", "Rui"]);
  });

  it("o gestor validou outra tarefa (na base) e o técnico, com o ecrã antigo, dá a sua por feita: a validação não volta atrás", () => {
    const antes = obraCom(plano());
    antes.plano!.tasks[0].exec = { estado: "feita", horas: 8, fotos: [] };
    const base = clone(antes);
    base.plano!.tasks[0].exec = { estado: "validada", horas: 8, fotos: [], validada: "hoje" };
    const local = clone(antes);
    local.plano!.tasks[1].exec = { estado: "feita", horas: 8, fotos: ["f"] };
    const j = obraJunta(antes, local, base).obra;
    expect(j.plano!.tasks[0].exec?.estado).toBe("validada");
    expect(j.plano!.tasks[1].exec?.estado).toBe("feita");
  });

  it("os dois mudaram o mesmo valor: ganha este ecrã; a ordem das chaves (jsonb) não conta como mudança", () => {
    expect(juntar3({ a: 1 }, { a: 2 }, { a: 3 })).toEqual({ a: 2 });
    expect(canonico({ b: 1, a: { d: 2, c: 3 } })).toBe(canonico({ a: { c: 3, d: 2 }, b: 1 }));
    expect(juntar3({ a: 1, b: 2 }, { a: 1, b: 2 }, { b: 2, a: 1 })).toEqual({ a: 1, b: 2 });
  });

  it("a encomenda de cliente vem do negócio e o «hoje» do calendário, não da cópia gravada na obra", () => {
    const antes = obraCom({ ...plano(), origem: "orcamento" });
    antes.ec = { n: "EC 1", criada: "hoje", ref: "CT 2026/1009" } as Negocio["obra"]["ec"];
    const base = clone(antes) as Negocio["obra"];
    base.ec = null;
    base.plano!.dia = 0;
    const hoje = new Date(2026, 10, 17, 10); // 2.º dia útil da obra (começou a 16/11)
    const { obra } = obraJunta(antes, clone(antes), base, hoje);
    expect(obra.ec?.ref).toBe("CT 2026/1009");
    expect(obra.plano!.dia).toBe(1);
  });

  it("diz o que mudou nas tarefas (para o aviso)", () => {
    const a = obraCom(plano()), b = clone(a);
    b.plano!.tasks[1].exec!.estado = "feita";
    expect(novidadesDaObra(a, b)).toEqual(["Canalização: terminada, por validar"]);
  });
});

/** Um cliente falso: a base tem `naBase` (o que obra_ler_negocios devolve) e regista o que se grava. */
function falso(naBase: () => Negocio["obra"]) {
  const gravado: unknown[] = [];
  const sb = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "obra_guardar_negocio") { gravado.push(args.p_obra); return { data: { avisos: [] }, error: null }; }
      if (fn === "obra_ler_negocios") return { data: [{ negocio_id: "neg-1", emylia: naBase() }], error: null };
      return { data: null, error: null };
    }),
  } as unknown as SupabaseClient;
  return { sb, gravado };
}
const IDS = { paraId: new Map<string, string>(), paraChave: new Map<string, string>() };

describe("gravar a obra junta primeiro o que está na base", () => {
  it("o Estúdio aberto há mais tempo já não apaga o «feita» que o técnico gravou", async () => {
    const S = seed();
    const d = clone(S.deals[0]);
    d.id = 1001; d.obra = obraCom(plano());
    S.deals = [d];
    const foto = fotografarNegocios(S.deals);
    const refs = new Map([[1001, { id: "neg-1", entityId: "e" }]]);
    // na base, o técnico já deu a Canalização por feita
    const naBase = clone(d.obra);
    naBase.plano!.tasks[1].exec = { estado: "feita", horas: 8, fotos: ["f"], envios: [{ q: "hoje", dia: 1, quem: "Rui", k: "feita", horas: 6 }] };
    // aqui, o gestor muda o Revestimento
    d.obra.plano!.tasks[2].dia = 3;
    const { sb, gravado } = falso(() => naBase);
    const r = await gravarMudancas(sb, "org", S, refs, foto, IDS, new Set(), { lerObras: async () => new Map([["neg-1", clone(naBase)]]) });
    expect(r.erros).toEqual([]);
    const obra = (gravado[0] as { emylia: Negocio["obra"] }).emylia;
    expect(obra.plano!.tasks[1].exec?.estado).toBe("feita");
    expect(obra.plano!.tasks[2].dia).toBe(3);
    // e o ecrã fica com ela (o Estúdio mostra-a por validar)
    expect(d.obra.plano!.tasks[1].exec?.estado).toBe("feita");
    expect(obraMudou(d, foto)).toBe(false);
  });

  it("a releitura (de 20 em 20 s) traz o que o técnico gravou, sem gravar nada", () => {
    const S = seed();
    const d = clone(S.deals[0]);
    d.id = 1001; d.obra = obraCom(plano());
    S.deals = [d];
    const foto = fotografarNegocios(S.deals);
    const refs = new Map([[1001, { id: "neg-1", entityId: "e" }]]);
    const naBase = clone(d.obra);
    naBase.plano!.tasks[1].exec!.estado = "feita";
    const p0 = d.obra.plano;
    const m = juntarObrasDaBase(S, refs, foto, new Map([["neg-1", naBase]]));
    expect(m.map((x) => x.novidades)).toEqual([["Canalização: terminada, por validar"]]);
    expect(d.obra.plano!.tasks[1].exec?.estado).toBe("feita");
    expect(obraMudou(d, foto)).toBe(false);
    expect(d.obra.plano).not.toBe(p0); // o mesmo d.obra, com o plano novo
    // ler outra vez o mesmo não muda nada
    expect(juntarObrasDaBase(S, refs, foto, new Map([["neg-1", clone(naBase)]]))).toEqual([]);
  });
});

/** Uma obra do exemplo em curso, com uma tarefa de hoje de um técnico. */
function obraDeHoje(): { S: Estado; d: Negocio; ti: number; tec: string } {
  const S = seed();
  for (const x of TECS) {
    const L = trabalhoDoTecnico(S.deals, x.id).filter((w) => !w.t.exec || w.t.exec.estado === "em curso");
    if (L.length) return { S, d: L[0].d, ti: L[0].ti, tec: x.id };
  }
  throw new Error("o exemplo não tem trabalho para hoje");
}
const ctxDe = (S: Estado, extra: Partial<Ctx> = {}): Ctx => ({ S, A: acoes(S, () => {}, (fn) => fn()), run: (fn) => fn(), go: (fn) => () => fn(), q: "", ...extra });

describe("o mesmo dado no Hoje do técnico e no Estúdio da obra", () => {
  it("o técnico termina a tarefa no Hoje: o Estúdio mostra-a feita, por validar, e conta-a como terminada", () => {
    const { S, d, ti, tec } = obraDeHoje();
    S.role = "tecnico"; S.tec = tec;
    const ctx = ctxDe(S);
    ctx.A.enviarRegisto(d.id, ti, { horas: 4, fotos: ["data:image/png;base64,AA"], nota: "Feito.", feita: true });
    const p = d.obra.plano!;
    expect(p.tasks[ti].exec?.estado).toBe("feita");
    expect(terminadasDe(p)).toMatch(/· \d+ por validar$/);
    S.role = "operacoes";
    render(<EstudioObra ctx={ctxDe(S)} d={d} fechar={() => {}} />);
    expect(screen.getAllByRole("button", { name: /Validar (a tarefa feita|\d+ tarefas feitas)/ }).length).toBeGreaterThan(0); // no topo e na barra do polegar
    expect(screen.getAllByText(/terminadas? · \d+ por validar/).length).toBeGreaterThan(0);
  });

  it("o responsável dá a tarefa por feita no Estúdio: o Hoje do técnico mostra-a em «Terminadas hoje»", () => {
    const { S, d, ti, tec } = obraDeHoje();
    S.role = "operacoes";
    ctxDe(S).A.darPorFeita(d.id, ti, { fotos: ["data:image/png;base64,AA"], nota: "" });
    expect(d.obra.plano!.tasks[ti].exec?.estado).toBe("validada");
    expect(terminadasHoje(S.deals, tec).map((x) => x.ti)).toContain(ti);
    S.role = "tecnico"; S.tec = tec;
    render(<HojeTecnico {...ctxDe(S)} />);
    const sec = screen.getByRole("region", { name: /Terminadas hoje/ });
    expect(within(sec).getByText(/dada por feita por/)).toBeTruthy();
  });
});

describe("«Técnicos» (super admin): o técnico mostrado não salta", () => {
  it("o primeiro com trabalho fica no ecrã depois de o responsável lhe dar a tarefa por feita", () => {
    const { S, tec } = obraDeHoje();
    S.role = "operacoes";
    const ctx = ctxDe(S, { verTecnicos: { escolher: () => {} } });
    const eu = () => screen.getByRole("heading", { level: 1 }).textContent;
    const r = render(<HojeTecnico {...ctx} />);
    const antes = eu();
    expect(antes).toContain(TECS.find((x) => x.id === tec)!.n.split(" ")[0]);
    for (const w of trabalhoDoTecnico(S.deals, tec)) ctx.A.darPorFeita(w.d.id, w.ti, { fotos: ["data:image/png;base64,AA"], nota: "" });
    r.rerender(<HojeTecnico {...ctx} />);
    expect(eu()).toBe(antes);
    expect(screen.getByRole("region", { name: /Terminadas hoje/ })).toBeTruthy();
  });
});

describe("as Operações abrem o Estúdio da obra", () => {
  it("com uma obra aberta (S.op), o Estúdio da obra por cima da lista, com «Operações» para voltar", () => {
    const { S, d } = obraDeHoje();
    S.role = "operacoes"; S.view = "operacoes"; S.op = d.id;
    const ctx = ctxDe(S);
    render(<OperacoesSimples {...ctx} />);
    const estudio = screen.getByRole("dialog", { name: new RegExp(d.nome) });
    expect(within(estudio).getByText("Estúdio da obra")).toBeTruthy();
    expect(within(estudio).getByRole("button", { name: "Operações" })).toBeTruthy();
    // a página antiga (o «Agora») já não aparece
    expect(screen.queryByRole("heading", { name: "Agora" })).toBeNull();
  });
});
