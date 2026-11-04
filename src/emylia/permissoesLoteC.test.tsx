// 4/11/2026 (Lote C): o ecrã pede as mesmas permissões que o servidor. neg_guardar_negocio recusa (CT001) sem negocios.orcamento.editar,
// negocios.proposta.enviar e negocios.contrato.editar; obra_guardar_negocio separa negocios.obra.planear de negocios.obra.executar;
// obra_encomendar_materiais pede purchase_orders.create (4/11, tarde: negocios.obra.materiais passou a ser só ver os materiais); a ficha do técnico grava-se por rh_guardar_oficios_pessoa
// (hr.pessoas.laborais.edit). Cada ação do motor é recusada sem a permissão e passa com ela; o botão do passo desliga-se e diz qual falta.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { ALTERNATIVAS, CODIGO_BASE, PERMS_PAPEL, SEM_PERM, definirPermissoesReais, podeNeg, type PermNeg } from "./permissoes";
import { CODIGOS_NEGOCIOS } from "./permissoesReais";
import { acoes, proximo, seed, type Aviso, type Estado, type Negocio } from "./motor";
import { BotaoFase, permEmFaltaDoPasso } from "./PaginaNegocio";
import type { Ctx } from "./pecas";

const TODOS = Object.values(CODIGO_BASE);
const NOVAS: PermNeg[] = ["orcamento.editar", "proposta.enviar", "contrato.editar", "obra.planear", "obra.executar", "obra.materiais", "obra.encomendar"];

afterEach(() => { cleanup(); definirPermissoesReais(null); });

/** `negadas`: as permissões que a conta real NÃO tem (as outras de CODIGO_BASE tem); `extra`: códigos a mais. */
function montar(negadas: PermNeg[] = [], extra: string[] = []) {
  const S = seed();
  const avisos: Aviso[] = [];
  const A = acoes(S, (a) => avisos.push(a), (fn) => fn());
  definirPermissoesReais({ codigos: new Set([...TODOS.filter((c) => !negadas.some((p) => CODIGO_BASE[p] === c)), ...extra]), simular: false });
  return { S, A, avisos };
}
const recusou = (avisos: Aviso[], p: PermNeg) => avisos.some((a) => a.msg === SEM_PERM[p].msg);
const algum = (S: Estado, f: (d: Negocio) => boolean = () => true): Negocio => S.deals.find(f) ?? S.deals[0];
/** Um negócio com o orçamento por enviar (o exemplo só tem propostas enviadas: a 1031 volta a «por enviar», verificada). */
const comOrc = (S: Estado) => {
  const d = S.deals.find((x) => x.id === 1031)!;
  if (d.orc!.enviada) Object.assign(d.orc!, { enviada: null, aceite: null, verif: true, aprov: "ok" });
  return d;
};
const emObra = (S: Estado) => algum(S, (d) => d.obra.plano?.estado === "em curso");

describe("os códigos são os do servidor", () => {
  it("as seis novas e a ficha do técnico", () => {
    expect(NOVAS.map((p) => CODIGO_BASE[p])).toEqual([
      "negocios.orcamento.editar", "negocios.proposta.enviar", "negocios.contrato.editar", "negocios.obra.planear", "negocios.obra.executar",
      "negocios.obra.materiais", "purchase_orders.create",
    ]);
    expect(CODIGO_BASE["equipa.edit"]).toBe("hr.pessoas.laborais.edit");
    NOVAS.forEach((p) => expect(SEM_PERM[p].sub).toContain(CODIGO_BASE[p]));
    // a leitura pergunta-os
    [...NOVAS.map((p) => CODIGO_BASE[p]), "hr.pessoas.laborais.edit"].forEach((c) => expect(CODIGOS_NEGOCIOS).toContain(c));
  });
  it("o quadro por papel bate com neg_papeis_permissoes", () => {
    // 4/11 (tarde): ver os materiais da obra é de todos os papéis que abrem a obra; encomendar (purchase_orders.create) não está em nenhum
    expect(NOVAS.filter((p) => podeNeg("comercial", p))).toEqual(["orcamento.editar", "proposta.enviar", "contrato.editar", "obra.materiais"]);
    expect(NOVAS.filter((p) => podeNeg("juridico", p))).toEqual(["contrato.editar", "obra.materiais"]);
    expect(NOVAS.filter((p) => podeNeg("operacoes", p))).toEqual(["obra.planear", "obra.executar", "obra.materiais"]);
    expect(PERMS_PAPEL.tecnico).toEqual(["obra.executar", "obra.materiais"]);
    expect(NOVAS.filter((p) => podeNeg("financeiro", p))).toEqual(["obra.materiais"]);
    expect(NOVAS.filter((p) => podeNeg("armazem", p))).toEqual(["obra.materiais"]);
  });
  it("materiais: negocios.obra.materiais só dá ver; encomendar pede purchase_orders.create (obra_encomendar_materiais)", () => {
    expect(ALTERNATIVAS).toEqual({});
    expect(CODIGO_BASE["obra.encomendar"]).toBe("purchase_orders.create");
    definirPermissoesReais({ codigos: new Set(["negocios.obra.materiais"]), simular: false });
    expect(podeNeg("operacoes", "obra.materiais")).toBe(true);
    expect(podeNeg("operacoes", "obra.encomendar")).toBe(false);
    definirPermissoesReais({ codigos: new Set(["purchase_orders.create"]), simular: false });
    expect(podeNeg("operacoes", "obra.materiais")).toBe(false);
    expect(podeNeg("operacoes", "obra.encomendar")).toBe(true);
  });
  it("a ficha do técnico pede hr.pessoas.laborais.edit, não negocios.obra.planear", () => {
    definirPermissoesReais({ codigos: new Set(["negocios.obra.planear"]), simular: false });
    expect(podeNeg("operacoes", "equipa.edit")).toBe(false);
    definirPermissoesReais({ codigos: new Set(["hr.pessoas.laborais.edit"]), simular: false });
    expect(podeNeg("operacoes", "equipa.edit")).toBe(true);
    expect(podeNeg("operacoes", "obra.planear")).toBe(false);
  });
});

