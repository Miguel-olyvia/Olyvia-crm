// 30/10 (20270101340000): os papéis do Negócio vêm do RH. O "A ver como" só mostra os da pessoa (ou todos, a quem vê todos), a página abre
// no primeiro papel da pessoa, e o nome de quem faz o papel é o da pessoa do RH. E o plano da obra: um técnico do RH com vários ofícios
// conta em todos (antes só no primeiro, e o Diogo, canalizador e montador, ficava fora das tarefas de um deles), e as tarefas por atribuir
// de um plano por aprovar ficam com o técnico que o RH já tem.
import { afterEach, describe, expect, it } from "vitest";
import { PAPEIS, type Plano } from "../motor";
import { podeNeg } from "../permissoes";
import { RESPONSAVEL_OBRA, equipaDaObra, equipamentosDaObra } from "../obraOps";
import { RESPONSAVEIS_OBRA } from "../campos";
import { TECNICOS, tecnicosIniciais, usarTecnicos, type FichaTecnico } from "../equipa/tecnicos";
import { atribuirPorAtribuir, tecnicosDoOficio } from "../preparacaoObra";
import { CODIGO_BASE } from "../permissoes";
import { aplicarGestoresObra, aplicarNomesPapeis, aplicarPermissoesReais, definirResponsavelObra, papeisDoLido, papeisPermitidos, papelDeAbertura, papelInicial, papelMaisEspecifico, reporNomesPapeis } from "./papeisReal";

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

