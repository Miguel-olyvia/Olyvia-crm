// 9/11/2026 (Lote 1 de permissões): o Papel no Negócio (S.role, o «A ver como») continua a desbloquear o que desbloqueava; com uma conta
// real junta-se o caminho da permissão (quem tem as permissões que o servidor exige faz a ação, seja qual for o papel). Sem conta real
// (o protótipo e os testes de sempre) só conta o papel. Cada bloco cobre: o papel continua (regressão), só a permissão passa a dar, e
// sem nada continua bloqueado. Onde o servidor recusa sempre (a fatura, o PO sem purchase_orders.approve, a conversa sem pessoas.edit,
// encerrar/decidir imprevistos sem planear), o ecrã deixa de oferecer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const erp = vi.hoisted(() => ({ ler: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("./erpEticadata", async (orig) => ({ ...(await orig<typeof import("./erpEticadata")>()), lerFaturaErp: erp.ler }));

import { acoes, minhas, proximo, seed, type Aviso, type Estado, type Negocio, type Papel } from "./motor";
import {
  CODIGO_APROVAR_PO, CODIGO_BASE, CODIGO_ESCREVER_CONVERSA, CODIGO_GERIR_ORCAMENTOS, CODIGO_VER_CUSTOS, SEM_PERM, comPermissoesReais,
  definirPermissoesReais, passoDe, pelaPermissao, permEmFaltaDoPasso, podeAprovarPo, podeVerCustos, semEnvioNaConversa, temCodigoReal,
  type PermNeg,
} from "./permissoes";
import { CODIGOS_NEGOCIOS } from "./permissoesReais";
import { comPapeisDasPermissoes, papeisDasPermissoes, papelInicial, type MeusPapeis } from "./real/papeisReal";
import { esquecerInventario } from "./inventario/loja";
import { BotaoFase } from "./PaginaNegocio";
import { PaginaObra } from "./ObraOperacoes";
import { RegistarFaturaErp } from "./FaturaErp";
import { Conversa } from "./ConversaObra";
import { Montar } from "./v2/testeV2";
import { ambitoSemEfeito, permissoesComAmbito } from "@/components/utilizadores-perfis/regrasVinculos";
import { resumoAmbito } from "@/components/utilizadores-perfis/logica";
import type { Permissao, Role, Utilizador } from "@/components/utilizadores-perfis/tipos";

/** A conta real com estes códigos (os de PermNeg pelo código da base, mais os brutos). */
const reais = (ps: PermNeg[], brutos: string[] = []) =>
  definirPermissoesReais({ codigos: new Set([...ps.map((p) => CODIGO_BASE[p]), ...brutos]), simular: false });
const botao = (n: string | RegExp) => screen.queryByRole("button", { name: n });

afterEach(() => { cleanup(); definirPermissoesReais(null); localStorage.clear(); window.history.replaceState(null, "", "/"); });
beforeEach(() => { esquecerInventario(); Element.prototype.scrollIntoView = vi.fn(); erp.ler.mockReset(); });

