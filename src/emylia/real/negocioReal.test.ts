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
import { deLinhas, paraLinhas } from "./negocioReal";
import { normalParaComparar } from "./negocioComparar";

const HOJE = new Date(2026, 9, 27, 10, 0);

const normal = (d: Negocio) => normalParaComparar(d, HOJE);
const idaEVolta = (d: Negocio) => JSON.parse(JSON.stringify(deLinhas(paraLinhas(d, HOJE))));

beforeEach(() => { localStorage.clear(); esquecerInventario(); });

describe("Negócio ↔ linhas das tabelas", () => {
  it("24/11: o desconto do orçamento vai em fração para a base (0 a 1) e volta em % (2,5 % → 0,025 → 2,5 %)", () => {
    const S = seed();
    const d = S.deals.find((x) => x.orc && x.orc.linhas.length) as Negocio;
    d.orc!.desconto = 2.5;
    const L = paraLinhas(d, HOJE);
    const atual = L.orcamentos[L.orcamentos.length - 1];
    expect(atual.desconto).toBe(0.025);
    for (const o of L.orcamentos) expect(o.desconto).toBeLessThanOrEqual(1);
    expect(deLinhas(L).orc!.desconto).toBe(2.5);
  });
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
    A.registarFaturaErp(id, `FT 2026/${id}`, null);
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
    A.reverClausula(id, "Prazo", "A obra fica pronta em 45 dias úteis.");
    A.validarContrato(id);
    passo("cláusula revista e contrato validado pelo Jurídico");
    A.enviarContrato(id);
    expect(d().orc!.contrato).toBe("enviado");
    A.assinarCom(id, { tipo: "digital", nome: "Anabela Correia", q: "14/10/2026 10:30", id: "CMD-1", telemovel: "9•• ••• 123" });
    expect(d().orc!.contrato).toBe("assinado");
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

describe("a vaga da visita (11/11, assistente sem visita.gerir)", () => {
  it("sem vaga vai null, como a base sem medidas: senão a fotografia da visita mudava ao gravar «Quem pede»", () => {
    const d = seed().deals[0];
    d.visita.slot = "";
    expect(paraLinhas(d, HOJE).medidas.slot).toBeNull();
    expect(deLinhas(paraLinhas(d, HOJE)).visita.slot).toBe("");
    d.visita.slot = "seg 16/11 · 09:00";
    expect(paraLinhas(d, HOJE).medidas.slot).toBe("seg 16/11 · 09:00");
  });
});

describe("o email da entidade que neg_ler_negocios devolve (só para pré-preencher o cartão «Dados do cliente»)", () => {
  /** As linhas de um negócio sem resposta `email`, com o email da entidade que a leitura da base traz. */
  const linhasCom = (emailEntidade: string | null | undefined, respostaEmail?: string) => {
    const d = seed().deals[0];
    delete d.f.email;
    const L = paraLinhas(d, HOJE);
    L.respostas = L.respostas.filter((r) => r.campo_chave !== "email");
    if (respostaEmail !== undefined) L.respostas.push({ campo_chave: "email", valor: respostaEmail, sugerido: false });
    if (emailEntidade !== undefined) L.negocio.email = emailEntidade;
    return L;
  };

  it("fica num campo à parte (emailEntidade) e NÃO entra em f.email: f.email continua sem chave", () => {
    const d = deLinhas(linhasCom("a@b.pt"));
    expect(d.emailEntidade).toBe("a@b.pt");
    expect("email" in d.f).toBe(false);
  });

  it("com a resposta `email` gravada no negócio, f.email é essa e o email da entidade fica à parte", () => {
    const d = deLinhas(linhasCom("a@b.pt", "x@y.pt"));
    expect(d.f.email).toBe("x@y.pt");
    expect(d.emailEntidade).toBe("a@b.pt");
  });

  it("uma resposta `email` vazia continua vazia em f.email (o fallback é do cartão, não do negócio)", () => {
    expect(deLinhas(linhasCom("a@b.pt", "  ")).f.email).toBe("  ");
  });

  it("sem email da entidade (vazio, null ou ausente) o campo não existe", () => {
    for (const e of ["", "  ", null, undefined]) expect("emailEntidade" in deLinhas(linhasCom(e))).toBe(false);
  });

  it("o email da entidade não vai para a base: paraLinhas não o escreve em lado nenhum", () => {
    const d = deLinhas(linhasCom("a@b.pt"));
    const L = paraLinhas(d, HOJE);
    expect(JSON.stringify(L)).not.toContain("a@b.pt");
  });
});
