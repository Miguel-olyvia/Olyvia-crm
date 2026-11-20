// 20/11/2026 (auditoria de 19/11, F10): os pagamentos do negócio numa só lista, a mesma no Financeiro e na Obra. Antes o Financeiro
// trabalhava em quatro sítios (o passo Fatura, o passo «Pagamentos» da Obra, as adendas no Financeiro e nos Trabalhos a mais), com duas
// formas de validar, duas de ler o Eticadata e o estado do ERP repetido. Aqui só as regras (sem React): o que é cada linha, o valor, o
// momento, o estado e a única ação dela (registar o número ou «Ok, já foi paga»). O ecrã é Pagamentos.tsx (nome diferente deste: o Windows
// não distingue maiúsculas e "./Pagamentos" apanhava este ficheiro).
// As regras do servidor ficam como estavam (as ações do motor recusam o resto): a fatura só com o contrato assinado; as parcelas a seguir
// à 1.ª quando cai a vez delas (parcelas.ts: o arranque, a obra, o fim); a adenda só se fatura assinada, pela ordem das parcelas.
import { acertoDoValorPendente, adendaDoAcerto, eur, impactoDasMedidas, impactoDoPlano, medidasRetificadas, passoDoContrato, type Estado, type Negocio } from "./motor";
import { parcelasDoContrato, type MomentoParcela } from "./parcelas";
import { assinadas, faturaAValidar, nomeParcela, parcelaFaturavel, parcelasAdenda, primeiraPaga, proximaParcela, textoIvaPorTaxa, totaisAdenda, totalAdenda } from "./adendas";
import { ecDaAdenda, porEncomendarDe } from "./encomendasAjuste";
import { EC_ADENDA_NO_PAGAMENTO } from "./preparacaoObra";
import { erpLembrado, resumoErp } from "./erpEticadata";

/** Quando cai cada parcela do contrato, como se diz ao Financeiro. */
export const QUANDO_CAI: Record<MomentoParcela, string> = {
  inicio: "No início, antes de tudo",
  arranque: "Ao carregar em «Arrancar a obra»",
  obra: "Com a obra a andar",
  fim: "No fim, antes da entrega (sem ela não há auto de receção)",
};

/** Porque ainda não é a vez de uma parcela do contrato (a seguir à 1.ª). */
const AINDA_NAO: Record<MomentoParcela, string> = {
  inicio: "Com a proposta aceite.",
  arranque: "Cai no Financeiro quando as Operações carregam em «Arrancar a obra».",
  obra: "Cai no Financeiro com a fase dela acabada no plano.",
  fim: "Cai no Financeiro no fim da obra, antes da entrega.",
};

/** espera: ainda não é a vez · faturar: falta o número da fatura · pagar: falta o «Ok, já foi paga» · paga: feita (a nota de crédito, registada). */
export type EstadoPagamento = "espera" | "faturar" | "pagar" | "paga";

export interface LinhaPagamento {
  /** Única no negócio: "c:t1", "a:AD 2026/1027-1:0", "nc". */
  chave: string;
  tipo: "contrato" | "adenda" | "nota";
  /** O que é: «1.ª parcela (na adjudicação, 50%)», «Nota de crédito». */
  titulo: string;
  /** O valor (com IVA nas parcelas; na nota de crédito, a descida sem IVA, negativa); null: não se sabe. */
  valor: number | null;
  comIva: boolean;
  /** Quando se paga. */
  momento: string;
  estado: EstadoPagamento;
  /** O estado em palavras: «por faturar», «FT 1 por pagar», «paga · RC 2026/3». */
  textoEstado: string;
  /** O único botão principal da linha (null: nenhum, por agora). */
  acao: "registar" | "pagar" | null;
  /** Porque não há botão (ou o que falta antes). */
  motivo?: string;
  /** O número registado (a fatura ou a nota de crédito). */
  numero?: string;
  /** O estado no Eticadata, em texto (sem botões). */
  erp?: string;
  /** O que o cliente disse no portal. */
  aviso?: string;
  /** Mais uma linha de contexto (os materiais da adenda). */
  extra?: string;
  /** Para as ações: a posição da parcela, a chave da tranche (contrato) e o número da adenda. */
  i: number;
  tranche?: string;
  adenda?: string;
}