/* ------------------------------------------------------------------ B: o passo pelo papel OU pela permissão */
describe("B · passoDe: o papel continua; com conta real, a permissão do passo também dá", () => {
  it("sem conta real só conta o papel (a Direção, com «*» no quadro, não fica com os passos dos outros)", () => {
    expect(comPermissoesReais()).toBe(false);
    expect(passoDe("comercial", "comercial", "contactar")).toBe(true);
    expect(passoDe("direcao", "comercial", "contactar")).toBe(false);
    expect(passoDe("direcao", "operacoes", "aprovarPlano")).toBe(false);
  });

  it("o papel dono continua a ter o passo, com ou sem a permissão (a falta diz-se no botão desligado)", () => {
    reais([]);
    expect(passoDe("operacoes", "operacoes", "aprovarPlano")).toBe(true);
    expect(permEmFaltaDoPasso({ role: "operacoes" }, "aprovarPlano")).toBe("obra.planear");
  });

  it("a Direção com negocios.obra.planear aprova o plano, arranca e gera o plano; sem ela não", () => {
    reais(["obra.planear"]);
    for (const act of ["aprovarPlano", "arrancar", "gerarPlano", "abrirPlano"]) expect(passoDe("direcao", "operacoes", act), act).toBe(true);
    reais(["margin.approve"]);
    for (const act of ["aprovarPlano", "arrancar", "gerarPlano"]) expect(passoDe("direcao", "operacoes", act), act).toBe(false);
  });

  it("um passo com várias permissões pede todas; passos sem permissão, sem ação ou do cliente ficam só do papel", () => {
    reais(["visita.gerir"]);
    expect(passoDe("financeiro", "comercial", "fecharVisita")).toBe(false);
    reais(["visita.gerir", "orcamento.editar"]);
    expect(passoDe("financeiro", "comercial", "fecharVisita")).toBe(true);
    reais(Object.keys(CODIGO_BASE) as PermNeg[]);
    expect(passoDe("financeiro", "comercial", "irObra")).toBe(false);
    expect(passoDe("financeiro", "comercial", undefined)).toBe(false);
    expect(passoDe("financeiro", "cliente", "aceitar")).toBe(false);
    expect(passoDe("financeiro", null, "contactar")).toBe(false);
  });

  it("Verificar no ERP passa a pedir negocios.validar_pagamento (antes de ler o Eticadata)", () => {
    reais([]);
    expect(permEmFaltaDoPasso({ role: "financeiro" }, "verificarErp")).toBe("finance.validate_payment");
    reais(["finance.validate_payment"]);
    expect(permEmFaltaDoPasso({ role: "financeiro" }, "verificarErp")).toBeNull();
    definirPermissoesReais(null);
    expect(permEmFaltaDoPasso({ role: "financeiro" }, "verificarErp")).toBeNull();
  });
});

/** Um negócio na fase Lead (o passo «Registar chamada», do comercial). */
const naLead = (): { S: Estado; d: Negocio } => {
  const S = seed(), d = S.deals.find((x) => !x.perdido && !x.anulado && proximo(x, S).act === "contactar")!;
  return { S, d };
};

