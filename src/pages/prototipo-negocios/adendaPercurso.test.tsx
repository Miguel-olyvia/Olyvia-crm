// 21/10/2026: a adenda com o mesmo percurso do orçamento, pelos ecrãs: a verificação das margens e a aprovação da Direção, a proposta
// no portal (pedir alterações → versão 2 com o mesmo número → aceitar), o contrato da adenda gerado pelo comercial, a assinatura por SMS,
// a fatura da 1.ª parcela (as parcelas do contrato), o pagamento no portal, a validação (a encomenda da adenda nasce) e o arranque.
// E: o IVA por taxa (6% na mão de obra, 23% nos materiais), "Ver a fatura" abre a fatura, o Hoje de cada um, os documentos e a linha do tempo.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eur, minhas, seed, type Estado, type Negocio } from "./motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import { esquecerInventario, lerInventario } from "./inventario/loja";
import { Montar } from "./v2/testeV2";
import { TrabalhosAMais } from "./TrabalhosAMais";
import { PortalCliente, passoPortal } from "./PortalCliente";
import { DocumentosSimples } from "./FasesSimples";
import { faltaParaArrancar } from "./preparacaoObra";
import { receberTudo } from "./testeObra";
import { historiaDaObra } from "./historiaObra";
import { totaisAdenda, versaoAdenda } from "./adendas";
import { adendaAssinada } from "./testeAdenda";

afterEach(() => { cleanup(); localStorage.clear(); });
beforeEach(() => { esquecerInventario(); });