// 11/11: o papel com que a página abre. O Financeiro (finance.*, pessoas.edit, sem papel na ficha RH) abria no Comercial: com `todos`
// mantinha-se o S.role de partida. Agora, sem papel no RH, abre no papel mais específico que as permissões do perfil dão.
describe("o papel com que a página abre", () => {
  const cods = (...k: (keyof typeof CODIGO_BASE)[]) => new Set(k.map((x) => CODIGO_BASE[x]));
  const semRH = (todos: boolean) => papeisDoLido({ papeis: [], todos });

  it("financeiro sem papel no RH e com todos (pessoas.edit) → Financeiro; o A ver como continua com todos", () => {
    const r = papelDeAbertura(semRH(true), cods("finance.validate_payment", "finance.invoice"), "comercial");
    expect(r.papel).toBe("financeiro");
    expect(papeisPermitidos(r.meus)).toHaveLength(Object.keys(PAPEIS).length);
    // e sem todos, também
    expect(papelDeAbertura(semRH(false), cods("finance.validate_payment"), "comercial").papel).toBe("financeiro");
  });

  it("gestor de obra (obra.planear) → Gestor de obra, mesmo com permissões do comercial", () => {
    expect(papelDeAbertura(semRH(false), cods("obra.planear"), "comercial").papel).toBe("operacoes");
    expect(papelDeAbertura(semRH(true), cods("obra.planear", "contacto.registar"), "comercial").papel).toBe("operacoes");
  });

  it("comercial (contacto.registar / visita.gerir) → Comercial", () => {
    expect(papelDeAbertura(semRH(false), cods("contacto.registar"), "financeiro").papel).toBe("comercial");
    expect(papelDeAbertura(semRH(true), cods("visita.gerir"), "financeiro").papel).toBe("comercial");
  });

  it("com papel RH «Comercial» → Comercial, as permissões não contam", () => {
    const rh = papeisDoLido({ papeis: ["comercial"], todos: false });
    expect(papelDeAbertura(rh, cods("finance.validate_payment"), "comercial").papel).toBe("comercial");
    expect(papelDeAbertura({ ...rh, todos: true }, null, "comercial").papel).toBe("comercial");
  });

  it("sem nada → como hoje: sem todos, nenhum papel; com todos, o que já estava", () => {
    expect(papelDeAbertura(semRH(false), new Set(), "comercial").papel).toBeNull();
    expect(papelDeAbertura(semRH(false), null, "comercial").papel).toBeNull();
    expect(papelDeAbertura(semRH(true), new Set(), "comercial").papel).toBe("comercial");
    expect(papelDeAbertura(semRH(true), null, "direcao").papel).toBe("direcao");
  });

  it("a escolha à mão nesta página fica, se é permitida", () => {
    const fin = cods("finance.validate_payment");
    expect(papelDeAbertura(semRH(true), fin, "comercial", "direcao").papel).toBe("direcao");
    // sem todos, uma escolha que deixou de ser permitida não fica
    expect(papelDeAbertura(semRH(false), fin, "comercial", "direcao").papel).toBe("financeiro");
  });

  it("a ordem: financeiro, armazém, gestor de obra, direção, comercial; o técnico só se não houver outro", () => {
    expect(papelMaisEspecifico(["comercial", "direcao", "financeiro", "armazem", "operacoes"])).toBe("financeiro");
    expect(papelMaisEspecifico(["comercial", "direcao", "armazem", "operacoes"])).toBe("armazem");
    expect(papelMaisEspecifico(["comercial", "direcao", "operacoes"])).toBe("operacoes");
    expect(papelMaisEspecifico(["comercial", "direcao"])).toBe("direcao");
    expect(papelMaisEspecifico(["tecnico", "comercial"])).toBe("comercial");
    expect(papelMaisEspecifico(["tecnico"])).toBe("tecnico");
    expect(papelMaisEspecifico([])).toBeNull();
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

describe("o responsável de obra", () => {
  it("30/10: é o Gestor de obra do RH, e não o Filipe do exemplo; sem nenhum, 'o Gestor de obra' sem telefone; ao sair, o do exemplo", () => {
    definirResponsavelObra({ nome: "Paulo Nogueira", telefone: "210000003" });
    expect(RESPONSAVEL_OBRA).toEqual({ n: "Paulo Nogueira", papel: "Gestor de obra", tel: "210000003" });
    definirResponsavelObra(undefined);
    expect(RESPONSAVEL_OBRA).toMatchObject({ n: "o Gestor de obra", tel: "" });
    reporNomesPapeis();
    expect(RESPONSAVEL_OBRA.n).toBe("Filipe Rocha");
  });
});

describe("30/10: o resto do exemplo sai da Olyvia", () => {
  it("os responsáveis de 'Preparar a obra' são os Gestores de obra do RH; ao sair, os do exemplo", () => {
    aplicarGestoresObra([{ nome: "Paulo Nogueira", telefone: "210000003" }, { nome: "Teresa Albuquerque", telefone: null }]);
    expect(RESPONSAVEIS_OBRA).toEqual(["Paulo Nogueira", "Teresa Albuquerque"]);
    expect(RESPONSAVEL_OBRA.n).toBe("Paulo Nogueira");
    reporNomesPapeis();
    expect(RESPONSAVEIS_OBRA).toEqual(["Filipe", "Hugo"]);
  });

  it("sem a carrinha do exemplo na Olyvia; na V1 continua", () => {
    const p: Plano = { tasks: [{ nome: "Canalização", svcs: ["canal"], dia: 0, dur: 1, sk: "Canalizador", h: 8, tec: null }], estado: "aprovado", dia: 0 };
    expect(equipamentosDaObra(p).some((e) => /Renault/.test(e.n))).toBe(true);
    aplicarPermissoesReais();
    expect(equipamentosDaObra(p).some((e) => /Renault/.test(e.n))).toBe(false);
    reporNomesPapeis();
    expect(equipamentosDaObra(p).some((e) => /Renault/.test(e.n))).toBe(true);
  });

  it("na equipa da obra, o ofício de cada técnico é o das tarefas dele ali (não o primeiro da ficha)", () => {
    usarTecnicos([tec("sergio", "Sérgio Matos", ["vidro", "ladrilhador"])]);
    TECNICOS[0].sk = "técnico de vidro";
    const t = (nome: string) => ({ nome, svcs: [], dia: 0, dur: 1, sk: "Ladrilhador", perfilId: "ladrilhador", h: 4, tec: "sergio" });
    const p: Plano = { tasks: [t("Revestimento"), t("Pavimento")], estado: "aprovado", dia: 0 };
    expect(equipaDaObra(p)[0].sk).toBe("Ladrilhador");
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
