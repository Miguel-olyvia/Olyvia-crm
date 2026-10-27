// Ida e volta do Negócio: Negocio → linhas das tabelas → Negocio, sem base. Com os negócios de exemplo da Emylia e com o caso real da
// Anabela em cada passo (orçamento, proposta enviada e aceite, contrato enviado e assinado, 1.ª fatura paga). O que volta tem de ser
// igual ao que foi, tirando o que ainda não vai para a base (a obra, as adendas, a demolição, o acesso ao portal) e o que é só do ecrã.
import { beforeEach, describe, expect, it } from "vitest";
import { acoes, seed, type Estado, type Negocio } from "../motor";
import { estadoVazio } from "../estadoOrganizacao";
import { montarAnabela, K_ANABELA, preencher } from "../casos/montarAnabela";
import { PAGAMENTO } from "../casos/propostaAnabela";
import { PROPOSTA } from "../campos";
import { ligarCatalogo } from "../produtosVisita";
import { usarTecnicos } from "../equipa/tecnicos";
import { esquecerInventario } from "../inventario/loja";
import { PAGAMENTO_MEDIDA, type Prestacao } from "../planoObra";
import { faturasDe, guardarFaturas, tranchesDe } from "../v2/estadoV2";
import { deLinhas, normalQ, paraLinhas } from "./negocioReal";

const HOJE = new Date(2026, 9, 27, 10, 0);

/** O Negocio como fica depois da ida e volta: datas no formato do motor, sem o que ainda não vai para a base nem o que é só do ecrã. */
function normal(d0: Negocio): unknown {
  const d = structuredClone(d0) as Negocio & Record<string, unknown>;
  const q = (s: string | null | undefined) => normalQ(s, HOJE);
  delete d.fresh; delete d.valida; delete d.atraso; delete d.adendas; delete d.acesso;
  d.obra = { plano: null, mats: null, real: null, aprendido: false };
  d.quando = q(d.quando);
  d.hist = d.hist.map((e) => ({ ...e, q: q(e.q) }));
  if (d.anulado) d.anulado.q = q(d.anulado.q);
  delete (d.fin as Record<string, unknown>).erp;
  if (d.fin.fatura) d.fin.fatura.q = q(d.fin.fatura.q);
  if (d.fin.recibo) d.fin.recibo.q = q(d.fin.recibo.q);
  for (const t of d.fin.tranches ?? []) { t.data = t.data.slice(0, 10); if (t.pagamento) t.pagamento.data = t.pagamento.data.slice(0, 10); delete t.daDemo; }
  const o = d.orc;
  if (o) {
    delete o.demolicao;
    o.enviada = o.enviada ? q(o.enviada) : null;
    o.aceite = o.aceite ? q(o.aceite) : null;
    o.avisosVistos = Object.fromEntries(Object.entries(o.avisosVistos ?? {}).filter(([, x]) => x));
    if (o.assinatura) { o.assinatura.q = o.assinatura.q.replace(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2})$/, "$1/$2/$3 $4"); delete o.assinatura.imagem; }
    if (o.pedidoCliente) o.pedidoCliente.q = q(o.pedidoCliente.q);
    if (o.recusada) o.recusada.q = q(o.recusada.q);
    if (o.contratoPedido) o.contratoPedido.q = q(o.contratoPedido.q);
    if (o.contratoRevisto) o.contratoRevisto.q = q(o.contratoRevisto.q);
    for (const cv of o.contratoVersoes ?? []) { cv.substituido = q(cv.substituido); if (cv.revisto) cv.revisto.q = q(cv.revisto.q); }
    for (const v of o.versoes ?? []) {
      v.enviada = q(v.enviada); v.substituida = q(v.substituida); if (v.aceite) v.aceite = q(v.aceite);
      v.desconto ??= 0;
      for (const l of v.linhas ?? []) if (l.t === "svc" && l.det) l.det.q = q(l.det.q);
    }
    for (const l of o.linhas) if (l.t === "svc" && l.det) l.det.q = q(l.det.q);
    if (o.prazo && !Object.keys(o.prazo).length) delete o.prazo;
    // os opcionais a null são o mesmo que não existirem (o motor põe-nos a null depois de os usar)
    for (const k of ["pedidoCliente", "recusada", "contratoPedido", "contratoRevisto", "assinatura"] as const) if (o[k] === null) delete o[k];
  }
  // o que não tem valor não volta (undefined / objetos vazios)
  const v = d.visita as Record<string, unknown>;
  for (const k of ["manter", "clienteCompra"]) if (v[k] && !Object.keys(v[k] as object).length) delete v[k];
  if (d.sug && !Object.keys(d.sug).length) delete d.sug;
  if (d.vis && !d.vis.length) delete d.vis;
  return JSON.parse(JSON.stringify(d));
}
const idaEVolta = (d: Negocio) => JSON.parse(JSON.stringify(deLinhas(paraLinhas(d, HOJE))));

