// 30/10 (20270101340000): os papéis do Negócio vêm do RH. O "A ver como" só mostra os da pessoa (ou todos, a quem vê todos), a página abre
// no primeiro papel da pessoa, e o nome de quem faz o papel é o da pessoa do RH. E o plano da obra: um técnico do RH com vários ofícios
// conta em todos (antes só no primeiro, e o Diogo, canalizador e montador, ficava fora das tarefas de um deles), e as tarefas por atribuir
// de um plano por aprovar ficam com o técnico que o RH já tem.
import { afterEach, describe, expect, it } from "vitest";
import { PAPEIS, type Plano } from "../motor";
import { podeNeg } from "../permissoes";
import { TECNICOS, tecnicosIniciais, usarTecnicos, type FichaTecnico } from "../equipa/tecnicos";
import { atribuirPorAtribuir, tecnicosDoOficio } from "../preparacaoObra";
import { aplicarNomesPapeis, aplicarPermissoesReais, papeisDoLido, papeisPermitidos, papelInicial, reporNomesPapeis } from "./papeisReal";

afterEach(() => { reporNomesPapeis(); usarTecnicos(tecnicosIniciais()); });

describe("os papéis de quem entrou", () => {
  it("limpa o que a base devolve: papéis desconhecidos saem, sem pessoa fica null", () => {
    expect(papeisDoLido({ papeis: ["financeiro", "x", "tecnico", "financeiro"], pessoa: null, todos: false }))
      .toEqual({ papeis: ["financeiro", "tecnico"], pessoa: null, todos: false });
    expect(papeisDoLido(null)).toEqual({ papeis: [], pessoa: null, todos: false });
  });

  it("o A ver como: só os papéis da pessoa, pela ordem do circuito; quem vê todos tem os sete", () => {
    const m = papeisDoLido({ papeis: ["operacoes", "financeiro"], pessoa: { id: "p", nome: "Inês Lourenço" }, todos: false });
    expect(papeisPermitidos(m)).toEqual(["financeiro", "operacoes"]);
    expect(papeisPermitidos({ ...m, todos: true })).toHaveLength(Object.keys(PAPEIS).length);
  });

  it("abre no papel que já tinha se é dela; senão no primeiro que não é o técnico; sem papéis, em nenhum", () => {
    const fin = papeisDoLido({ papeis: ["financeiro"], todos: false });
    expect(papelInicial(fin, "comercial")).toBe("financeiro");
    expect(papelInicial(fin, "financeiro")).toBe("financeiro");
    expect(papelInicial(papeisDoLido({ papeis: ["tecnico", "operacoes"], todos: false }), "comercial")).toBe("operacoes");
    expect(papelInicial(papeisDoLido({ papeis: ["tecnico"], todos: false }), "comercial")).toBe("tecnico");
    expect(papelInicial(papeisDoLido({ papeis: [], todos: false }), "comercial")).toBeNull();
    expect(papelInicial(papeisDoLido({ papeis: [], todos: true }), "comercial")).toBe("comercial");
  });

  it("o nome do papel é o da pessoa nos papéis dela, e só o papel nos outros (sem a Sandra do exemplo); ao sair volta", () => {
    aplicarNomesPapeis(papeisDoLido({ papeis: ["financeiro"], pessoa: { id: "p", nome: "Inês Lourenço" }, todos: true }));
    expect(PAPEIS.financeiro.n).toBe("Inês · Financeiro");
    expect(PAPEIS.armazem.n).toBe("Compras e armazém");
    expect(PAPEIS.operacoes.n).toBe("Gestor de obra");
    reporNomesPapeis();
    expect(PAPEIS.financeiro.n).toBe("Sandra · Financeiro");
  });
});

const tec = (id: string, n: string, perfis: string[]): FichaTecnico =>
  ({ id, n, sk: "", perfilId: perfis[0], perfis, ferias: [], custoHora: 16, tel: "", desde: "" }) as unknown as FichaTecnico;

describe("as permissões do Financeiro na Olyvia", () => {
  it("só o Financeiro regista a fatura e valida o pagamento (a Direção já não); ao sair, a V1 volta a ser como era", () => {
    expect(podeNeg("direcao", "finance.validate_payment")).toBe(true);
    aplicarPermissoesReais();
    expect(podeNeg("direcao", "finance.validate_payment")).toBe(false);
    expect(podeNeg("direcao", "finance.invoice")).toBe(false);
    expect(podeNeg("direcao", "margin.approve")).toBe(true);
    expect(podeNeg("financeiro", "finance.validate_payment")).toBe(true);
    reporNomesPapeis();
    expect(podeNeg("direcao", "finance.validate_payment")).toBe(true);
  });
});

describe("os técnicos do RH no plano da obra", () => {
  it("um técnico com vários ofícios conta em todos, não só no primeiro", () => {
    usarTecnicos([tec("diogo", "Diogo Pereira", ["canalizador", "montador"]), tec("sergio", "Sérgio Matos", ["ladrilhador"])]);
    expect(tecnicosDoOficio({ sk: "Montador", perfilId: "montador" }).map((x) => x.id)).toEqual(["diogo"]);
    expect(tecnicosDoOficio({ sk: "Canalizador", perfilId: "canalizador" }).map((x) => x.id)).toEqual(["diogo"]);
    expect(TECNICOS).toHaveLength(2);
  });

  it("as tarefas por atribuir de um plano por aprovar ficam com o técnico do ofício; as sem técnico no RH continuam por atribuir", () => {
    usarTecnicos([tec("diogo", "Diogo Pereira", ["canalizador", "montador"]), tec("sergio", "Sérgio Matos", ["ladrilhador"])]);
    const t = (nome: string, perfilId: string, dia: number) => ({ nome, svcs: [], dia, dur: 1, sk: "", perfilId, h: 8, tec: null, fase: 2 });
    const p: Plano = { tasks: [t("Canalização", "canalizador", 0), t("Revestimento", "ladrilhador", 1), t("Pintura", "pintor", 2), t("Espelho", "montador", 3)],
      estado: "por aprovar", dia: 0, origem: "orcamento", inicio: "2026-11-02" };
    expect(atribuirPorAtribuir(p)).toBe(3);
    expect(p.tasks.map((x) => x.tec)).toEqual(["diogo", "sergio", null, "diogo"]);
    // um plano aprovado não muda sozinho
    const ap: Plano = { ...p, estado: "aprovado", tasks: [t("Canalização", "canalizador", 0)] };
    expect(atribuirPorAtribuir(ap)).toBe(0);
    expect(ap.tasks[0].tec).toBeNull();
  });
});
