// 27/10: a obra do caso Anabela a meio (/sem-conta?caso=anabela-obra-a-meio), só para ver no ecrã: monta-se sem erros e
// tem tarefas validadas, por validar, em curso e por começar.
import { beforeEach, describe, expect, it } from "vitest";
import { acoes, type Aviso, type Estado } from "../motor";
import { estadoVazio } from "../estadoOrganizacao";
import { ligarCatalogo } from "../produtosVisita";
import { usarTecnicos } from "../equipa/tecnicos";
import { esquecerInventario } from "../inventario/loja";
import { receberTudo } from "../testeObra";
import { K_ANABELA, avancarAteObra, avancarObraAMeio, complicarObra, montarAnabela, orcamentoLongo } from "./montarAnabela";

beforeEach(() => { localStorage.clear(); esquecerInventario(); ligarCatalogo(() => K_ANABELA); });

describe("a obra do caso a meio", () => {
  it("arranca e fica com tarefas em todos os estados", () => {
    const S: Estado = estadoVazio("org-caso-real");
    usarTecnicos(S.tecnicos!);
    const avisos: Aviso[] = [];
    const A = acoes(S, (a) => avisos.push(a), (fn) => fn());
    const M = montarAnabela(S, A, avisos);
    avancarAteObra(S, A, M.id, avisos);
    avancarObraAMeio(S, A, M.id, receberTudo);
    const p = S.deals.find((x) => x.id === M.id)!.obra.plano!;
    expect(p.estado).toBe("em curso");
    const conta = (e?: string) => p.tasks.filter((t) => t.exec?.estado === e).length;
    expect(conta("validada")).toBeGreaterThan(5);
    expect(conta("feita")).toBe(2);
    expect(conta("em curso")).toBeGreaterThan(0);
    expect(conta(undefined)).toBeGreaterThan(5);
    // algumas com mais horas do que o previsto (o desvio à vista)
    expect(p.tasks.some((t) => t.exec && t.exec.horas > t.h * 1.1)).toBe(true);
  });

  it("a obra complexa: correção, imprevistos, adenda, problema, mensagens, e um 2.º negócio com o orçamento longo", () => {
    const S: Estado = estadoVazio("org-caso-real");
    usarTecnicos(S.tecnicos!);
    const avisos: Aviso[] = [];
    const A = acoes(S, (a) => avisos.push(a), (fn) => fn());
    const M = montarAnabela(S, A, avisos);
    avancarAteObra(S, A, M.id, avisos);
    avancarObraAMeio(S, A, M.id, receberTudo);
    complicarObra(S, A, M.id);
    const d = S.deals.find((x) => x.id === M.id)!, p = d.obra.plano!;
    expect(p.tasks.some((t) => t.corrige != null), "correção: " + JSON.stringify(avisos.slice(-3))).toBe(true);
    expect(d.obra.imprevistos?.length).toBe(2);
    expect(d.adendas?.length).toBe(1);
    expect(d.obra.chat?.filter((m) => m.de === "cliente" && !m.lida).length).toBe(2);
    expect(d.obra.diario?.some((e) => e.k === "ocorrencia" && /caixa de azulejo/.test(e.t))).toBe(true);
    const id2 = orcamentoLongo(S, A);
    const d2 = S.deals.find((x) => x.id === id2)!;
    expect(id2).not.toBe(M.id);
    expect(d2.orc!.linhas.length).toBeGreaterThan(40);
    expect(d2.orc!.enviada).toBeFalsy();
  });
});