beforeEach(() => { localStorage.clear(); esquecerInventario(); });

describe("Negócio ↔ linhas das tabelas", () => {
  it("os 11 negócios de exemplo voltam iguais", () => {
    const S = seed();
    expect(S.deals.length).toBeGreaterThan(5);
    for (const d of S.deals) expect(idaEVolta(d), `negócio ${d.id} (${d.nome})`).toEqual(normal(d));
  });

  it("o caso real da Anabela volta igual em cada passo, da lead à 1.ª fatura paga", () => {
    ligarCatalogo(() => K_ANABELA);
    const S: Estado = estadoVazio("org-caso-real");
    usarTecnicos(S.tecnicos!);
    const A = acoes(S, () => {}, (fn) => fn());
    const M = montarAnabela(S, A, []);
    const id = M.id;
    const d = () => S.deals.find((x) => x.id === id)!;
    const passo = (nome: string) => expect(idaEVolta(d()), nome).toEqual(normal(d()));
    passo("orçamento por zonas");
    A.verificar(id);
    for (const [k, v] of Object.entries({ validade: "15 dias", inicio_prev: "2026-11-02", garantia: "5 anos", modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Direção", multa: "Não", notas_cliente: "Proposta P-2026-0109." })) A.campo(id, k, v);
    const MOMENTO: Prestacao["fase"][] = [0, 0, 0, 1, "fim"];
    A.pagamentoPlano(id, PAGAMENTO_MEDIDA, PAGAMENTO.map(([l, p], i) => ({ l, p: p / 100, fase: MOMENTO[i] })));
    preencher(d(), PROPOSTA);
    passo("verificado, com as prestações à medida");
    A.enviar(id);
    passo("proposta enviada");
    A.aceitar(id);
    passo("proposta aceite");
    A.enviarContrato(id);
    passo("contrato enviado");
    A.assinarCom(id, { tipo: "sms", nome: "Anabela Correia", q: "12/10/2026 12:54", id: "OTP-CC-2026-0331" });
    passo("contrato assinado");
    const TR = tranchesDe(d());
    for (const [k, v] of Object.entries({ nome_fiscal: "Anabela Schroeder", nif_fat: "123456789", serie: "FT 2026", tranche: TR[0].nome, vencimento: "Pronto pagamento", metodo: "Transferência", conta: "Banco A · conta à ordem", comprovativo: "Transferência adjudicação" })) A.campo(id, k, v);
    S.role = "financeiro";
    A.emitir(id);
    A.validar(id);
    guardarFaturas(S, id, faturasDe(S, d()));
    expect(d().fin.tranches?.length).toBe(1);
    passo("1.ª fatura paga, com o recibo");
  });

  it("versões da proposta, cláusulas pedidas e revistas, contrato anulado e negócio perdido voltam iguais", () => {
    ligarCatalogo(() => K_ANABELA);
    const S: Estado = estadoVazio("org-caso-real");
    usarTecnicos(S.tecnicos!);
    const A = acoes(S, () => {}, (fn) => fn());
    const { id } = montarAnabela(S, A, []);
    const d = () => S.deals.find((x) => x.id === id)!;
    const passo = (nome: string) => expect(idaEVolta(d()), nome).toEqual(normal(d()));
    A.verificar(id);
    preencher(d(), PROPOSTA);
    A.enviar(id);
    A.pedirAlteracoes(id, "Quero outro pavimento", ["Outros materiais"]);
    passo("o cliente pediu alterações");
    A.novaVersao(id, ["Outros materiais"], "Pavimento vinílico", "orcamento");
    passo("nova versão em rascunho, a 1.ª guardada");
    A.verificar(id);
    A.enviarVersao(id);
    passo("versão 2 enviada");
    A.aceitar(id);
    A.enviarContrato(id);
    A.pedirAlteracoesContrato(id, [{ c: "Prazo", nota: "Preciso de mais 15 dias" }]);
    passo("o cliente pediu para mudar uma cláusula");
    A.abrirRevisao(id);
    A.reverClausula(id, "Prazo", "A obra fica pronta em 45 dias úteis.", "Inês");
    A.validarContrato(id, "Inês");
    passo("cláusula revista e contrato validado pelo Jurídico");
    A.assinarCom(id, { tipo: "digital", nome: "Anabela Correia", q: "14/10/2026 10:30", id: "CMD-1", telemovel: "9•• ••• 123" });
    passo("assinado com a Chave Móvel Digital");
    A.anularContrato(id, "O cliente desistiu da obra");
    passo("contrato anulado");
  });

  it("um negócio perdido volta igual", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => !x.perdido && x.fase < 3)!;
    A.perder(d.id);
    A.perderSim(d.id);
    expect(S.deals.find((x) => x.id === d.id)!.perdido).toBe(true);
    expect(idaEVolta(S.deals.find((x) => x.id === d.id)!)).toEqual(normal(S.deals.find((x) => x.id === d.id)!));
  });
});
