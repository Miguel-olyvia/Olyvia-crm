// A página do negócio no portal real (src/emylia/PortalCliente.tsx) com o idioma do portal. O idioma entra por prop (`idioma`, omissão
// «pt»): sem a prop (o CRM, a pré-visualização e o protótipo) o ecrã sai em português como sempre, mesmo que o portal do dono esteja em EN.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { PortalCliente, type PortalReal } from "./PortalCliente";
import { PAGAMENTO_EXEMPLO, definirDadosPagamento } from "./pagamentoCliente";
import { rotuloDia } from "./preparacaoObra";
import { rotuloDiaEm } from "./portalClienteIdioma";
import { CHAVE_IDIOMA_PORTAL } from "@/portal-i18n";

afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* sem armazém */ } });
beforeEach(() => { definirDadosPagamento(PAGAMENTO_EXEMPLO); });

type Fase = "rever" | "pedido" | "recusada" | "preparar" | "assinar" | "obra" | "auto" | "relatorio" | "adenda";

/** Um negócio do exemplo posto no passo pedido, sem nada de dados reais. */
function negocio(fase: Fase): { S: Estado; d: Negocio } {
  const S = seed();
  const d = S.deals.find((x) => x.orc && x.orc.linhas.some((l) => l.t === "svc")) as Negocio;
  const o = d.orc!;
  Object.assign(o, { enviada: "01/11/2026", aceite: null, contrato: null, vendaDireta: false, recusada: null, pedidoCliente: null, versoes: [] });
  d.perdido = false; d.f.prazo_exec = ""; d.fin.fatura = null; d.fin.pago = false; d.fin.tranches = []; d.adendas = [];
  if (fase === "pedido") o.pedidoCliente = { motivos: ["Baixar o preço"], nota: "mais barato", q: "02/11" };
  if (fase === "recusada") { o.recusada = { motivos: ["O preço"], q: "02/11" }; d.perdido = true; }
  if (fase !== "rever" && fase !== "pedido" && fase !== "recusada") o.aceite = "01/11/2026";
  if (fase === "assinar") o.contrato = "enviado";
  if (["obra", "auto", "relatorio", "adenda"].includes(fase)) {
    o.contrato = "assinado"; o.aprov = "ok";
    d.obra.plano = { tasks: [{ nome: "Canalização", svcs: ["canal"], dia: 0, dur: 1, sk: "Canalizador", h: 8, tec: null, fase: 2 }], estado: "em curso", dia: 0 } as unknown as Negocio["obra"]["plano"];
  }
  if (fase === "obra") d.fin.fatura = { n: "FT 2026/1", q: "01/11" };
  if (fase === "auto" || fase === "relatorio") {
    d.obra.plano!.estado = "concluída";
    d.obra.auto = { n: "AR 2026/7", q: "20/11/2026", estado: fase === "auto" ? "por assinar" : "assinado" } as Negocio["obra"]["auto"];
  }
  if (fase === "adenda") {
    const sid = Object.keys(S.svc)[0];
    d.adendas = [{ n: "A1", estado: "enviada", criada: "01/11/2026", enviada: "02/11/2026", motivo: "Pedido do cliente",
      linhas: [{ sid, n: S.svc[sid].n, un: S.svc[sid].un, q: 2, pu: 50, h: 1, perfil: S.svc[sid].perfil, cu: 30, mo: 20 }] } as unknown as NonNullable<Negocio["adendas"]>[number]];
  }
  return { S, d };
}

