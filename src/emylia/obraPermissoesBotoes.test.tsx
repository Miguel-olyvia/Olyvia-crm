// 6/11/2026 (permissões): na página da obra (/negocios), os botões de ação pedem o papel E a permissão. Antes, um Comercial sem
// negocios.obra.* que mudasse para «Gestor de obra» no «A ver como» via (e abria) Ajustar o plano, Dar por feita, Validar, Validar várias,
// Registar imprevisto, os problemas do cliente, Nova tarefa e o ajuste ao vivo. As ações do motor que não verificavam permissão
// (registarImprevisto, tratar/descartar/decidir problemas) também passam a recusar.
// Mapa: ajustar/dar por feita/validar/pedir correção/nova tarefa → negocios.obra.planear; problemas e decidir imprevistos →
// negocios.obra.imprevistos; registar imprevisto → negocios.obra.executar OU negocios.obra.imprevistos; encerrar → negocios.obra.fechar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { acoes, seed, type Aviso, type Estado, type Negocio } from "./motor";
import { CODIGO_BASE, SEM_PERM, definirPermissoesReais, type PermNeg } from "./permissoes";
import { esquecerInventario } from "./inventario/loja";
import { AcaoMensagemCliente } from "./ProblemasObra";
import { Montar } from "./v2/testeV2";
import type { ProblemaCliente } from "./problemasCliente";

const TODOS = Object.values(CODIGO_BASE);
const DA_OBRA: PermNeg[] = ["obra.planear", "obra.executar", "obra.imprevistos", "obra.fechar"];
/** As permissões reais de quem entrou: todas as de CODIGO_BASE menos as `negadas`. */
const reais = (negadas: PermNeg[] = []) =>
  definirPermissoesReais({ codigos: new Set(TODOS.filter((c) => !negadas.some((p) => CODIGO_BASE[p] === c))), simular: false });

afterEach(() => { cleanup(); definirPermissoesReais(null); localStorage.clear(); window.history.replaceState(null, "", "/"); });
beforeEach(() => { esquecerInventario(); Element.prototype.scrollIntoView = vi.fn(); });

/** A obra 1022 (em curso, hoje o dia 3): duas tarefas feitas à espera de validação (uma delas hoje) e uma por fazer hoje. */
function preparar(): { S: Estado; d: Negocio } {
  const S = seed(), d = S.deals.find((x) => x.id === 1022)!, p = d.obra.plano!;
  p.tasks[1].dia = p.dia;
  p.tasks[3].exec = { estado: "feita", horas: 6, fotos: [] };
  S.role = "operacoes";
  return { S, d };
}
const botao = (n: string | RegExp) => screen.queryByRole("button", { name: n });

// 20/11: os testes da página antiga da obra (PaginaObra, TarefasDoPlano) saíram com ela; o Estúdio da obra tem os seus.
describe("a conversa da obra: com as permissões, tudo como antes", () => {
  it("«Tratar como problema» numa mensagem do cliente", () => {
    const { S, d } = preparar();
    reais();
    const m = (d.obra.chat ?? []).find((x) => x.de === "cliente")!;
    render(<Montar S={S}>{(ctx) => <AcaoMensagemCliente ctx={ctx} d={d} m={m} chave="local-0" abrir={() => undefined} />}</Montar>);
    expect(botao("Tratar como problema")).toBeTruthy();
  });
});

describe("o motor: as ações de obra que não pediam permissão", () => {
  const montar = (negadas: PermNeg[]) => {
    const { S, d } = preparar();
    const avisos: Aviso[] = [];
    const A = acoes(S, (a) => avisos.push(a), (fn) => fn());
    reais(negadas);
    return { S, d, A, avisos };
  };
  const recusado: ProblemaCliente = { id: "PC-1022-9", msg: "local-9", texto: "Mancha", fotos: [], q: "", estado: "recusado", cobrar: true, tarefas: [] };
  const origem = { msg: "local-0", texto: "Há uma mancha", fotos: [] };

  it("registarImprevisto: sem executar nem imprevistos recusa; com uma das duas passa", () => {
    const sem = montar(DA_OBRA);
    expect(sem.A.registarImprevisto(sem.d.id, { texto: "Cano roto", onde: "", grav: "atrasa", tarefas: [2], dias: 1 })).toBeNull();
    expect(sem.avisos.some((a) => a.msg === "Sem permissão para registar o imprevisto")).toBe(true);
    expect(sem.d.obra.imprevistos ?? []).toHaveLength(0);
    cleanup();
    for (const tem of ["obra.executar", "obra.imprevistos"] as PermNeg[]) {
      const c = montar(DA_OBRA.filter((x) => x !== tem));
      expect(c.A.registarImprevisto(c.d.id, { texto: "Cano roto", onde: "", grav: "atrasa", tarefas: [2], dias: 1 })).toBeTruthy();
      expect(c.d.obra.imprevistos).toHaveLength(1);
    }
  });

  it("tratar, descartar e decidir problemas: sem negocios.obra.imprevistos recusam", () => {
    const { d, A, avisos } = montar(["obra.imprevistos"]);
    (d.obra.problemas ??= []).push({ ...recusado });
    expect(A.tratarProblema(d.id, origem, { tarefas: [{ n: "Pintar", h: 2, tec: "ma" }], cobrar: false, motivo: "garantia" })).toBeNull();
    A.descartarProblema(d.id, origem, "");
    expect(A.decidirProblema(d.id, recusado.id, "nao_fazer")).toBeNull();
    expect(avisos.filter((a) => a.msg === SEM_PERM["obra.imprevistos"].msg)).toHaveLength(3);
    expect(d.obra.problemas).toHaveLength(1);
    expect(d.obra.problemas![0].estado).toBe("recusado");
  });

  it("com negocios.obra.imprevistos funcionam como antes", () => {
    const { d, A, avisos } = montar([]);
    (d.obra.problemas ??= []).push({ ...recusado });
    A.descartarProblema(d.id, origem, "");
    expect(d.obra.problemas!.find((x) => x.msg === "local-0")?.estado).toBe("descartado");
    expect(A.decidirProblema(d.id, recusado.id, "nao_fazer")).toBeTruthy();
    expect(d.obra.problemas!.find((x) => x.id === recusado.id)?.estado).toBe("fechado");
    expect(avisos.some((a) => a.msg === SEM_PERM["obra.imprevistos"].msg)).toBe(false);
  });

  // 9/11 (Lote 1, C, aprovado): fora do papel do gestor, os problemas passam a ser de quem tem o que o servidor exige (imprevistos E
  // planear); sem planear, no papel Comercial, continuam a recusar
  it("no papel Comercial: sem negocios.obra.planear os problemas recusam; com ela (e imprevistos) passam", () => {
    const sem = montar(["obra.planear"]);
    sem.S.role = "comercial";
    sem.A.descartarProblema(sem.d.id, origem, "");
    expect(sem.d.obra.problemas ?? []).toHaveLength(0);
    expect(sem.avisos.some((a) => /gestor da obra/.test(a.msg))).toBe(true);
    const com = montar([]);
    com.S.role = "comercial";
    com.A.descartarProblema(com.d.id, origem, "");
    expect(com.d.obra.problemas?.find((x) => x.msg === "local-0")?.estado).toBe("descartado");
  });
});
