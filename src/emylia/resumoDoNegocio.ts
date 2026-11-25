// 25/11 (Rúben: «a versão desktop das screens de todo o fluxo, permite ter muito mais informação e não apenas 3 colunas»).
// O que o painel «Resumo do negócio» mostra ao lado do passo, num ecrã largo: o que vem a seguir, os valores, os documentos,
// as seis fases com o que falta e o histórico. Só leitura e sem React: o componente é ResumoNegocio.tsx.
import { FASES, type Evento, type Negocio } from "./motor";

/** Como se dispõe a página do negócio, pela largura que tem (não pela do ecrã: o menu lateral da app come 200 a 300 px).
 *  - "normal": como sempre (telemóvel numa coluna; no computador, os passos à esquerda e o passo ao meio).
 *  - "amplo": os passos, o passo e, à direita, o resumo do negócio; o contentor alarga até 1680 px. */
export type Disposicao = "normal" | "amplo";
export const LARGURA_AMPLO = 1360;
export function disposicaoNegocio(largura: number): Disposicao {
  return largura >= LARGURA_AMPLO ? "amplo" : "normal";
}

/** Uma data para ler: ISO (2026-11-24T09:08) passa a 24/11; o resto (já «24/11 09:08») fica como está, sem a hora. */
export function dataCurtaResumo(s?: string | null): string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}`;
  return s.replace(/\s+\d{1,2}:\d{2}.*$/, "");
}

export type EstadoDoc = "ok" | "espera" | "falta";
export interface LinhaDoc { id: string; l: string; v: string; estado: EstadoDoc }

/** Os documentos do negócio, pela ordem do fluxo: proposta, contrato, fatura, pagamento, plano da obra e auto de receção.
 *  Só os que já fazem sentido na fase (o contrato só com orçamento, a fatura só no Financeiro, o auto só na Obra). */
export function documentosDoNegocio(d: Negocio): LinhaDoc[] {
  const o = d.orc, out: LinhaDoc[] = [];
  if (!o) return out;
  const versao = (o.versoes?.length ?? 0) + 1;
  const nome = versao > 1 ? `Proposta (versão ${versao})` : "Proposta";
  out.push(o.aceite ? { id: "proposta", l: nome, v: `aceite a ${dataCurtaResumo(o.aceite)}`, estado: "ok" }
    : o.enviada ? { id: "proposta", l: nome, v: `enviada a ${dataCurtaResumo(o.enviada)}, à espera do cliente`, estado: "espera" }
    : { id: "proposta", l: nome, v: o.verif ? "verificada, por enviar" : "por verificar", estado: "falta" });
  if (!o.vendaDireta && (o.aceite || o.contrato)) {
    out.push(o.contrato === "assinado" ? { id: "contrato", l: "Contrato", v: "assinado", estado: "ok" }
      : o.contrato === "enviado" ? { id: "contrato", l: "Contrato", v: o.contratoPedido ? "o cliente pediu alterações" : "à espera da assinatura", estado: "espera" }
      : { id: "contrato", l: "Contrato", v: "por gerar", estado: "falta" });
  }
  if (d.fase >= 4) {
    out.push(d.fin.fatura ? { id: "fatura", l: "Fatura", v: `${d.fin.fatura.n} · ${dataCurtaResumo(d.fin.fatura.q)}`, estado: "ok" }
      : { id: "fatura", l: "Fatura", v: "por registar", estado: "falta" });
    out.push(d.fin.pago ? { id: "pagamento", l: "Pagamento", v: d.fin.recibo ? `validado · recibo ${d.fin.recibo.n}` : "validado", estado: "ok" }
      : { id: "pagamento", l: "Pagamento", v: "por receber", estado: "espera" });
    const pl = d.obra.plano;
    out.push(!pl ? { id: "plano", l: "Plano da obra", v: "por fazer", estado: "falta" }
      : pl.estado === "por aprovar" ? { id: "plano", l: "Plano da obra", v: "por aprovar", estado: "espera" }
      : { id: "plano", l: "Plano da obra", v: pl.estado, estado: "ok" });
  }
  if (d.fase >= 5 && d.obra.auto) {
    out.push(d.obra.auto.estado === "assinado" ? { id: "auto", l: "Auto de receção", v: "assinado", estado: "ok" }
      : { id: "auto", l: "Auto de receção", v: "por assinar", estado: "espera" });
  }
  return out;
}

export interface LinhaFase { i: number; nome: string; estado: "feita" | "agora" | "depois"; v: string }

/** O dia em que o negócio entrou numa fase (a última entrada «Passou a …» do histórico; o histórico tem o mais recente primeiro). */
export function entrouNaFase(hist: readonly Evento[], i: number): string {
  const nome = FASES[i];
  const re = new RegExp(`Passou (?:a|à|ao) ${nome}(?![\\p{L}])`, "u");
  const e = hist.find((h) => re.test(h.t));
  return e ? dataCurtaResumo(e.q) : "";
}

/** As seis fases, com o estado e uma frase curta: a feita diz quando acabou (quando entrou na seguinte), a de agora quantos passos
 *  estão feitos e quantas respostas faltam, as de depois ficam por fazer. */
export function fasesDoNegocio(d: Negocio, passos?: { feito: boolean; falta: number }[]): LinhaFase[] {
  return FASES.map((nome, i) => {
    if (i < d.fase) {
      const q = entrouNaFase(d.hist, i + 1);
      return { i, nome, estado: "feita" as const, v: q ? `feita · ${q}` : "feita" };
    }
    if (i === d.fase) {
      if (!passos?.length) return { i, nome, estado: "agora" as const, v: d.perdido ? "perdido" : "agora" };
      const f = passos.filter((p) => p.feito).length, falta = passos.reduce((a, p) => a + (p.falta || 0), 0);
      return { i, nome, estado: "agora" as const, v: `${f} de ${passos.length} passos${falta ? ` · falta${falta > 1 ? "m" : ""} ${falta}` : ""}` };
    }
    return { i, nome, estado: "depois" as const, v: "" };
  });
}