describe("B · BotaoFase (a página do negócio)", () => {
  it("papel dono: o botão como sempre (regressão), sem conta real e com ela", () => {
    const { S, d } = naLead();
    S.role = "comercial";
    render(<Montar S={S}>{(ctx) => <BotaoFase ctx={ctx} d={d} />}</Montar>);
    expect((botao(/Registar chamada/) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    reais(["contacto.registar"]);
    render(<Montar S={S}>{(ctx) => <BotaoFase ctx={ctx} d={d} />}</Montar>);
    expect((botao(/Registar chamada/) as HTMLButtonElement).disabled).toBe(false);
  });

  it("outro papel com a permissão do passo: o botão ativo, que faz a ação; sem ela, desligado e «Mudar para»", () => {
    const { S, d } = naLead();
    S.role = "direcao";
    reais(["visita.gerir"]);
    render(<Montar S={S}>{(ctx) => <BotaoFase ctx={ctx} d={d} />}</Montar>);
    expect((botao(/Registar chamada/) as HTMLButtonElement).disabled).toBe(true);
    expect(botao(/Mudar para/)).toBeTruthy();
    cleanup();
    reais(["contacto.registar"]);
    render(<Montar S={S}>{(ctx) => <BotaoFase ctx={ctx} d={d} />}</Montar>);
    expect(botao(/Mudar para/)).toBeNull();
    const b = botao(/Registar chamada/) as HTMLButtonElement;
    expect(b.disabled).toBe(false);
    fireEvent.click(b);
    // a ação correu (passou a permissão): ou avançou, ou o portão pediu os campos da Lead
    expect(d.fase === 1 || d.valida != null).toBe(true);
  });

  it("sem conta real, a Direção continua a ver «Mudar para» (o protótipo não muda)", () => {
    const { S, d } = naLead();
    S.role = "direcao";
    render(<Montar S={S}>{(ctx) => <BotaoFase ctx={ctx} d={d} />}</Montar>);
    expect(botao(/Mudar para/)).toBeTruthy();
  });
});

describe("B · o Hoje (minhas): o passo de outro papel aparece a quem tem as permissões dele", () => {
  it("o comercial continua a ter os seus; a Direção só os ganha com conta real e as permissões", () => {
    const { S, d } = naLead();
    const doNegocio = (r: Papel) => minhas(S, r).filter((x) => x.d.id === d.id && x.p.act === "contactar");
    expect(doNegocio("comercial")).toHaveLength(1);
    expect(doNegocio("direcao")).toHaveLength(0);
    reais(["contacto.registar"]);
    expect(doNegocio("comercial")).toHaveLength(1);
    expect(doNegocio("direcao")).toHaveLength(1);
    reais(["visita.gerir"]);
    expect(doNegocio("direcao")).toHaveLength(0);
  });

  it("os imprevistos do gestor: a Operações como sempre; outro papel só com imprevistos E planear", () => {
    const S = seed(), d = S.deals.find((x) => x.id === 1022)!;
    S.role = "operacoes";
    reais(["obra.executar", "obra.imprevistos", "obra.planear"]);
    acoes(S, () => undefined, (fn) => fn()).registarImprevisto(d.id, { texto: "Cano roto", onde: "", grav: "impede", tarefas: [2] });
    const imp = (r: Papel) => minhas(S, r).filter((x) => x.d.id === d.id && /^Imprevisto/.test(x.p.t));
    const n = imp("operacoes").length;
    expect(n).toBeGreaterThan(0);
    expect(imp("financeiro")).toHaveLength(n);
    reais(["obra.imprevistos"]);
    expect(imp("operacoes")).toHaveLength(n);
    expect(imp("financeiro")).toHaveLength(0);
    definirPermissoesReais(null);
    expect(imp("financeiro")).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ C, F, K: as ações da obra no motor */
/** A obra 1022 (em curso). */
function obra(role: Papel): { S: Estado; d: Negocio; A: ReturnType<typeof acoes>; avisos: Aviso[] } {
  const S = seed(), d = S.deals.find((x) => x.id === 1022)!, avisos: Aviso[] = [];
  S.role = role;
  return { S, d, A: acoes(S, (a) => avisos.push(a), (fn) => fn()), avisos };
}
const imprevisto = { texto: "Cano roto", onde: "cozinha", grav: "impede" as const, tarefas: [2] };

describe("C · registar imprevistos e tratar problemas: o papel OU (conta real) quem planeia", () => {
  it("a Direção com planear e imprevistos regista; sem planear continua recusada", () => {
    const sem = obra("direcao");
    reais(["obra.imprevistos"]);
    expect(sem.A.registarImprevisto(sem.d.id, imprevisto)).toBeNull();
    expect(sem.avisos.some((a) => a.msg === "Quem regista é a equipa da obra")).toBe(true);
    const com = obra("direcao");
    reais(["obra.imprevistos", "obra.planear"]);
    expect(com.A.registarImprevisto(com.d.id, imprevisto)).toBeTruthy();
  });

  it("o gestor (papel) continua a registar sem planear, como antes", () => {
    const g = obra("operacoes");
    reais(["obra.imprevistos"]);
    expect(g.A.registarImprevisto(g.d.id, imprevisto)).toBeTruthy();
  });

  it("descartar um problema: a Direção com imprevistos e planear sim; só com imprevistos não", () => {
    const origem = { msg: "local-0", texto: "Há uma mancha", fotos: [] };
    const so = obra("direcao");
    reais(["obra.imprevistos"]);
    so.A.descartarProblema(so.d.id, origem, "");
    expect(so.d.obra.problemas ?? []).toHaveLength(0);
    const com = obra("direcao");
    reais(["obra.imprevistos", "obra.planear"]);
    com.A.descartarProblema(com.d.id, origem, "");
    expect(com.d.obra.problemas?.[0]?.estado).toBe("descartado");
  });

  it("na página da obra: «Registar imprevisto» à Direção com planear (conta real); sem planear não; sem conta real não", () => {
    const { S, d } = obra("direcao");
    reais(["obra.planear", "obra.imprevistos"]);
    render(<Montar S={S}>{(ctx) => <PaginaObra ctx={ctx} d={d} />}</Montar>);
    expect(botao(/Registar imprevisto/)).toBeTruthy();
    cleanup();
    reais(["obra.imprevistos", "obra.executar"]);
    render(<Montar S={S}>{(ctx) => <PaginaObra ctx={ctx} d={d} />}</Montar>);
    expect(botao(/Registar imprevisto/)).toBeNull();
    cleanup();
    definirPermissoesReais(null);
    render(<Montar S={S}>{(ctx) => <PaginaObra ctx={ctx} d={d} />}</Montar>);
    expect(botao(/Registar imprevisto/)).toBeNull();
  });
});

describe("F · encerrar e decidir imprevistos pedem também negocios.obra.planear (como o servidor)", () => {
  const tudoValidado = (d: Negocio) => d.obra.plano!.tasks.forEach((t) => { t.exec = { estado: "validada", horas: t.h, fotos: [] }; });

  it("fimObra: sem planear recusa e diz qual falta; com fechar e planear passa a validação de permissões", () => {
    const { d, A, avisos } = obra("operacoes");
    tudoValidado(d);
    reais(["obra.fechar"]);
    A.fimObra(d.id);
    expect(avisos.some((a) => a.msg === SEM_PERM["obra.planear"].msg)).toBe(true);
    expect(d.obra.plano!.estado).toBe("em curso");
    avisos.length = 0;
    reais(["obra.fechar", "obra.planear"]);
    A.fimObra(d.id);
    expect(avisos.some((a) => a.msg === SEM_PERM["obra.planear"].msg || a.msg === SEM_PERM["obra.fechar"].msg)).toBe(false);
  });

  it("decidirImprevisto: só com imprevistos E planear", () => {
    const { d, A } = obra("operacoes");
    reais(["obra.imprevistos", "obra.planear", "obra.executar"]);
    const id = A.registarImprevisto(d.id, imprevisto)!;
    reais(["obra.imprevistos"]);
    A.decidirImprevisto(d.id, id, "seguir");
    expect(d.obra.imprevistos!.find((x) => x.id === id)!.estado).toBe("aberto");
    reais(["obra.imprevistos", "obra.planear"]);
    A.decidirImprevisto(d.id, id, "seguir");
    expect(d.obra.imprevistos!.find((x) => x.id === id)!.estado).toBe("fechado");
  });

  it("sem conta real (o quadro por papel) as Operações continuam a decidir", () => {
    const { d, A } = obra("operacoes");
    const id = A.registarImprevisto(d.id, imprevisto)!;
    A.decidirImprevisto(d.id, id, "seguir");
    expect(d.obra.imprevistos!.find((x) => x.id === id)!.estado).toBe("fechado");
  });

  it("na página da obra, «Resolver sem custo» só aparece com imprevistos E planear", () => {
    const { S, d, A } = obra("operacoes");
    reais(["obra.imprevistos", "obra.planear", "obra.executar"]);
    A.registarImprevisto(d.id, imprevisto);
    reais(["obra.imprevistos", "obra.executar"]);
    render(<Montar S={S}>{(ctx) => <PaginaObra ctx={ctx} d={d} />}</Montar>);
    expect(botao(/Resolver sem custo/)).toBeNull();
    cleanup();
    reais(["obra.imprevistos", "obra.planear"]);
    render(<Montar S={S}>{(ctx) => <PaginaObra ctx={ctx} d={d} />}</Montar>);
    expect(botao(/Resolver sem custo/)).toBeTruthy();
  });
});

describe("K · gerar o plano e tratar a segurança pedem negocios.obra.planear", () => {
  it("tratarSeguranca: sem planear não marca; com ela marca; sem conta real (papel) como antes", () => {
    const sem = obra("operacoes");
    reais([]);
    sem.A.tratarSeguranca(sem.d.id, "epi");
    expect(sem.d.obra.seg?.epi).toBeUndefined();
    const com = obra("operacoes");
    reais(["obra.planear"]);
    com.A.tratarSeguranca(com.d.id, "epi");
    expect(com.d.obra.seg?.epi).toBeTruthy();
    const proto = obra("operacoes");
    proto.A.tratarSeguranca(proto.d.id, "epi");
    expect(proto.d.obra.seg?.epi).toBeTruthy();
  });

  it("gerarPlano (conta real): sem planear nem pessoas.edit não gera; com uma delas gera; sem conta real como antes", () => {
    const gerar = (antes: () => void) => {
      const S = seed();
      const d = S.deals.find((x) => x.fase === 5 && x.orc)!;
      d.obra.plano = null;
      S.role = "comercial";
      antes();
      acoes(S, () => undefined, (fn) => fn()).gerarPlano(d.id);
      return d.obra.plano?.estado;
    };
    expect(gerar(() => reais([]))).toBeUndefined();
    expect(gerar(() => reais(["obra.planear"]))).toBe("por aprovar");
    expect(gerar(() => reais([], ["pessoas.edit"]))).toBe("por aprovar");
    expect(gerar(() => definirPermissoesReais(null))).toBe("por aprovar");
  });
});

/* ------------------------------------------------------------------ J: o diário */
describe("J · o diário de obra: planear OU executar (como o servidor), mais o que já podia", () => {
  const abrirRegistos = () => fireEvent.click(screen.getByRole("tab", { name: "Registos" }));
  const caixa = () => screen.queryByRole("textbox", { name: "Registar uma ocorrência" });
  it("quem executa (executar) escreve no diário; sem nenhuma, não; a Direção e quem planeia continuam", () => {
    const { S, d } = obra("comercial");
    reais(["obra.executar"]);
    render(<Montar S={S}>{(ctx) => <PaginaObra ctx={ctx} d={d} />}</Montar>);
    abrirRegistos();
    expect(caixa()).toBeTruthy();
    cleanup();
    reais([]);
    render(<Montar S={S}>{(ctx) => <PaginaObra ctx={ctx} d={d} />}</Montar>);
    abrirRegistos();
    expect(caixa()).toBeNull();
    cleanup();
    reais(["obra.planear"]);
    render(<Montar S={S}>{(ctx) => <PaginaObra ctx={ctx} d={d} />}</Montar>);
    abrirRegistos();
    expect(caixa()).toBeTruthy();
    cleanup();
    reais([]);
    S.role = "direcao";
    render(<Montar S={S}>{(ctx) => <PaginaObra ctx={ctx} d={d} />}</Montar>);
    abrirRegistos();
    expect(caixa()).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ D: aprovar a encomenda a fornecedor */
describe("D · podeAprovarPo", () => {
  it("sem conta real, o papel armazém (como antes); com conta real, purchase_orders.approve em qualquer papel", () => {
    expect(podeAprovarPo("armazem", false)).toBe(true);
    expect(podeAprovarPo("comercial", false)).toBe(false);
    reais([], [CODIGO_APROVAR_PO]);
    expect(podeAprovarPo("comercial", false)).toBe(true);
    expect(podeAprovarPo("armazem", false)).toBe(true);
  });
  it("o «A ver como» armazém sem a permissão (o servidor recusa sempre) deixa de aprovar; o modo de teste continua", () => {
    reais([]);
    expect(podeAprovarPo("armazem", false)).toBe(false);
    expect(podeAprovarPo("armazem", true)).toBe(true);
  });
});

/* ------------------------------------------------------------------ G: ver custos */
describe("G · podeVerCustos aceita quotes.manage (fn_quote_custos_pode)", () => {
  it("view_costs ou manage veem; nenhuma não; sem conta real vê", () => {
    reais([], [CODIGO_VER_CUSTOS]);
    expect(podeVerCustos()).toBe(true);
    reais([], [CODIGO_GERIR_ORCAMENTOS]);
    expect(podeVerCustos()).toBe(true);
    reais([]);
    expect(podeVerCustos()).toBe(false);
    definirPermissoesReais(null);
    expect(podeVerCustos()).toBe(true);
  });
  it("os códigos novos leem-se por fn_cat_pode (CODIGOS_NEGOCIOS)", () => {
    for (const c of [CODIGO_GERIR_ORCAMENTOS, CODIGO_APROVAR_PO, CODIGO_ESCREVER_CONVERSA]) expect(CODIGOS_NEGOCIOS).toContain(c);
  });
});

/* ------------------------------------------------------------------ I: a conversa */
describe("I · a caixa de envio da conversa da obra pede pessoas.edit", () => {
  it("semEnvioNaConversa: só com conta real e sem pessoas.edit", () => {
    expect(semEnvioNaConversa()).toBeUndefined();
    reais([], [CODIGO_ESCREVER_CONVERSA]);
    expect(semEnvioNaConversa()).toBeUndefined();
    reais([]);
    expect(semEnvioNaConversa()).toMatch(/pessoas\.edit/);
    expect(temCodigoReal(CODIGO_ESCREVER_CONVERSA)).toBe(false);
  });
  it("com semEnvio a caixa fica desligada e não envia; sem ele, como sempre", () => {
    const enviar = vi.fn();
    render(<Conversa msgs={[]} eu="empresa" enviar={enviar} vazio="—" rapidas={["Olá"]} semEnvio="Sem permissão" />);
    expect((screen.getByRole("textbox", { name: "Escrever uma mensagem" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Olá" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Sem permissão")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Olá" }));
    expect(enviar).not.toHaveBeenCalled();
    cleanup();
    render(<Conversa msgs={[]} eu="empresa" enviar={enviar} vazio="—" rapidas={["Olá"]} />);
    expect((screen.getByRole("textbox", { name: "Escrever uma mensagem" }) as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Olá" }));
    expect(enviar).toHaveBeenCalledWith("Olá");
  });
});

/* ------------------------------------------------------------------ L: a fatura do ERP */
describe("L · RegistarFaturaErp: sem negocios.registar_fatura, nem formulário nem Eticadata", () => {
  const negocio = () => { const { S, d } = naLead(); S.role = "financeiro"; return { S, d }; };
  it("sem a permissão: o botão desligado, o porquê, e o ERP não é lido", () => {
    const { S, d } = negocio();
    reais([]);
    render(<Montar S={S}>{(ctx) => <RegistarFaturaErp ctx={ctx} d={d} />}</Montar>);
    expect((botao(/Registar fatura/) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(SEM_PERM["finance.invoice"].sub)).toBeTruthy();
    expect(erp.ler).not.toHaveBeenCalled();
  });
  it("com ela (ou sem conta real, o Financeiro), o formulário de sempre, que lê o ERP ao registar", async () => {
    const { S, d } = negocio();
    erp.ler.mockResolvedValue({ motivo: "sem_ligacao", msg: "Sem ligação" });
    reais(["finance.invoice"]);
    render(<Montar S={S}>{(ctx) => <RegistarFaturaErp ctx={ctx} d={d} />}</Montar>);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "FAT 1/2" } });
    fireEvent.click(botao(/Registar fatura/)!);
    await screen.findByRole("alert");
    expect(erp.ler).toHaveBeenCalledWith("FAT 1/2");
    cleanup();
    definirPermissoesReais(null);
    render(<Montar S={S}>{(ctx) => <RegistarFaturaErp ctx={ctx} d={d} />}</Montar>);
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ A: entrar em /negocios só com permissões */
describe("A · os papéis que as permissões dão a quem não tem Papel no Negócio", () => {
  const sem: MeusPapeis = { papeis: [], pessoa: null, todos: false };
  it("cada permissão dá o seu papel, pela ordem do circuito", () => {
    const c = (...x: string[]) => new Set(x);
    expect(papeisDasPermissoes(c("negocios.validar_pagamento"))).toEqual(["financeiro"]);
    expect(papeisDasPermissoes(c("negocios.registar_fatura"))).toEqual(["financeiro"]);
    expect(papeisDasPermissoes(c("negocios.obra.planear"))).toEqual(["operacoes"]);
    expect(papeisDasPermissoes(c("purchase_orders.approve"))).toEqual(["armazem"]);
    expect(papeisDasPermissoes(c("negocios.margem.aprovar"))).toEqual(["direcao"]);
    for (const k of ["negocios.contacto.registar", "negocios.visita.gerir", "negocios.orcamento.editar", "negocios.proposta.enviar"])
      expect(papeisDasPermissoes(c(k)), k).toEqual(["comercial"]);
    expect(papeisDasPermissoes(c("negocios.obra.planear", "negocios.contacto.registar"))).toEqual(["comercial", "operacoes"]);
    expect(papeisDasPermissoes(c("quotes.view_costs"))).toEqual([]);
  });
  it("sem papel: passa a abrir com o papel das permissões (antes, «Não tem nenhum papel»)", () => {
    expect(papelInicial(sem, "comercial")).toBeNull();
    const m = comPapeisDasPermissoes(sem, new Set(["negocios.validar_pagamento"]));
    expect(m.papeis).toEqual(["financeiro"]);
    expect(papelInicial(m, "comercial")).toBe("financeiro");
  });
  it("quem já tem papel, ou vê todos, fica igual; sem nada (ou a leitura falhou) continua sem papel", () => {
    const comPapel: MeusPapeis = { papeis: ["armazem"], pessoa: null, todos: false };
    expect(comPapeisDasPermissoes(comPapel, new Set(["negocios.obra.planear"]))).toBe(comPapel);
    const todos: MeusPapeis = { papeis: [], pessoa: null, todos: true };
    expect(comPapeisDasPermissoes(todos, new Set(["negocios.obra.planear"]))).toBe(todos);
    expect(papelInicial(comPapeisDasPermissoes(sem, new Set()), "comercial")).toBeNull();
    expect(papelInicial(comPapeisDasPermissoes(sem, null), "comercial")).toBeNull();
  });
});

/* ------------------------------------------------------------------ Extra: os âmbitos dos Agendamentos */
describe("Extra · âmbitos sem efeito (scheduling.boards/resources/rules) saem do ecrã; scheduling.items fica", () => {
  const p = (codigo: string): Permissao => ({ codigo, categoria: "scheduling", nome: codigo, perigosa: false, comAmbito: true });
  const cat = ["scheduling.boards.view", "scheduling.resources.edit", "scheduling.rules.view", "scheduling.items.view", "scheduling.items.edit", "leads.view"].map(p);
  it("ambitoSemEfeito", () => {
    expect(ambitoSemEfeito("scheduling.boards.view")).toBe(true);
    expect(ambitoSemEfeito("scheduling.resources.create")).toBe(true);
    expect(ambitoSemEfeito("scheduling.rules.delete")).toBe(true);
    expect(ambitoSemEfeito("scheduling.items.view")).toBe(false);
    expect(ambitoSemEfeito("leads.view")).toBe(false);
  });
  it("permissoesComAmbito só mostra as que têm efeito", () => {
    const role = { permissoes: cat.map((x) => x.codigo) } as Pick<Role, "permissoes">;
    expect(permissoesComAmbito(role, cat).map((x) => x.codigo)).toEqual(["scheduling.items.view", "scheduling.items.edit", "leads.view"]);
  });
  it("o resumo do âmbito ignora as sem efeito (o gravado fica no vínculo)", () => {
    const role = { id: "r1", permissoes: ["scheduling.boards.view", "scheduling.items.view"] } as Role;
    const u = { vinculos: [{ ativo: true, roleId: "r1", organizacaoId: "o1", ambitos: { "scheduling.boards.view": "ORG", "scheduling.items.view": "TEAM" } }] } as unknown as Utilizador;
    expect(resumoAmbito(u, [role], cat)).toBe("TEAM");
    expect(u.vinculos[0].ambitos["scheduling.boards.view"]).toBe("ORG");
  });
});

it("pelaPermissao: só com conta real e com todas", () => {
  expect(pelaPermissao("direcao", ["obra.planear"])).toBe(false);
  reais(["obra.planear"]);
  expect(pelaPermissao("direcao", ["obra.planear"])).toBe(true);
  expect(pelaPermissao("direcao", ["obra.planear", "obra.fechar"])).toBe(false);
  expect(pelaPermissao("direcao", [])).toBe(false);
});