const N = "AD 2026/1027-1";
type A = Parameters<Parameters<typeof Montar>[0]["children"]>[0]["A"];
/** 1027 pago (EC-1027 no Inventário) e plano aprovado: a obra pronta para a adenda. */
function preparar() {
  const S: Estado = seed(), d = S.deals.find((x) => x.id === 1027) as Negocio;
  const encher = (gs: Grupo[]) => { for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x"; };
  encher(FINANCEIRO); encher([OBRA[0]]);
  let A!: A;
  render(<Montar S={S}>{(ctx) => { A = ctx.A; return null; }}</Montar>);
  cleanup();
  A.role("financeiro"); A.emitir(d.id); A.validar(d.id);
  A.role("operacoes"); A.aprovarPlano(d.id);
  A.role("comercial");
  return { S, A, d };
}
const tam = (S: Estado, d: Negocio) => render(<Montar S={S}>{(ctx) => <TrabalhosAMais {...ctx} d={d} />}</Montar>);
const portal = (S: Estado, d: Negocio) => render(<Montar S={S}>{(ctx) => <PortalCliente ctx={ctx} d={d} fechar={() => {}} />}</Montar>);
const cartao = () => screen.getByRole("listitem", { name: `Adenda ${N}` });
const tarefa = (S: Estado, d: Negocio, papel: Parameters<typeof minhas>[1], t: string | RegExp) => minhas(S, papel).find((x) => x.d === d && (typeof t === "string" ? x.p.t === t : t.test(x.p.t)));

describe("a adenda com o percurso do orçamento, de ponta a ponta", () => {
  it("verificar → Direção aprova → enviar → o cliente pede alterações → v2 → aceita → contrato → assina por SMS → 1.ª parcela → paga → validada → EC → arranque", () => {
    const { S, A, d } = preparar();
    A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu", { desconto: 25 });
    const a = d.adendas![0];
    expect(a.estado).toBe("rascunho");
    expect(tarefa(S, d, "comercial", `Verificar e enviar a adenda ${N}`)?.p.act).toBe("verificarAdenda");

    // 1. o comercial verifica: o desconto deixa a margem abaixo do mínimo; pede a aprovação à Direção
    tam(S, d);
    fireEvent.click(within(cartao()).getByRole("button", { name: "Verificar e enviar ao cliente" }));
    expect(a).toMatchObject({ estado: "rascunho", verif: true });
    expect(within(cartao()).getByRole("list", { name: `Bloqueios da adenda ${N}` }).textContent).toMatch(/O desconto de 25% deixa a margem em/);
    expect(within(cartao()).queryByRole("button", { name: "Enviar ao cliente" })).toBeNull();
    fireEvent.click(within(cartao()).getByRole("button", { name: "Pedir aprovação à Direção" }));
    expect(a.aprov).toBe("pedida");
    expect(within(cartao()).getByText("À espera da aprovação da Direção.")).toBeTruthy();
    cleanup();

    // 2. a Direção aprova (o Hoje dela tem a tarefa; o cartão, os botões)
    expect(tarefa(S, d, "direcao", `Aprovar a exceção à margem da adenda ${N}`)?.p.act).toBe("aprovarAdenda");
    S.role = "direcao";
    tam(S, d);
    fireEvent.click(within(cartao()).getByRole("button", { name: "Aprovar a exceção" }));
    expect(a.aprov).toBe("ok");
    cleanup();

    // 3. o comercial envia: a proposta da adenda vai ao portal
    S.role = "comercial";
    tam(S, d);
    fireEvent.click(within(cartao()).getByRole("button", { name: "Enviar ao cliente" }));
    expect(a.estado).toBe("enviada");
    expect(tarefa(S, d, "comercial", `À espera do cliente (adenda ${N})`)?.p.wait).toBe(true);
    cleanup();

    // 4. no portal: o percurso da adenda, a proposta inteira; o cliente pede alterações
    portal(S, d);
    expect(within(screen.getByRole("list", { name: "O seu percurso" })).getAllByText("Proposta da adenda").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: `Reveja a proposta da adenda ${N}` })).toBeTruthy();
    const prop = screen.getByRole("region", { name: "A proposta da adenda" });
    expect(within(prop).getByText("O que vamos fazer")).toBeTruthy();
    expect(within(prop).getByText("O plano da obra")).toBeTruthy();
    expect(within(prop).getByText("Pagamento")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("region", { name: "Próximo passo" })).getByRole("button", { name: "Pedir alterações ou recusar" }));
    fireEvent.click(screen.getByRole("button", { name: /^Pedir alterações(?! ou)/ }));
    fireEvent.click(within(screen.getByRole("group", { name: "O que gostava de mudar" })).getByRole("button", { name: /O preço/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Conte-nos o que mudaria/ }), { target: { value: "Sem desconto não dá, mas menos área" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar o pedido" }));
    expect(a.pedidoCliente).toMatchObject({ motivos: ["Baixar o preço"], nota: "Sem desconto não dá, mas menos área" });
    expect(screen.getByRole("heading", { name: `Estamos a preparar uma nova versão da adenda ${N}` })).toBeTruthy();
    cleanup();

    // 5. o comercial faz a versão 2 (o mesmo número), sem o desconto: verifica-se e vai logo ao portal
    expect(tarefa(S, d, "comercial", `O cliente pediu alterações à adenda ${N}`)).toBeTruthy();
    tam(S, d);
    fireEvent.click(within(cartao()).getByRole("button", { name: "Fazer a versão 2" }));
    const desc = screen.getByLabelText("Desconto (%)") as HTMLInputElement;
    expect(desc.value).toBe("25");
    fireEvent.change(desc, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar e enviar a versão 2" }));
    expect(a).toMatchObject({ n: N, estado: "enviada", pedidoCliente: null });
    expect(a.versoes).toHaveLength(1);
    expect(versaoAdenda(a)).toBe(2);
    expect(a.desconto).toBeUndefined();
    cleanup();

    // 6. no portal: a v2 substitui a v1; o cliente aceita (com a confirmação)
    portal(S, d);
    expect(screen.getByText(/versão 2, com o que pediu/)).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "A proposta da adenda" })).getByText(/substitui a versão 1/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("region", { name: "Próximo passo" })).getByRole("button", { name: "Aceitar a adenda" }));
    expect(screen.getByText(new RegExp(`Aceitar a adenda ${N}, de`))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(a.estado).toBe("aceite");
    expect(screen.getByRole("heading", { name: "O contrato da adenda está a ser preparado" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Próximo passo" })).toBeNull();
    cleanup();

    // 7. o comercial gera o contrato da adenda (o Hoje diz-lhe)
    expect(tarefa(S, d, "comercial", `Aceitou a adenda ${N}: gerar o contrato`)?.p.act).toBe("enviarContratoAdenda");
    tam(S, d);
    expect(within(cartao()).getByText("aceite · contrato por gerar")).toBeTruthy();
    fireEvent.click(within(cartao()).getByRole("button", { name: "Gerar o contrato da adenda" }));
    expect(a.contrato).toBe("enviado");
    expect(within(cartao()).getByText("contrato enviado · por assinar")).toBeTruthy();
    cleanup();

    // 8. no portal: o contrato da adenda à vista; assina com o código por SMS
    portal(S, d);
    expect(screen.getByRole("heading", { name: `Assinar a adenda ${N}` })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "A adenda" })).getByText(/Cláusula 2\.ª · Preço/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("region", { name: "Próximo passo" })).getByRole("button", { name: /Assinar a adenda/ }));
    fireEvent.click(screen.getByRole("button", { name: /Código por SMS/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar o código por SMS" }));
    const certo = screen.getByTestId("codigo-sms").textContent!;
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(`Li e aceito a adenda ${N}`) }));
    fireEvent.change(screen.getByLabelText("Código de 6 dígitos"), { target: { value: certo } });
    fireEvent.click(screen.getByRole("button", { name: /Assinar a adenda/ }));
    expect(a).toMatchObject({ estado: "assinada", assinatura: { tipo: "sms" } });
    expect(passoPortal(d)).toEqual({ i: 4, estado: "pagar", adenda: N });
    expect(screen.getByRole("heading", { name: "A fatura da 1.ª parcela está a caminho" })).toBeTruthy();
    expect(d.obra.plano!.tasks.some((t) => t.adenda === N)).toBe(true);
    cleanup();

    // 9. o Financeiro emite a fatura da 1.ª parcela (50%, como no contrato)
    expect(tarefa(S, d, "financeiro", /^Emitir a fatura da adenda AD 2026\/1027-1 · 1\.ª parcela$/)?.p.act).toBe("faturarAdendas");
    S.role = "financeiro";
    render(<Montar S={S}>{(ctx) => <DocumentosSimples {...ctx} d={d} />}</Montar>);
    const bloco = screen.getByTestId(`fin-adenda-${N}`);
    expect(bloco.textContent).toMatch(/Emitir a fatura da 1\.ª parcela \(na adjudicação, 50%\)/);
    fireEvent.click(within(bloco).getByRole("button", { name: "Emitir a fatura" }));
    const f0 = a.faturas![0];
    expect(f0).toMatchObject({ i: 0, p: 0.5 });
    expect(f0.v).toBeCloseTo(totaisAdenda(a).total / 2, 1);
    cleanup();

    // 10. no portal: "Ver a fatura" abre a fatura (não a adenda); paga por transferência
    portal(S, d);
    expect(screen.getByRole("heading", { name: "Pagar a 1.ª parcela da adenda" })).toBeTruthy();
    const pag = screen.getByText(`Pagar a fatura ${f0.n}`).parentElement!;
    expect(pag.textContent).toMatch(new RegExp(`Adenda ${N} · 1\\.ª parcela`));
    expect(pag.textContent).toContain(`${eur(f0.v)} €`);
    fireEvent.click(within(pag).getByRole("button", { name: /Ver a fatura/ }));
    expect(screen.getByText("Fatura")).toBeTruthy();
    expect(screen.getByText(f0.n)).toBeTruthy();
    expect(screen.getAllByText(/1\.ª parcela \(na adjudicação\): 50%/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Adenda ao contrato")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao portal" }));
    const pag2 = screen.getByText(`Pagar a fatura ${f0.n}`).parentElement!;
    fireEvent.click(within(pag2).getByRole("radio", { name: "Transferência" }));
    fireEvent.click(within(pag2).getByRole("button", { name: "Já paguei" }));
    expect(f0.pag?.comprovativo).toBeTruthy();
    expect(lerInventario().ecs.some((e) => e.id === "EC-1027-A1")).toBe(false);
    cleanup();

    // 11. o Financeiro valida: sai o recibo e a encomenda da adenda nasce (1.ª parcela paga)
    expect(tarefa(S, d, "financeiro", /^Validar o pagamento da adenda AD 2026\/1027-1 · 1\.ª parcela$/)).toBeTruthy();
    A.role("financeiro"); A.validarPagamentosAdenda(d.id);
    expect(f0.recibo?.n).toMatch(/^RC 2026\//);
    expect(lerInventario().ecs.some((e) => e.id === "EC-1027-A1" && !e.deleted)).toBe(true);
    expect(passoPortal(d).estado).toBe("obra");
    // a 2.ª parcela (no fim da obra) não segura o arranque
    expect(a.faturas).toHaveLength(1);

    // 12. o arranque: os materiais recebidos e o plano aprovado de novo (a adenda reabriu-o)
    expect(receberTudo("CT 2026/1027")).toBe("");
    expect(receberTudo("CT 2026/1027 · A1")).toBe("");
    A.role("operacoes"); A.aprovarPlano(d.id);
    expect(faltaParaArrancar(d)).toEqual([]);
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("em curso");
  });
});

