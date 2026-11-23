// 19/11/2026 (auditoria, lote 2 da obra): os ecrãs. O passo Medidas só com o Estúdio das medidas como caminho (o resto é resumo), quem vai
// medir com o passo «Medir no local» no Hoje dela, e «Faltou material» e «O cliente pediu uma alteração» como ações no Hoje do técnico.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { esquecerInventario } from "./inventario/loja";
import { TECS, acoes, seed, type Estado, type Negocio } from "./motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import type { Ctx } from "./pecas";
import { RetificacaoMedidas } from "./RetificacaoMedidas";
import { HojeTecnico } from "./HojeTecnico";
import { trabalhoDoTecnico } from "./trabalhoObra";
import { definirSupervisoresMedidas } from "./supervisoresMedidas";

afterEach(() => { cleanup(); definirSupervisoresMedidas(null); });
Element.prototype.scrollIntoView = function () {};

const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
};
const ctxDe = (S: Estado, A: ReturnType<typeof acoes>): Ctx => ({ S, A, run: (fn) => fn(), go: (fn) => () => fn(), q: "" }) as Ctx;
/** 1027 com o pagamento validado (as medidas por fazer), nas Operações. */
function pago() {
  esquecerInventario();
  const S: Estado = seed();
  const A = acoes(S, () => {}, (fn) => fn());
  const d = S.deals.find((x) => x.id === 1027)! as Negocio;
  preencher(d, FINANCEIRO); preencher(d, [OBRA[0]]);
  A.role("financeiro"); A.registarFaturaErp(d.id, `FT 2026/${d.id}`, null); A.validar(d.id);
  A.role("operacoes");
  return { S, A, d };
}