type Caso = [string, PermNeg, (A: ReturnType<typeof acoes>, S: Estado) => unknown];
const CASOS: Caso[] = [
  ["fecharVisita", "orcamento.editar", (A, S) => A.fecharVisita(algum(S, (d) => d.fase === 2).id)],
  ["precoLinha", "orcamento.editar", (A, S) => A.precoLinha(comOrc(S).id, 0, 123)],
  ["qtdLinha", "orcamento.editar", (A, S) => A.qtdLinha(comOrc(S).id, 0, 3)],
  ["linhaLivre", "orcamento.editar", (A, S) => A.linhaLivre(comOrc(S).id, { d: "Extra", q: 1, pu: 10, iva: 23 })],
  ["vendaDireta", "orcamento.editar", (A, S) => A.vendaDireta(comOrc(S).id, true)],
  ["enviar", "proposta.enviar", (A, S) => A.enviar(comOrc(S).id)],
  ["enviarVersao", "proposta.enviar", (A, S) => A.enviarVersao(comOrc(S).id)],
  ["enviarContrato", "contrato.editar", (A, S) => A.enviarContrato(algum(S, (d) => !!d.orc?.aceite).id)],
  ["trocarTec", "obra.planear", (A, S) => A.trocarTec(emObra(S).id, 0, "zz")],
  ["aprovarPlano", "obra.planear", (A, S) => A.aprovarPlano(algum(S, (d) => d.obra.plano?.estado === "por aprovar").id)],
  ["comecarTarefa", "obra.executar", (A, S) => A.comecarTarefa(emObra(S).id, 0)],
  ["registarTarefa", "obra.executar", (A, S) => A.registarTarefa(emObra(S).id, 0, { horas: 2 })],
  ["encomendarMateriais", "obra.encomendar", (A, S) => A.encomendarMateriais(emObra(S).id)],
];

describe("o motor recusa sem a permissão do servidor", () => {
  it.each(CASOS)("%s: sem ela, avisa e não muda nada", (_n, p, fazer) => {
    // a execução também passa a quem planeia: para a ver recusada, tira-se também negocios.obra.planear
    const { S, A, avisos } = montar(p === "obra.executar" ? [p, "obra.planear"] : [p]);
    comOrc(S);
    const antes = JSON.stringify(S.deals);
    fazer(A, S);
    expect(recusou(avisos, p)).toBe(true);
    expect(JSON.stringify(S.deals)).toBe(antes);
  });
  it.each(CASOS)("%s: com ela, não é recusada por ela", (_n, p, fazer) => {
    const { S, A, avisos } = montar();
    fazer(A, S);
    expect(recusou(avisos, p)).toBe(false);
  });
  it("a execução: com negocios.obra.executar (sem planear) o técnico regista; quem planeia regista sem executar", () => {
    let m = montar(["obra.planear"]);
    m.A.registarTarefa(emObra(m.S).id, 0, { horas: 2 });
    expect(recusou(m.avisos, "obra.executar")).toBe(false);
    m = montar(["obra.executar"]);
    m.A.registarTarefa(emObra(m.S).id, 0, { horas: 2 });
    expect(recusou(m.avisos, "obra.executar")).toBe(false);
  });
});

describe("o botão do passo diz a permissão que falta", () => {
  const comPasso = (S: Estado, act: string) => { comOrc(S); return S.deals.find((d) => proximo(d, S).act === act); };
  it("sem negocios.proposta.enviar, «Enviar proposta» fica desligado e explica", () => {
    const { S, A } = montar(["proposta.enviar"]);
    const d = comPasso(S, "enviar");
    expect(d).toBeTruthy();
    S.role = proximo(d!, S).who as Estado["role"];
    expect(permEmFaltaDoPasso(S, "enviar")).toBe("proposta.enviar");
    const ctx: Ctx = { S, A, run: (fn) => fn(), go: (fn) => () => fn(), q: "" } as unknown as Ctx;
    render(<BotaoFase ctx={ctx} d={d!} />);
    const botao = screen.getByRole("button", { name: proximo(d!, S).btn });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    expect(botao.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(SEM_PERM["proposta.enviar"].sub)).toBeTruthy();
  });
  it("com ela, o botão faz o passo", () => {
    const { S, A } = montar();
    const d = comPasso(S, "enviar")!;
    S.role = proximo(d, S).who as Estado["role"];
    expect(permEmFaltaDoPasso(S, "enviar")).toBeNull();
    const ctx: Ctx = { S, A, run: (fn) => fn(), go: (fn) => () => fn(), q: "" } as unknown as Ctx;
    render(<BotaoFase ctx={ctx} d={d} />);
    expect((screen.getByRole("button", { name: new RegExp(proximo(d, S).btn!) }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("fechar o levantamento pede a visita e o orçamento", () => {
    const { S } = montar(["orcamento.editar"]);
    expect(permEmFaltaDoPasso(S, "fecharVisita")).toBe("orcamento.editar");
    expect(permEmFaltaDoPasso(S, "verificar")).toBeNull();
  });
});