export interface GrupoPagamentos {
  chave: string;
  tipo: "contrato" | "adenda" | "nota";
  titulo: string;
  sub?: string;
  linhas: LinhaPagamento[];
}

const pctTxt = (p: number) => `${String(Math.round(p * 10000) / 100).replace(".", ",")}%`;
const dataPt = (iso?: string) => (iso ? iso.split("-").reverse().join("/") : "");

/** O que muda o valor com as medidas retificadas e o plano (sem IVA; negativo: desce). Com a adenda do acerto, o total dela. */
export function difDoAcerto(S: Estado, d: Negocio): number {
  const a = adendaDoAcerto(d);
  if (a) return totalAdenda(a.linhas, a.desconto);
  const mi = impactoDasMedidas(d, S, medidasRetificadas(d)), pi = impactoDoPlano(d, S);
  return (mi?.medidas ?? 0) + (pi.semValor ? 0 : pi.valor);
}

/** A descida (sem IVA, negativa) que pede uma nota de crédito ainda por registar; null: não há. */
export function notaDeCreditoPorRegistar(S: Estado, d: Negocio): number | null {
  if (!acertoDoValorPendente(d) || adendaDoAcerto(d)) return null;
  const dif = difDoAcerto(S, d);
  return dif < -0.004 ? dif : null;
}

function linhasDoContrato(S: Estado, d: Negocio): LinhaPagamento[] {
  const P = parcelasDoContrato(S, d), porAssinar = !!passoDoContrato(d.orc);
  const fechado = d.anulado ? "Contrato anulado." : d.obra.auto ? "A obra já foi entregue." : null;
  return P.map((x) => {
    const base = { chave: `c:${x.id}`, tipo: "contrato" as const, titulo: `${nomeParcela(x.i)} (${x.l.toLowerCase()}, ${pctTxt(x.p)})`, valor: x.v, comIva: true, momento: QUANDO_CAI[x.momento], i: x.i, tranche: x.id };
    const numero = x.i === 0 ? d.fin.fatura?.n ?? x.fatura?.numero : x.fatura?.numero;
    if (x.paga) {
      const recibo = x.i === 0 ? d.fin.recibo?.n ?? x.fatura?.recibo : x.fatura?.recibo;
      return { ...base, estado: "paga", textoEstado: `paga${recibo ? ` · ${recibo}` : ""}`, acao: null, numero };
    }
    if (numero) {
      const info = x.i === 0 ? d.fin.erp ?? erpLembrado(numero) : erpLembrado(numero);
      const erp = info ? `No Eticadata: ${resumoErp(info)}.` : x.i === 0 ? "Sem leitura do Eticadata: a Olyvia verifica sozinha, de 10 em 10 minutos, se já foi paga." : undefined;
      const comp = x.i === 0 ? d.f.comprovativo : undefined;
      const aviso = comp && comp !== "Validado à mão no CRM" ? `O cliente avisou no portal${d.f.data_pag ? ` a ${dataPt(d.f.data_pag)}` : ""}: ${comp}.` : undefined;
      return { ...base, estado: "pagar", textoEstado: `${numero} por pagar`, acao: fechado ? null : "pagar", motivo: fechado ?? undefined, numero, erp, aviso };
    }
    const motivo = fechado ?? (x.i === 0
      ? (!d.orc?.aceite ? "Com a proposta aceite." : porAssinar ? "Depois de o cliente assinar o contrato." : null)
      : (!d.fin.pago ? `Depois de paga a ${nomeParcela(0)}.` : !x.devida ? AINDA_NAO[x.momento] : null));
    return motivo
      ? { ...base, estado: "espera", textoEstado: "ainda não é a vez", acao: null, motivo }
      : { ...base, estado: "faturar", textoEstado: "por faturar", acao: "registar" };
  });
}

