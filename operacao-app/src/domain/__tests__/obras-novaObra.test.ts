import { describe, expect, it } from "vitest";
import {
  aplicarRecalculo,
  estadoDoStock,
  ligarMaterial,
  minutosTotais,
  mudarMinutos,
  mudarTarefa,
  necessidadesDeMateriais,
  novaTarefa,
  paraCriar,
  problemaNoPasso2,
  produtosParaStock,
  removerTarefa,
  servicosEditaveis,
  temCiclo,
  type PrevisaoContrato,
  type ProdutoStock,
  type TarefaPrevistaContrato,
} from "../novaObra";

const tarefa = (p: Partial<TarefaPrevistaContrato>): TarefaPrevistaContrato => ({
  id: "t",
  ordem: 1001,
  linha_id: "l1",
  servico_id: "s1",
  servico_tarefa_id: null,
  do_tipo: false,
  nome: "Tarefa",
  fase: 2,
  minutos: 60,
  pessoas_previstas: 1,
  skill_id: null,
  skill_nome: "Eletricidade",
  depende: [],
  procedimento: null,
  materiais: null,
  ferramentas: null,
  materiais_crm: [],
  inicio: "2027-02-01",
  fim: "2027-02-01",
  pessoas: ["u1"],
  livres: ["u1", "u2"],
  ocupados: [{ utilizador_id: "u3", motivo: "ausência: Férias" }],
  ...p,
});

const PREVISAO: PrevisaoContrato = {
  orcamento_id: "q",
  inicio: "2027-02-01",
  minutos: 240,
  outras: [tarefa({ id: "tipo1", ordem: 1, linha_id: null, servico_id: null, do_tipo: true, nome: "Reunião de arranque", fase: 1 })],
  produtos: [{ linha_id: "l9", produto_id: "pSanita", nome: "Sanita", quantidade: 1, origem: "contrato" }],
  servicos: [
    {
      linha_id: "l1",
      servico_id: "s1",
      nome: "Tomadas",
      descricao: null,
      categoria: null,
      quantidade: 6,
      unidade: "un",
      sugerido: true,
      com_modelo: false,
      sem_ficha: false,
      materiais_ficha: [{ produto_id: "pTom", nome: "Tomada", quantidade: 6, origem: "ficha" }],
      tarefas: [
        tarefa({ id: "a", ordem: 1001, nome: "Tomadas: Marcar traçado", minutos: 30, depende: ["tipo1"] }),
        tarefa({ id: "b", ordem: 1002, nome: "Tomadas: Passar cabos", minutos: 90, materiais: "Tomada × 1 /un", depende: ["a"] }),
        tarefa({ id: "c", ordem: 1003, nome: "Tomadas: Ensaio", minutos: 30, depende: ["b"] }),
      ],
    },
    {
      linha_id: "l2",
      servico_id: "s2",
      nome: "Pintura",
      descricao: null,
      categoria: null,
      quantidade: 20,
      unidade: "m2",
      sugerido: false,
      com_modelo: true,
      sem_ficha: false,
      materiais_ficha: [],
      tarefas: [tarefa({ id: "d", ordem: 1004, linha_id: "l2", servico_id: "s2", nome: "Pintura: demão", minutos: 90, skill_id: "k" })],
    },
  ],
};

