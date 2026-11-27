// 27/11: as equipas no Estúdio da obra. «Trazer para esta obra» passa as tarefas por começar para os membros do ofício certo (o menos
// carregado), deixa as dos outros ofícios e as começadas; e o bloco mostra as equipas, cria e associa.
import { describe, expect, it } from "vitest";
import { obraDeExemplo } from "./exemploObra";
import { TECS, acoes } from "../motor";
import { tecnicosDoOficio } from "../preparacaoObra";
import { estadoVivo } from "./planoVivo";

describe("associar uma equipa à obra", () => {
  it("passa as tarefas por começar do ofício da equipa para os membros; as outras ficam", () => {
    const { S, d } = obraDeExemplo();
    const avisos: string[] = [];
    const A = acoes(S, (a) => avisos.push(a.msg), (fn) => fn());
    A.role("operacoes");
    const p = d.obra.plano!;
    const hoje = p.estado === "em curso" ? p.dia : 0;
    const porComecar = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => !t.exec && t.dia >= hoje && estadoVivo(t, p) !== "validada");
    const alvo = porComecar.find(({ t }) => tecnicosDoOficio(t).length > 0)!;
    expect(alvo).toBeTruthy();
    // uma equipa com um colega do ofício que ainda não está na tarefa (cópia de um técnico, só para o teste)
    const base = TECS.find((x) => x.id === alvo.t.tec) ?? tecnicosDoOficio(alvo.t)[0];
    TECS.push({ ...base, id: "t-equipa-teste", n: "Membro Teste", feriasDatas: [] } as typeof base);
    try {
      const antes = p.tasks.map((t) => t.tec);
      const n = A.associarEquipa(d.id, { nome: "Equipa Teste", membros: ["t-equipa-teste"] });
      expect(n).toBeGreaterThan(0);
      expect(p.tasks[alvo.ti].tec).toBe("t-equipa-teste");
      // as começadas e as de outros ofícios não mudam
      p.tasks.forEach((t, ti) => {
        const doOficio = tecnicosDoOficio(t).some((x) => x.id === "t-equipa-teste");
        if (t.exec || !doOficio) expect(t.tec).toBe(antes[ti]);
      });
      expect(avisos.at(-1)).toMatch(/Equipa Teste na obra|O plano mudou/);
      // outra vez: nada a mudar
      expect(A.associarEquipa(d.id, { nome: "Equipa Teste", membros: ["t-equipa-teste"] })).toBe(0);
    } finally { TECS.splice(TECS.findIndex((x) => x.id === "t-equipa-teste"), 1); }
  });
});

describe("a proposta de distribuição da equipa", () => {
  it("dá todas as tarefas por começar aos membros: o ofício primeiro, as outras a quem tem menos horas (marcadas)", async () => {
    const { propostaDeEquipa } = await import("../motor");
    const { S, d } = obraDeExemplo();
    void S;
    const p = d.obra.plano!;
    const hoje = p.estado === "em curso" ? p.dia : 0;
    const porComecar = p.tasks.filter((t) => !t.exec && t.dia >= hoje && estadoVivo(t, p) !== "validada" && estadoVivo(t, p) !== "feita").length;
    const membros = [...new Set(p.tasks.map((t) => t.tec).filter((x): x is string => !!x))].slice(0, 2);
    const L = propostaDeEquipa(p, membros);
    expect(L.length).toBe(porComecar);
    expect(L.every((x) => membros.includes(x.para))).toBe(true);
    for (const x of L) if (x.doOficio) expect(tecnicosDoOficio(p.tasks[x.ti]).some((y) => y.id === x.para)).toBe(true);
    // não muda o plano
    expect(p.tasks.map((t) => t.tec)).toEqual(obraDeExemplo().d.obra.plano!.tasks.map((t) => t.tec));
  });
});
