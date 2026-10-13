/**
 * Nova obra com vários orçamentos aceites e serviços dentro de conjuntos
 * (pós-contrato): de que orçamento vem cada serviço, a chave de um serviço de
 * conjunto, e a ida e volta para a base (p_tarefas) com o orçamento e o
 * componente. As regras da base: tools/validar-obra-arranque.mjs.
 */
import { describe, expect, it } from "vitest";
import {
  chaveServico,
  novaTarefa,
  paraCriar,
  servicosEditaveis,
  variosOrcamentos,
  type PrevisaoContrato,
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
  fase: 3,
  minutos: 60,
  pessoas_previstas: 1,
  skill_id: null,
  skill_nome: null,
  depende: [],
  procedimento: null,
  materiais: null,
  ferramentas: null,
  materiais_crm: [],
  inicio: null,
  fim: null,
  pessoas: [],
  livres: [],
  ...p,
});

const servico = {
  descricao: null,
  categoria: null,
  unidade: "un",
  sugerido: false,
  com_modelo: true,
  sem_ficha: false,
  materiais_ficha: [],
};

const PREVISAO: PrevisaoContrato = {
  orcamento_id: "q2",
  orcamentos: [
    { id: "q1", rotulo: "WC suite", numero: "ORC-1" },
    { id: "q2", rotulo: "WC serviço", numero: "ORC-2" },
  ],
  inicio: null,
  minutos: 0,
  outras: [],
  produtos: [],
  servicos: [
    {
      ...servico,
      linha_id: "l1",
      componente: null,
      orcamento_id: "q1",
      orcamento_rotulo: "WC suite",
      servico_id: "wc",
      nome: "Modelo WC",
      quantidade: 1,
      tarefas: [tarefa({ id: "a", linha_id: "l1", orcamento_id: "q1", nome: "WC suite · Modelo WC: Demolir" })],
    },
    {
      ...servico,
      linha_id: "l2",
      componente: 2,
      orcamento_id: "q1",
      orcamento_rotulo: "WC suite",
      servico_id: "canal",
      nome: "Canalização",
      quantidade: 6,
      tarefas: [tarefa({ id: "b", linha_id: "l2", orcamento_id: "q1", orcamento_componente: 2, nome: "Canalização" })],
    },
    {
      ...servico,
      linha_id: "l3",
      componente: null,
      orcamento_id: "q2",
      orcamento_rotulo: "WC serviço",
      servico_id: "wc",
      nome: "Modelo WC",
      quantidade: 1,
      tarefas: [tarefa({ id: "c", linha_id: "l3", orcamento_id: "q2", nome: "WC serviço · Modelo WC: Demolir" })],
    },
  ],
};

describe("Nova obra com vários orçamentos", () => {
  it("cada serviço sabe de que orçamento vem, e o componente do conjunto", () => {
    const s = servicosEditaveis(PREVISAO);
    expect(s.map((x) => x.orcamento_rotulo)).toEqual(["WC suite", "WC suite", "WC serviço"]);
    expect(s[1].componente).toBe(2);
    expect(s[0].componente).toBeNull();
    expect(variosOrcamentos(s)).toBe(true);
    expect(variosOrcamentos([s[0], s[1]])).toBe(false);
  });

  it("a chave de um serviço distingue a linha direta dos componentes do mesmo conjunto", () => {
    expect(chaveServico({ linha_id: "l2", componente: 2 })).toBe("l2:2");
    expect(chaveServico({ linha_id: "l2", componente: null })).toBe("l2:0");
    expect(chaveServico({ linha_id: "l2", componente: 1 })).not.toBe(chaveServico({ linha_id: "l2", componente: 2 }));
  });

  it("p_tarefas leva o orçamento e o componente de cada tarefa (também das acrescentadas)", () => {
    const s = servicosEditaveis(PREVISAO);
    s[1] = { ...s[1], tarefas: [...s[1].tarefas, novaTarefa(s[1])] };
    const p = paraCriar(s);
    expect(p.map((t) => [t.orcamento_linha_id, t.orcamento_id, t.orcamento_componente])).toEqual([
      ["l1", "q1", null],
      ["l2", "q1", 2],
      ["l2", "q1", 2],
      ["l3", "q2", null],
    ]);
  });

  it("uma previsão antiga (sem orçamentos) continua a funcionar", () => {
    const antiga: PrevisaoContrato = {
      ...PREVISAO,
      orcamentos: undefined,
      servicos: [{ ...servico, linha_id: "l1", servico_id: "s", nome: "S", quantidade: 1, tarefas: [tarefa({})] }],
    };
    const s = servicosEditaveis(antiga);
    expect(s[0].orcamento_id).toBeNull();
    expect(s[0].componente).toBeNull();
    expect(paraCriar(s)[0].orcamento_id).toBeNull();
  });
});