function montar(fase: Fase, idioma?: "pt" | "en") {
  const { S, d } = negocio(fase);
  const A = acoes(S, vi.fn(), (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  const real: PortalReal = {
    abrirProposta: vi.fn(), abrirContrato: vi.fn(), documentosNoTemplate: true, conversa: <p>CONVERSA-REAL</p>,
    receberObra: () => <p>RECEBER</p>, assinarComSms: () => <p>SMS</p>, avisarPagamento: async () => {}, avisados: [],
  };
  render(<PortalCliente ctx={ctx} d={d} fechar={() => {}} real={real} {...(idioma ? { idioma } : {})} />);
}
const texto = () => document.body.textContent ?? "";

/** Por passo: o que se lê em português e o mesmo em inglês (só texto da página, nunca dados). */
const TEXTOS: Record<Fase, { pt: string[]; en: string[] }> = {
  rever: {
    pt: ["Olá,", "Rever a proposta", "Passo 1 de 5", "Reveja a sua proposta", "Total, com IVA", "a combinar", "Responder à proposta", "A sua proposta", "Abrir a proposta", "Documentos", "Proposta PR 2026/"],
    en: ["Hello,", "Review the proposal", "Step 1 of 5", "Review your proposal", "Total, including VAT", "to be agreed", "Reply to the proposal", "Your proposal", "Open the proposal", "Documents", "Proposal PR 2026/"],
  },
  pedido: {
    pt: ["Pedido enviado", "Estamos a preparar uma nova proposta", "O que pediu", "O preço"],
    en: ["Request sent", "We are preparing a new proposal", "What you asked for", "The price"],
  },
  recusada: { pt: ["Proposta recusada", "Obrigado por nos dizer"], en: ["Proposal declined", "Thank you for telling us"] },
  preparar: {
    pt: ["Proposta aceite", "O contrato está a ser preparado", "Normalmente fica pronto no mesmo dia.", "Ver a proposta que aceitou"],
    en: ["Proposal accepted", "The contract is being prepared", "It is usually ready the same day.", "View the proposal you accepted"],
  },
  assinar: {
    pt: ["Passo 3 de 5", "Leia-o aqui em baixo", "O seu contrato", "Abrir o contrato"],
    en: ["Step 3 of 5", "Read it below", "Your contract", "Open the contract"],
  },
  obra: {
    pt: ["Contrato assinado", "A sua obra", "O plano, fase a fase", "Também pode ligar a", "Também precisa de si", "Pagar a fatura FT 2026/1", "A pagar", "Como quer pagar?", "Já paguei", "Ver a fatura"],
    en: ["Contract signed", "Your works", "The plan, phase by phase", "You can also call", "You are also needed for", "Pay invoice FT 2026/1", "To pay", "How would you like to pay?", "I have paid", "View the invoice"],
  },
  auto: {
    pt: ["Obra concluída", "Receber o serviço", "Como encontrou a obra?", "Está tudo bem", "Tenho uma observação", "Diga primeiro como encontrou a obra.", "Assinar o auto de receção"],
    en: ["Works completed", "Receive the service", "How did you find the works?", "Everything is fine", "I have a remark", "First, tell us how you found the works.", "Sign the handover record"],
  },
  relatorio: { pt: ["Obra recebida · auto AR 2026/7 assinado", "O relatório da sua obra"], en: ["Works received · record AR 2026/7 signed", "Your works report"] },
  adenda: {
    pt: ["Trabalhos a mais · passo 1 de 5", "Reveja a proposta da adenda A1", "A mais, com IVA", "Aceitar a adenda", "Pedir alterações ou recusar", "Proposta da adenda A1", "O contrato passa de"],
    en: ["Extra work · step 1 of 5", "Review the proposal for addendum A1", "Extra, including VAT", "Accept the addendum", "Ask for changes or decline", "Proposal for addendum A1", "The contract goes from"],
  },
};
const FASES = Object.keys(TEXTOS) as Fase[];

describe("PortalCliente com idioma: inglês", () => {
  it.each(FASES)("%s: o texto da página sai em inglês e nenhum dos textos portugueses aparece", (fase) => {
    montar(fase, "en");
    for (const e of TEXTOS[fase].en) expect(texto(), `em falta (EN): ${e}`).toContain(e);
    for (const p of TEXTOS[fase].pt) expect(texto(), `ficou em português: ${p}`).not.toContain(p);
  });

  it("os nomes acessíveis (o percurso, o passo de agora, a barra, os documentos) também seguem o idioma", () => {
    montar("rever", "en");
    expect(screen.getByRole("dialog", { name: /^Client portal: / })).toBeTruthy();
    expect(screen.getByLabelText("Your journey")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Next step" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Documents" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close the portal" })).toBeTruthy();
    cleanup();
    montar("obra", "en");
    expect(screen.getByRole("region", { name: "Talk to the team" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "The works plan" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "What needs you" })).toBeTruthy();
  });

  it("pedir alterações ou recusar: os cartões, os motivos e as cláusulas em inglês", () => {
    montar("adenda", "en");
    fireEvent.click(screen.getByRole("button", { name: "Ask for changes or decline" }));
    for (const e of ["What would you prefer?", "Ask for changes", "Decline the addendum", "Back to the proposal"]) expect(texto()).toContain(e);
    for (const p of ["O que prefere?", "Pedir alterações", "Não aceitar a adenda", "Voltar à proposta"]) expect(texto()).not.toContain(p);
    fireEvent.click(screen.getByRole("button", { name: /^Ask for changes/ }));
    for (const e of ["What would you like to change?", "Materials or finishes", "The payment method", "Send the request"]) expect(texto()).toContain(e);
    for (const p of ["O que gostava de mudar?", "Materiais ou acabamentos", "A forma de pagamento", "Enviar o pedido"]) expect(texto()).not.toContain(p);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: /Decline the addendum/ }));
    for (const e of ["Why do you not want this work?", "I do not need this work", "I want to talk first", "ask for changes instead"]) expect(texto()).toContain(e);
    for (const p of ["Porque não quer estes trabalhos?", "Não preciso destes trabalhos", "Quero falar primeiro", "peça antes alterações"]) expect(texto()).not.toContain(p);
  });

  it("pagar: as formas, os dados e o débito direto em inglês (dinheiro e números como estão)", () => {
    montar("obra", "en");
    expect(screen.getByRole("radiogroup", { name: "How would you like to pay" })).toBeTruthy();
    for (const e of ["Bank transfer", "MB Way", "Direct debit", "Bank transfer", "Account holder:", "Description"]) expect(texto()).toContain(e);
    for (const p of ["Transferência", "Débito direto", "Titular:", "Descritivo", "Já pagou?"]) expect(texto()).not.toContain(p);
    fireEvent.click(screen.getByRole("radio", { name: "Direct debit" }));
    for (const e of ["Direct debit on your account", "IBAN of your account", "Account holder", "Authorise the debit", "I authorise"]) expect(texto()).toContain(e);
    for (const p of ["Débito direto na sua conta", "IBAN da sua conta", "Autorizar o débito", "Autorizo"]) expect(texto()).not.toContain(p);
    expect(texto()).toMatch(/\d+,\d{2} €/); // o montante continua no formato português
  });
});

