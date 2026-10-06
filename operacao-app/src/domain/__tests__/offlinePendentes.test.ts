import { describe, expect, it } from "vitest";
import { aplicarPendentesObra } from "../offlineObras";
import { aplicarPendentesOrdem } from "../offlineOrdens";
import type { TarefaObra } from "../../lib/obras";
import type { MedicaoDaTarefa, TarefaDaOrdem } from "../../lib/dados";
import type { AcaoOffline } from "../../lib/offline/fila";

const tarefa = (id: string, extra: Partial<TarefaObra> = {}) =>
  ({ id, obra_id: "o1", estado: "por_fazer", a_correr: 0, minutos_reais: 0, ...extra }) as TarefaObra;

let seq = 0;
const acao = (tipo: AcaoOffline["tipo"], args: Record<string, unknown>, extra: Partial<AcaoOffline> = {}): AcaoOffline => ({
  id: `a${++seq}`,
  tipo,
  chave: String(args.tarefaId),
  args,
  rotulo: tipo,
  criadaEm: `2026-10-06T10:0${seq % 10}:00.000Z`,
  seq,
  estado: "pendente",
  tentativas: 0,
  ...extra,
});

describe("aplicarPendentesObra", () => {
  it("iniciar sem rede: a tarefa fica em curso e o relógio a correr desde a hora do toque", () => {
    const a = acao("obra_iniciar", { tarefaId: "t1" });
    const v = aplicarPendentesObra([tarefa("t1"), tarefa("t2")], null, [a], "eu");
    expect(v.tarefas[0].estado).toBe("em_curso");
    expect(v.aberto?.tarefa_id).toBe("t1");
    expect(v.aberto?.inicio).toBe(a.criadaEm);
    expect(v.porEnviar.get("t1")).toBe(1);
    expect(v.tarefas[1].estado).toBe("por_fazer");
  });

  it("iniciar e terminar sem rede: fica feita e sem relógio", () => {
    const v = aplicarPendentesObra(
      [tarefa("t1")],
      null,
      [acao("obra_iniciar", { tarefaId: "t1" }), acao("obra_concluir", { tarefaId: "t1" })],
      "eu"
    );
    expect(v.tarefas[0].estado).toBe("feita");
    expect(v.aberto).toBeNull();
    expect(v.porEnviar.get("t1")).toBe(2);
  });

  it("o que a base recusou não aparece como feito, e diz porquê", () => {
    const v = aplicarPendentesObra(
      [tarefa("t1")],
      null,
      [acao("obra_iniciar", { tarefaId: "t1" }, { estado: "conflito", erro: "Já tens «Pintar» a correr." })],
      "eu"
    );
    expect(v.tarefas[0].estado).toBe("por_fazer");
    expect(v.recusadas.get("t1")).toContain("Pintar");
  });

  it("não mexe na lista original", () => {
    const lista = [tarefa("t1")];
    aplicarPendentesObra(lista, null, [acao("obra_concluir", { tarefaId: "t1" })], "eu");
    expect(lista[0].estado).toBe("por_fazer");
  });
});

describe("aplicarPendentesOrdem", () => {
  const t = { id: "x1", estado: "pendente", valor_num: null, valor_texto: null, observacoes: null } as TarefaDaOrdem;
  const m = {
    id: "m1",
    ordem_tarefa_id: "x1",
    medicao_def_id: "d1",
    valor_num: null,
    valor_texto: null,
    opcao_id: null,
    conforme: true,
    lida_em: null,
  } as MedicaoDaTarefa;

  it("a resposta e a leitura dadas sem rede aparecem já, sem veredicto", () => {
    const v = aplicarPendentesOrdem(
      [t],
      [m],
      [
        acao("ordem_responder", { tarefaId: "x1", estado: "conforme", observacoes: "ok" }),
        acao("ordem_medicao", { tarefaId: "x1", medicaoDefId: "d1", valorNum: 12.5 }),
      ]
    );
    expect(v.tarefas[0].estado).toBe("conforme");
    expect(v.tarefas[0].observacoes).toBe("ok");
    expect(v.medicoes[0].valor_num).toBe(12.5);
    expect(v.medicoes[0].conforme).toBeNull(); // só a base decide
    expect(v.porEnviar.has("x1")).toBe(true);
  });

  it("ignora ações de tarefas de outras ordens", () => {
    const v = aplicarPendentesOrdem([t], [m], [acao("ordem_responder", { tarefaId: "outra", estado: "conforme" })]);
    expect(v.tarefas[0]).toBe(t);
    expect(v.porEnviar.size).toBe(0);
  });
});