function linhasDaAdenda(d: Negocio, n: string): LinhaPagamento[] {
  const a = d.adendas!.find((x) => x.n === n)!;
  const fat = parcelaFaturavel(d, a), prox = proximaParcela(d, a), aValidar = faturaAValidar(a);
  return parcelasAdenda(d, a).map((x) => {
    const f = x.ft;
    const base = {
      chave: `a:${a.n}:${x.i}`, tipo: "adenda" as const, titulo: `${nomeParcela(x.i)} (${x.l.toLowerCase()}, ${pctTxt(x.p)})`, valor: x.v, comIva: true,
      momento: x.i === 0 ? "Com a adenda assinada" : x.fim ? "No fim da obra, com a obra concluída" : `Depois de paga a ${nomeParcela(0)}`, i: x.i, adenda: a.n,
    };
    // 21/10 (decisão B): a 1.ª parcela paga encomenda os materiais da adenda
    let extra: string | undefined;
    if (x.i === 0) {
      const ea = ecDaAdenda(d, a.n), pend = porEncomendarDe(d, a.n).length;
      extra = ea ? `Encomenda ${ea.n} no Inventário · ${ea.linhas.length} ${ea.linhas.length === 1 ? "material" : "materiais"} · ${eur(ea.valor)} € sem IVA.`
        : !pend ? "Sem materiais a encomendar: só mão de obra."
        : primeiraPaga(a) ? "Materiais: a encomenda emite-se logo a seguir à encomenda de cliente inicial."
        : `Materiais: ${EC_ADENDA_NO_PAGAMENTO.replace(/^./, (c) => c.toLowerCase())}`;
    }
    if (f?.recibo) return { ...base, estado: "paga", textoEstado: `paga · ${f.recibo.n}`, acao: null, numero: f.n, extra };
    if (f) {
      const info = erpLembrado(f.n), aVez = aValidar.f?.n === f.n;
      return {
        ...base, estado: "pagar", textoEstado: `${f.n} por pagar`, acao: aVez ? "pagar" : null, motivo: aVez ? undefined : `Depois do pagamento da ${nomeParcela(0)}.`,
        numero: f.n, erp: info ? `No Eticadata: ${resumoErp(info)}.` : undefined, aviso: f.pag?.comprovativo ? `O cliente avisou no portal: ${f.pag.comprovativo}.` : undefined, extra,
      };
    }
    const motivo = prox?.i !== x.i ? "Depois da parcela anterior." : fat.motivo;
    return motivo
      ? { ...base, estado: "espera", textoEstado: "ainda não é a vez", acao: null, motivo, extra }
      : { ...base, estado: "faturar", textoEstado: "por faturar", acao: "registar", extra };
  });
}

/** Os pagamentos do negócio, por grupo: o contrato, cada adenda assinada e a nota de crédito (quando a retificação baixa o valor). */
export function gruposPagamentos(S: Estado, d: Negocio): GrupoPagamentos[] {
  const G: GrupoPagamentos[] = [];
  const C = linhasDoContrato(S, d);
  if (C.length) G.push({ chave: "contrato", tipo: "contrato", titulo: "Contrato", sub: d.f.pagamento?.trim() || undefined, linhas: C });
  for (const a of assinadas(d)) {
    const T = totaisAdenda(a);
    G.push({ chave: `adenda:${a.n}`, tipo: "adenda", titulo: `Adenda ${a.n}`, sub: `${eur(T.total)} € com IVA (${textoIvaPorTaxa(T)})`, linhas: linhasDaAdenda(d, a.n) });
  }
  const nc = d.f.nota_credito?.trim(), desce = nc ? null : notaDeCreditoPorRegistar(S, d);
  if (nc || desce != null) {
    const base = { chave: "nc", tipo: "nota" as const, titulo: "Nota de crédito", valor: desce, comIva: false, momento: "A retificação das medidas baixou o valor", i: 0 };
    G.push({ chave: "nota", tipo: "nota", titulo: "Nota de crédito", linhas: [nc
      ? { ...base, estado: "paga", textoEstado: `${nc} registada`, acao: null, numero: nc }
      : { ...base, estado: "faturar", textoEstado: "por registar", acao: "registar" }] });
  }
  return G;
}

/** Todas as linhas, pela ordem da lista. */
export const linhasPagamentos = (S: Estado, d: Negocio): LinhaPagamento[] => gruposPagamentos(S, d).flatMap((g) => g.linhas);

/** O resumo do passo «Pagamentos»: «2 de 3 pagas» (a nota de crédito conta como feita quando registada). */
export function resumoPagamentos(L: LinhaPagamento[]): { feitas: number; total: number; texto: string } {
  const feitas = L.filter((x) => x.estado === "paga").length;
  return { feitas, total: L.length, texto: `${feitas} de ${L.length} ${L.length === 1 ? "paga" : "pagas"}` };
}