describe("PortalCliente com idioma: português (omissão)", () => {
  it.each(FASES)("%s: sem a prop e com «pt» o ecrã é o mesmo, em português", (fase) => {
    montar(fase);
    const semProp = document.body.innerHTML;
    for (const p of TEXTOS[fase].pt) expect(texto(), `em falta (PT): ${p}`).toContain(p);
    for (const e of TEXTOS[fase].en) expect(texto(), `inglês fora de sítio: ${e}`).not.toContain(e);
    cleanup();
    montar(fase, "pt");
    expect(document.body.innerHTML).toBe(semProp);
  });

  it("o portal do dono em EN (olyvia_portal_language) não passa para o PortalCliente sem a prop: CRM e protótipo ficam em português", () => {
    try { localStorage.setItem(CHAVE_IDIOMA_PORTAL, "en"); } catch { /* sem armazém */ }
    for (const fase of ["rever", "obra", "adenda"] as const) {
      cleanup();
      montar(fase);
      for (const p of TEXTOS[fase].pt) expect(texto(), `em falta (PT): ${p}`).toContain(p);
      for (const e of TEXTOS[fase].en) expect(texto(), `inglês fora de sítio: ${e}`).not.toContain(e);
    }
  });
});

describe("rotuloDiaEm: o dia do plano («seg, 19 out»)", () => {
  const plano = { origem: "orcamento", inicio: "2026-10-19", tasks: [], estado: "por iniciar", dia: 0 } as unknown as Parameters<typeof rotuloDia>[0];
  it("em português é o mesmo rótulo de sempre; em inglês só mudam as palavras", () => {
    expect(rotuloDiaEm(plano, 0, "pt")).toBe(rotuloDia(plano, 0));
    expect(rotuloDiaEm(plano, 0, "pt")).toBe("seg, 19 out");
    expect(rotuloDiaEm(plano, 0, "en")).toBe("Mon, 19 Oct");
    expect(rotuloDiaEm(plano, 1, "en")).toBe("Tue, 20 Oct");
  });
  it("sem datas no plano (planos antigos), cai no rótulo de sempre nos dois idiomas", () => {
    const antigo = { tasks: [], estado: "por iniciar", dia: 0 } as unknown as Parameters<typeof rotuloDia>[0];
    expect(rotuloDiaEm(antigo, 0, "en")).toBe(rotuloDia(antigo, 0));
  });
});
