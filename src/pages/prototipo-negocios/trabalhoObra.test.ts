// O dia a dia da obra (21/10/2026): o técnico pelo Hoje (passos, registo do dia), o gestor (validar, ajustar ao vivo, dias para trás) e o cliente.
import { describe, expect, it } from "vitest";
import { acoes, seed, type Estado, type Negocio } from "./motor";
import { fimDe } from "./ajustesPlano";
import { estadoDe } from "./obraOps";
import {
  diaDaTarefa, duracaoMinima, instrucoesDe, oDia, podeAjustar, preverAjuste, registouNoDia, tecnicosComTrabalho, tempoDoDia, trabalhoDoTecnico,
} from "./trabalhoObra";

function obra(id = 1022) {
  const S: Estado = seed();
  const avisos: string[] = [];
  const A = acoes(S, (a) => avisos.push(a.msg + " · " + (a.sub ?? "")), (fn) => fn());
  const d = S.deals.find((x) => x.id === id) as Negocio;
  return { S, A, d, p: d.obra.plano!, avisos };
}
const foto = "data:image/svg+xml;utf8,x";

describe("as instruções", () => {
  it("cada ofício tem o seu passo a passo, o que verificar e a proteção", () => {
    expect(instrucoesDe({ nome: "Demolição", sk: "Servente · demolição" }).passos[0]).toMatch(/louças/);
    expect(instrucoesDe({ nome: "Canalização", sk: "Canalizador" }).passos.some((x) => /ensaio de pressão/i.test(x))).toBe(true);
    expect(instrucoesDe({ nome: "Revestimento e pavimento", sk: "Ladrilhador" }).verificar.some((x) => /som oco/.test(x))).toBe(true);
    expect(instrucoesDe({ nome: "Coisa nova", sk: "Outro" }).passos.length).toBeGreaterThan(0);
  });
});

describe("o exemplo da obra em curso (1022)", () => {
  it("tem histórico: a demolição validada e a canalização por validar, com fotografias", () => {
    const { p } = obra();
    const dem = p.tasks.find((t) => /demol/i.test(t.nome))!, can = p.tasks.find((t) => /canaliz/i.test(t.nome))!;
    expect(dem.exec!.envios!.map((e) => e.k)).toEqual(["feita", "validada"]);
    expect(can.exec!.envios![0].fotos!.length).toBeGreaterThan(0);
    expect(registouNoDia(dem, dem.dia)).toBe(true);
  });
  it("o Hoje do Hugo tem o revestimento; quem tem trabalho hoje aparece para escolher", () => {
    const { S } = obra();
    const H = trabalhoDoTecnico(S.deals, "hn");
    expect(H.some((x) => /revest/i.test(x.t.nome))).toBe(true);
    expect(tecnicosComTrabalho(S.deals)).toContain("hn");
  });
});

describe("o técnico pelo Hoje", () => {
  it("marca passos, envia o registo do dia (vai ao diário e ao histórico) e no último dia termina", () => {
    const { A, d, p, avisos } = obra();
    const ti = p.tasks.findIndex((t) => /revest/i.test(t.nome)), t = p.tasks[ti];
    A.marcarPasso(d.id, ti, 0); A.marcarPasso(d.id, ti, 1);
    expect(t.exec!.passos).toEqual([0, 1]);
    A.marcarPasso(d.id, ti, 1);
    expect(t.exec!.passos).toEqual([0]);
    // sem descrição não dá
    A.enviarRegisto(d.id, ti, { horas: 7, fotos: [foto], nota: "" });
    expect(avisos.at(-1)).toMatch(/Ainda não dá/);
    A.enviarRegisto(d.id, ti, { horas: 7, fotos: [foto], nota: "Paredes do duche assentes." });
    expect(t.exec!.horas).toBe(7);
    expect(t.exec!.envios!.at(-1)!.k).toBe("registo");
    expect(t.exec!.envios!.at(-1)!.passos).toEqual([instrucoesDe(t).passos[0]]);
    expect(d.obra.diario!.at(-1)!.t).toMatch(/Paredes do duche/);
    expect(registouNoDia(t, p.dia)).toBe(true);
    // dia seguinte (o último da tarefa): termina
    A.irParaDia(d.id, p.dia + 1);
    expect(diaDaTarefa(t, p.dia)).toBe(t.dur);
    A.enviarRegisto(d.id, ti, { horas: 7.5, fotos: [foto, foto], nota: "Chão e juntas feitos.", feita: true });
    expect(estadoDe(t)).toBe("feita");
    expect(t.exec!.horas).toBe(14.5);
    // o responsável pede correção; o técnico volta a enviar; o responsável valida
    A.pedirCorrecao(d.id, ti, "Junta por limpar no canto");
    expect(estadoDe(t)).toBe("corrigir");
    A.enviarRegisto(d.id, ti, { horas: 0.5, fotos: [foto], nota: "Junta limpa.", feita: true });
    A.validarTarefa(d.id, ti);
    expect(t.exec!.envios!.map((e) => e.k)).toEqual(["registo", "feita", "correcao", "feita", "validada"]);
  });
});

describe("o gestor", () => {
  it("anda nos dias para trás e para a frente, dentro da obra; os registos ficam", () => {
    const { A, d, p } = obra();
    const d0 = p.dia;
    A.irParaDia(d.id, d0 - 1);
    expect(p.dia).toBe(d0 - 1);
    expect(tempoDoDia(p, d0)).toBe("futuro");
    A.irParaDia(d.id, -5);
    expect(p.dia).toBe(0);
    A.irParaDia(d.id, 99);
    expect(p.dia).toBe(fimDe(p.tasks) - 1);
    expect(oDia(p, 0).some(({ envios }) => envios.length > 0)).toBe(true);
  });
  it("ajusta ao vivo: não mexe nas validadas, não deixa acabar antes de hoje, avisa o cliente", () => {
    const { A, d, p } = obra();
    const dem = p.tasks.findIndex((t) => /demol/i.test(t.nome));
    expect(podeAjustar(p, dem).dur).toBe(false);
    const rev = p.tasks.findIndex((t) => /revest/i.test(t.nome)), t = p.tasks[rev];
    expect(duracaoMinima(p, rev)).toBe(p.dia - t.dia + 1);
    const fim0 = fimDe(p.tasks);
    const prev = preverAjuste(p, rev, { dur: t.dur + 1 });
    expect(prev.fimDepois).toBe(fim0 + 1);
    expect(fimDe(p.tasks)).toBe(fim0); // a pré-visualização não mexe
    expect(prev.mexe.length).toBeGreaterThan(0);
    A.ajustarAoVivo(d.id, rev, { dur: t.dur + 1 }, "Imprevisto na obra", true);
    expect(fimDe(p.tasks)).toBe(fim0 + 1);
    const a = d.obra.alteracoes![0];
    expect(a.cliente).toBe(true);
    expect(a.avisoCliente).toMatch(/passa a acabar/);
    expect(d.obra.diario!.at(-1)!.t).toMatch(/cliente avisado/);
    // as tarefas já validadas não andam
    expect(p.tasks[dem].dia).toBe(0);
  });
  it("sem motivo, não ajusta", () => {
    const { A, d, p } = obra();
    const rev = p.tasks.findIndex((t) => /revest/i.test(t.nome)), fim0 = fimDe(p.tasks);
    A.ajustarAoVivo(d.id, rev, { dur: p.tasks[rev].dur + 1 }, "  ", true);
    expect(fimDe(p.tasks)).toBe(fim0);
    expect(d.obra.alteracoes ?? []).toHaveLength(0);
  });
});