describe("Nova obra, passo 2 — serviços do contrato", () => {
  it("da pré-visualização para o estado editável, com os materiais da ficha na tarefa principal", () => {
    const s = servicosEditaveis(PREVISAO);
    expect(s).toHaveLength(2);
    expect(minutosTotais(s)).toBe(240);
    const [tom] = s;
    // A principal é a que já traz o texto dos materiais (a biblioteca põe-nos lá).
    expect(tom.tarefas[1].materiais_crm).toEqual([{ produto_id: "pTom", nome: "Tomada", quantidade: 6, origem: "ficha" }]);
    expect(tom.tarefas[0].materiais_crm).toEqual([]);
    expect(tom.tarefas[0].ocupados[0].motivo).toBe("ausência: Férias");
    expect(produtosParaStock(s, PREVISAO).sort()).toEqual(["pSanita", "pTom"]);
  });

  it("paraCriar: posições, 'depois de' em posições (as do tipo de obra caem), pessoas e especialidade", () => {
    const s = servicosEditaveis(PREVISAO);
    const stock = new Map<string, ProdutoStock>([
      ["pTom", { produto_id: "pTom", nome: "Tomada", sku: null, unidade: "un", gere_stock: true, stock: 4, reservado: 1, disponivel: 3 }],
    ]);
    const p = paraCriar(
      mudarTarefa(s, "b", (t) => ({ ...t, pessoas: ["u1", "u2", "u2"], pessoas_previstas: 1 })),
      stock
    );
    expect(p.map((t) => t.nome)).toEqual(["Tomadas: Marcar traçado", "Tomadas: Passar cabos", "Tomadas: Ensaio", "Pintura: demão"]);
    expect(p[0].depende).toEqual([]); // dependia de uma tarefa do tipo de obra: a base liga sozinha
    expect(p[1].depende).toEqual([1]);
    expect(p[2].depende).toEqual([2]);
    expect(p[1].pessoas).toEqual(["u1", "u2"]);
    expect(p[1].pessoas_previstas).toBe(2);
    expect(p[1].materiais_crm[0]).toMatchObject({ produto_id: "pTom", quantidade: 6, unidade: "un", disponivel: 3 });
    expect(p[0].skill_nome).toBe("Eletricidade"); // sem skill_id: vai o nome, a base cria-a
    expect(p[3].skill_id).toBe("k");
    expect(p[3].skill_nome).toBeNull();
    expect(p[0].orcamento_linha_id).toBe("l1");
    expect(p[0].procedimento).toBeNull();
  });

  it("tirar uma tarefa tira-a também dos 'depois de'; acrescentar põe-na depois da última do serviço", () => {
    const s = servicosEditaveis(PREVISAO);
    const sem = removerTarefa(s, "b");
    expect(sem[0].tarefas.map((t) => t.chave)).toEqual(["a", "c"]);
    expect(sem[0].tarefas[1].depende).toEqual([]);
    const nova = novaTarefa(sem[0]);
    expect(nova.depende).toEqual(["c"]);
    expect(nova.linha_id).toBe("l1");
    expect(nova.livres).toBeNull();
  });

  it("ciclos e campos inválidos são apanhados antes de ir à base", () => {
    const s = servicosEditaveis(PREVISAO);
    expect(problemaNoPasso2(s)).toBeNull();
    const ciclo = mudarTarefa(s, "a", (t) => ({ ...t, depende: ["c"] }));
    expect(temCiclo(ciclo)).toBe(true);
    expect(problemaNoPasso2(ciclo)).toMatch(/ciclo/);
    expect(problemaNoPasso2(mudarTarefa(s, "a", (t) => ({ ...t, minutos: 0 })))).toMatch(/minutos/);
    expect(problemaNoPasso2(mudarTarefa(s, "a", (t) => ({ ...t, fase: 10 })))).toMatch(/fase/);
    expect(problemaNoPasso2(mudarTarefa(s, "a", (t) => ({ ...t, nome: "  " })))).toMatch(/sem nome/);
  });

  it("materiais contra o stock: soma por produto e 'faltam N — encomendar'", () => {
    let s = servicosEditaveis(PREVISAO);
    s = mudarTarefa(s, "c", (t) => ligarMaterial(t, { produto_id: "pTom", nome: "Tomada", quantidade: 2, origem: "stock" }));
    s = mudarTarefa(s, "c", (t) => ligarMaterial(t, { produto_id: "pTom", nome: "Tomada", quantidade: 1, origem: "stock" }));
    expect(s[0].tarefas[2].materiais_crm).toHaveLength(1);
    expect(s[0].tarefas[2].materiais_crm[0].quantidade).toBe(3);
    const n = necessidadesDeMateriais(s);
    expect(n).toEqual([{ produto_id: "pTom", nome: "Tomada", unidade: null, quantidade: 9, tarefas: 2 }]);
    const st: ProdutoStock = { produto_id: "pTom", nome: "Tomada", sku: null, unidade: "un", gere_stock: true, stock: 4, reservado: 1, disponivel: 3 };
    expect(estadoDoStock(9, st, true)).toEqual({ tipo: "falta", disponivel: 3, falta: 6 });
    expect(estadoDoStock(3, st, true)).toEqual({ tipo: "chega", disponivel: 3 });
    expect(estadoDoStock(3, undefined, true)).toEqual({ tipo: "sem_registo" });
    expect(estadoDoStock(3, st, false)).toEqual({ tipo: "sem_inventario" });
    // Stock negativo (reservas acima do stock): falta tudo.
    expect(estadoDoStock(2, { ...st, disponivel: -1 }, true)).toEqual({ tipo: "falta", disponivel: -1, falta: 2 });
  });

  it("'Recalcular' atualiza datas e livres; as pessoas só mudam onde o gestor não mexeu", () => {
    let s = servicosEditaveis(PREVISAO);
    s = mudarTarefa(s, "a", (t) => ({ ...t, pessoas: ["u9"], pessoas_manuais: true }));
    const r: PrevisaoContrato = {
      ...PREVISAO,
      servicos: PREVISAO.servicos.map((x) => ({
        ...x,
        tarefas: x.tarefas.map((t) => ({ ...t, id: `novo-${t.id}`, inicio: "2027-02-08", pessoas: ["u2"], livres: ["u2"] })),
      })),
    };
    const depois = aplicarRecalculo(s, r);
    expect(depois[0].tarefas[0].inicio).toBe("2027-02-08");
    expect(depois[0].tarefas[0].pessoas).toEqual(["u9"]);
    expect(depois[0].tarefas[1].pessoas).toEqual(["u2"]);
    expect(depois[0].tarefas[1].livres).toEqual(["u2"]);
    expect(depois[0].tarefas[0].chave).toBe("a"); // as chaves do ecrã não mudam
  });

  it("planeamento automático: a espera, a medida, os fatores e a origem do tempo fazem a ida e volta", () => {
    const comPlano: PrevisaoContrato = {
      ...PREVISAO,
      servicos: [
        {
          ...PREVISAO.servicos[0],
          tarefas: [
            tarefa({
              id: "x", ordem: 1001, nome: "WC: Impermeabilização", minutos: 400, chave_passo: "3.2",
              espera_antes_horas: 48, medida: "m2_total", medida_qt: 27.5, minutos_origem: "aprendido", ritmo_n: 3,
              fatores: { habitada: "sim" }, fatores_chave: "habitada=sim", minutos_juntos: 30,
            }),
          ],
        },
      ],
    };
    const [s] = servicosEditaveis(comPlano);
    expect(s.tarefas[0]).toMatchObject({ espera_antes_horas: 48, medida_qt: 27.5, minutos_origem: "aprendido", ritmo_n: 3 });
    const [p] = paraCriar([s]);
    expect(p).toMatchObject({
      chave_passo: "3.2", espera_antes_horas: 48, medida: "m2_total", medida_qt: 27.5, minutos_origem: "aprendido",
      ritmo_n: 3, fatores: { habitada: "sim" }, fatores_chave: "habitada=sim", minutos_juntos: 30,
    });
    // Mexer nos minutos à mão: a origem passa a "mudado à mão".
    expect(mudarMinutos(s.tarefas[0], 500).minutos_origem).toBe("manual");
    expect(mudarMinutos(s.tarefas[0], 400).minutos_origem).toBe("aprendido");
  });
});