describe("a adenda: o IVA, os documentos, o Hoje e a linha do tempo", () => {
  it("com materiais (linha livre): 6% na mão de obra e 23% nos materiais, na proposta e no contrato da adenda", () => {
    const { S, A, d } = preparar();
    const n = A.criarAdenda(d.id, [], "Surpresa em obra", { livres: [{ n: "Trocar o cano", h: 6, preco: 300, perfil: "Canalização", mats: [{ n: "Tubo PVC 110", q: 2, un: "tubo", preco: 50 }] }] })!;
    expect(A.verificarEnviarAdenda(d.id, n)).toBe(true);
    const a = d.adendas![0], T = totaisAdenda(a);
    expect(T).toMatchObject({ mo: 300, mat: 100 });
    expect(T.total).toBeCloseTo(300 * 1.06 + 100 * 1.23, 6);
    portal(S, d);
    const prop = screen.getByRole("region", { name: "A proposta da adenda" });
    const linha = (l: string) => within(prop).getByText(l, { selector: "td" }).closest("tr")!.textContent!;
    expect(linha("Mão de obra")).toContain(`6% · ${eur(T.ivaMo)} €`);
    expect(linha("Materiais")).toContain(`23% · ${eur(T.ivaMat)} €`);
    expect(within(prop).getByText(/Tubo PVC 110/, { selector: "td" }).textContent).toMatch(/IVA 23%/);
    // o total com IVA à cabeça do passo
    expect(within(screen.getByRole("region", { name: "Agora" })).getByText(`${eur(T.total)} €`, { selector: "dd" })).toBeTruthy();
    cleanup();
    A.aceitarAdenda(d.id, n); A.enviarContratoAdenda(d.id, n);
    portal(S, d);
    expect(within(screen.getByRole("region", { name: "A adenda" })).getByText(/de materiais, com IVA a 23%/)).toBeTruthy();
  });

  it("o Hoje do comercial: a recusa (até a marcar como vista); o do Jurídico: o pedido de alterações ao contrato da adenda", () => {
    const { S, A, d } = preparar();
    A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu");
    A.verificarEnviarAdenda(d.id, N);
    A.recusarAdenda(d.id, N, "O preço");
    expect(tarefa(S, d, "comercial", `O cliente recusou a adenda ${N}`)?.p.act).toBe("vistaRecusaAdenda");
    A.vistaRecusaAdenda(d.id);
    expect(tarefa(S, d, "comercial", /recusou a adenda/)).toBeUndefined();
    const n2 = A.criarAdenda(d.id, [{ sid: "pint", q: 10 }], "O cliente pediu")!;
    A.verificarEnviarAdenda(d.id, n2); A.aceitarAdenda(d.id, n2); A.enviarContratoAdenda(d.id, n2);
    expect(tarefa(S, d, "comercial", `À espera da assinatura da adenda ${n2}`)?.p.sim).toBe("assinar");
    A.pedirAlteracoesContratoAdenda(d.id, n2, [{ c: "Prazo", nota: "Quero mais um dia de folga" }]);
    expect(passoPortal(d)).toMatchObject({ estado: "revisao", adenda: n2 });
    expect(tarefa(S, d, "juridico", `O cliente pediu alterações ao contrato da adenda ${n2}`)?.p.act).toBe("abrirRevisaoAdenda");
    A.abrirRevisaoAdenda(d.id);
    expect(S).toMatchObject({ revisao: d.id, revisaoAdenda: n2 });
    A.reverClausula(d.id, "Prazo", "Mais 2 dias úteis, com um de folga.", n2);
    A.validarContrato(d.id, n2);
    const a2 = d.adendas![1];
    expect(a2).toMatchObject({ contratoPedido: null, clausulas: { Prazo: "Mais 2 dias úteis, com um de folga." } });
    expect(d.orc!.clausulas).toBeUndefined(); // o contrato do negócio não muda
    expect(tarefa(S, d, "comercial", `Enviar o contrato da adenda ${n2} (versão 2)`)?.p.act).toBe("enviarContratoAdenda");
  });

  it("os documentos do portal: a proposta, o contrato e as faturas de cada adenda, também a recusada e a retirada, com o estado; a linha do tempo", () => {
    const { S, A, d } = preparar();
    A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu");
    adendaAssinada(A, d.id, N);
    A.role("financeiro"); A.faturarAdendas(d.id); A.role("comercial");
    const n2 = A.criarAdenda(d.id, [{ sid: "pint", q: 5 }], "O cliente pediu")!;
    A.verificarEnviarAdenda(d.id, n2); A.recusarAdenda(d.id, n2, "O prazo");
    const n3 = A.criarAdenda(d.id, [{ sid: "pint", q: 3 }], "Erro de medição")!;
    A.verificarEnviarAdenda(d.id, n3); A.anularAdenda(d.id, n3);
    const n4 = A.criarAdenda(d.id, [{ sid: "pint", q: 2 }], "Erro de medição")!; // por enviar: o cliente não a vê
    portal(S, d);
    const docs = screen.getByRole("region", { name: "Documentos" });
    const f0 = d.adendas![0].faturas![0];
    for (const t of [`Proposta da adenda ${N}`, `Adenda ${N} ao contrato · assinada`, `Fatura ${f0.n} · adenda ${N}, 1.ª parcela`, `Proposta da adenda ${n2} · não aceite`, `Proposta da adenda ${n3} · retirada`])
      expect(within(docs).getByRole("button", { name: new RegExp(t.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")) })).toBeTruthy();
    expect(within(docs).queryByRole("button", { name: new RegExp(n4.replace(/[/]/g, "\\/")) })).toBeNull();
    // abrir a fatura da adenda pelos documentos: a fatura, com a parcela
    fireEvent.click(within(docs).getByRole("button", { name: new RegExp(`Fatura ${f0.n.replace(/[/]/g, "\\/")}`) }));
    expect(screen.getByText(/1\.ª parcela \(na adjudicação\): 50%/, { selector: "span" })).toBeTruthy();
    // a linha do tempo da obra: enviadas, aceite, recusada, retirada e assinada
    const H = historiaDaObra(d).filter((x) => x.k === "adenda").map((x) => x.t);
    expect(H).toEqual(expect.arrayContaining([`Proposta da adenda ${N} recebida`, `Adenda ${N} aceite`, `Trabalhos a mais: adenda ${N}`, `Não aceitou a adenda ${n2}`, `Adenda ${n3} retirada`]));
    expect(H.some((t) => t.includes(n4))).toBe(false);
  });
});