describe("6. o passo Medidas: o Estúdio das medidas é o caminho; a página é o resumo", () => {
  it("sem quem vai medir: escolhe-se a pessoa; sem formulário nem «Aceitar» na página; os textos do fluxo em vigor", () => {
    const { S, A, d } = pago();
    const { rerender, container } = render(<RetificacaoMedidas ctx={ctxDe(S, A)} d={d} />);
    expect(screen.queryByRole("button", { name: /Aceitar as medidas/ })).toBeNull();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(screen.getByRole("table", { name: "As medidas" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/Antes do contrato|ao mesmo tempo/);
    expect(container.textContent).toContain("adenda do acerto");
    const sel = screen.getByRole("combobox", { name: /Quem vai medir/ }) as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value).filter(Boolean)).toEqual(TECS.map((x) => x.id));
    expect(screen.queryByRole("button", { name: /Abrir o estúdio das medidas/ })).toBeNull();
    fireEvent.change(sel, { target: { value: TECS[0].id } });
    expect(d.f.supervisor_medidas).toBe(TECS[0].id);
    rerender(<RetificacaoMedidas ctx={ctxDe(S, A)} d={d} />);
    // com quem mede escolhido: um só botão principal, o do Estúdio das medidas
    expect(screen.getAllByRole("button", { name: /Abrir o estúdio das medidas/ })).toHaveLength(1);
    expect(screen.getByText(`${TECS[0].n} mede no local`)).toBeTruthy();
  });

  it("antes do pagamento, diz que as medidas abrem depois dele", () => {
    const S: Estado = seed(); S.role = "operacoes";
    const A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.id === 1027)! as Negocio;
    const { container } = render(<RetificacaoMedidas ctx={ctxDe(S, A)} d={d} />);
    expect(container.textContent).toContain("As medidas abrem depois de o Financeiro validar o pagamento.");
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

// 23/11/2026 (permissões, M7): quem mede/retifica é o supervisor de obra: na Olyvia, os do perfil com negocios.obra.planear (neg_gestores_obra)
describe("6b. «Quem vai medir» também lista os supervisores e gestores de obra", () => {
  it("primeiro os supervisores, depois os técnicos (sem repetir); escolher um supervisor grava-o e mostra-o pelo nome", () => {
    const { S, A, d } = pago();
    definirSupervisoresMedidas([{ id: "pessoa-sup-1", n: "Dário Supervisor" }, { id: TECS[1].id, n: TECS[1].n }]);
    const { rerender } = render(<RetificacaoMedidas ctx={ctxDe(S, A)} d={d} />);
    const sel = screen.getByRole("combobox", { name: /Quem vai medir/ }) as HTMLSelectElement;
    const grupos = [...sel.querySelectorAll("optgroup")].map((g) => g.label);
    expect(grupos).toEqual(["Supervisores e gestores de obra", "Técnicos de obra"]);
    const valores = [...sel.options].map((o) => o.value).filter(Boolean);
    expect(valores.slice(0, 2)).toEqual(["pessoa-sup-1", TECS[1].id]);
    expect(valores.filter((v) => v === TECS[1].id)).toHaveLength(1);
    expect(new Set(valores)).toEqual(new Set(["pessoa-sup-1", ...TECS.map((x) => x.id)]));
    fireEvent.change(sel, { target: { value: "pessoa-sup-1" } });
    expect(d.f.supervisor_medidas).toBe("pessoa-sup-1");
    rerender(<RetificacaoMedidas ctx={ctxDe(S, A)} d={d} />);
    expect(screen.getByText("Dário Supervisor mede no local")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Abrir o estúdio das medidas/ })).toHaveLength(1);
  });

  it("sem a lista da base (protótipo): só os técnicos, como antes; um id fora das duas listas continua recusado", () => {
    const { S, A, d } = pago();
    render(<RetificacaoMedidas ctx={ctxDe(S, A)} d={d} />);
    const sel = screen.getByRole("combobox", { name: /Quem vai medir/ }) as HTMLSelectElement;
    expect(sel.querySelectorAll("optgroup")).toHaveLength(0);
    expect([...sel.options].map((o) => o.value).filter(Boolean)).toEqual(TECS.map((x) => x.id));
    A.supervisorMedidas(d.id, "pessoa-desconhecida");
    expect(d.f.supervisor_medidas).toBeFalsy();
  });
});

describe("4. o Hoje de quem vai medir", () => {
  it("tem o passo «Medir no local» com a obra; sem a permissão de planear, diz a quem pedir", () => {
    const { S, A, d } = pago();
    A.supervisorMedidas(d.id, TECS[0].id);
    S.role = "tecnico"; S.tec = TECS[0].id;
    render(<HojeTecnico {...ctxDe(S, A)} />);
    const sec = screen.getByRole("region", { name: "Medir no local" });
    expect(within(sec).getByText(`${d.nome} · ${d.servico}`)).toBeTruthy();
    expect(sec.textContent).toContain("pede a permissão Planear a obra");
    // e o aviso do gestor
    expect(screen.getByText(/Medir no local: /)).toBeTruthy();
  });
});

describe("5. o Hoje do técnico: as duas ações", () => {
  function tarefaEmCurso() {
    const S: Estado = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.id === 1022)! as Negocio;
    const ti = d.obra.plano!.tasks.findIndex((t) => !t.exec && t.tec);
    S.role = "tecnico"; S.tec = d.obra.plano!.tasks[ti].tec!;
    expect(trabalhoDoTecnico(S.deals, S.tec).some((x) => x.d.id === d.id && x.ti === ti)).toBe(true);
    A.comecarTarefa(d.id, ti);
    render(<HojeTecnico {...ctxDe(S, A)} />);
    return { S, A, d, ti };
  }

  it("«Faltou material» abre o registo já preenchido (a tarefa e o tipo) e avisa o gestor", () => {
    const { d, ti } = tarefaEmCurso();
    fireEvent.click(screen.getAllByRole("button", { name: "Faltou material" })[0]);
    const g = screen.getByRole("group", { name: "Registar imprevisto" });
    expect(within(g).getByText("Faltou material")).toBeTruthy();
    const txt = within(g).getByRole("textbox", { name: /Que material faltou/ }) as HTMLTextAreaElement;
    expect(txt.value).toMatch(/^Faltou material para /);
    fireEvent.change(txt, { target: { value: txt.value + "2 caixas de cola" } });
    expect(within(g).getByRole("button", { name: new RegExp(d.obra.plano!.tasks[ti].nome.slice(0, 12)) }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(g).getByRole("button", { name: "Avisar o gestor da obra" }));
    const im = d.obra.imprevistos!.at(-1)!;
    expect(im).toMatchObject({ tipo: "material", grav: "impede", estado: "aberto" });
    expect(im.texto).toContain("2 caixas de cola");
  });

  it("«O cliente pediu uma alteração» abre o pedido e envia-o ao gestor", () => {
    const { d } = tarefaEmCurso();
    fireEvent.click(screen.getAllByRole("button", { name: "O cliente pediu uma alteração" })[0]);
    const g = screen.getByRole("group", { name: "O cliente pediu uma alteração" });
    const enviar = within(g).getByRole("button", { name: "Enviar ao gestor da obra" }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);
    fireEvent.change(within(g).getByRole("textbox", { name: "O que pediu o cliente?" }), { target: { value: "Quer o nicho mais largo" } });
    fireEvent.click(enviar);
    expect(d.obra.diario!.at(-1)?.pedido).toMatchObject({ texto: "Quer o nicho mais largo" });
    expect(screen.queryByRole("group", { name: "O cliente pediu uma alteração" })).toBeNull();
  });
});
