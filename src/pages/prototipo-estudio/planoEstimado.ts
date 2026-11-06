// 6/11 (Rúben: «no fim do Estúdio, gera o plano de obra com calendário»). Na visita, o plano é uma estimativa: as etapas pela ordem
// em que se fazem, os dias de cada uma (pelo que o Estúdio decidiu: os m² de revestimento, as peças a instalar…) e as datas a partir
// de um dia de início, só em dias úteis. As datas reais da equipa nascem quando a Obra abre (depois do recibo).
import { necessidades, type Projeto } from "./necessidadesEstudio";

export interface Etapa { n: string; dias: number; oQue: string[]; inicio?: Date; fim?: Date }

/** Os rendimentos de uma equipa de duas pessoas (estimativa). */
const M2_REVESTIMENTO_DIA = 10, M2_PAVIMENTO_DIA = 12;

export function etapasDaObra(p: Projeto): Etapa[] {
  const ls = necessidades(p).filter((l) => !l.fora && l.q > 0);
  const tem = (rx: RegExp) => ls.filter((l) => rx.test(l.id));
  const q = (rx: RegExp) => tem(rx).reduce((s, l) => s + l.q, 0);
  const nomes = (rx: RegExp) => tem(rx).map((l) => l.n);
  const out: Etapa[] = [];
  const etapa = (n: string, dias: number, oQue: string[]) => { if (oQue.length && dias > 0) out.push({ n, dias, oQue }); };

  etapa("Proteções e retirar", tem(/^(dem|ret-)/).length ? (q(/^dem$/) > 15 ? 2 : 1) : tem(/^prot$/).length ? 1 : 0, nomes(/^(prot|ret-|dem)$|^ret-/));
  const agua = tem(/^(agua-|canal$)/).length, luz = tem(/^ele-|^serv-sv-(eletrica|tomada|aplique|ventilador)$/).length;
  etapa("Canalização e eletricidade", agua && tem(/^serv-sv-eletrica$/).length ? 2 : agua || luz ? 1 : 0, nomes(/^(agua-|canal$|ele-|serv-sv-(eletrica|tomada|aplique|ventilador)$)/));
  etapa("Paredes prontas", q(/^serv-sv-reboco$/) > 15 ? 2 : 1, nomes(/^serv-sv-(reboco|imperm|nicho)$/));
  etapa("Teto falso", 1, nomes(/^teto$/));
  etapa("Revestimento", Math.max(1, Math.ceil(q(/^rev-inst$/) / M2_REVESTIMENTO_DIA)), nomes(/^rev-inst$/));
  etapa("Pavimento", Math.max(1, Math.ceil(q(/^pav-inst$/) / M2_PAVIMENTO_DIA)), nomes(/^pav-inst$/));
  const pecas = tem(/^inst-/).length;
  etapa("Instalar as peças", pecas > 4 ? 2 : 1, nomes(/^inst-/));
  etapa("Pintura e acabamentos", 1, nomes(/^serv-sv-(pintura-teto|estores|rodape)$/));
  // a limpeza vai no último dia
  const limpeza = nomes(/^serv-sv-limpeza$/);
  if (limpeza.length) { if (out.length) out[out.length - 1].oQue.push(...limpeza); else etapa("Limpeza final", 1, limpeza); }
  return out;
}

const util = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;
const somarUteis = (d: Date, n: number) => { const x = new Date(d); let k = n; while (k > 0) { x.setDate(x.getDate() + 1); if (util(x)) k--; } return x; };
/** O primeiro dia útil a partir de `d` (o próprio, se for útil). */
export const primeiroUtil = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); while (!util(x)) x.setDate(x.getDate() + 1); return x; };

/** As etapas com as datas, a partir do dia de início (só dias úteis, uma etapa a seguir à outra). */
export function calendario(etapas: readonly Etapa[], inicio: Date): { etapas: Etapa[]; dias: number; fim: Date | null } {
  let dia = primeiroUtil(inicio);
  const out = etapas.map((e) => {
    const ini = dia, fim = somarUteis(ini, e.dias - 1);
    dia = somarUteis(fim, 1);
    return { ...e, inicio: ini, fim };
  });
  return { etapas: out, dias: etapas.reduce((s, e) => s + e.dias, 0), fim: out.length ? out[out.length - 1].fim! : null };
}

/** «2 semanas e 1 dia», «4 dias»: a duração para dizer ao cliente (5 dias úteis por semana). */
export function duracaoEmPalavras(dias: number): string {
  if (dias <= 0) return "";
  const s = Math.floor(dias / 5), r = dias % 5;
  const sem = s ? `${s} ${s === 1 ? "semana" : "semanas"}` : "", d = r ? `${r} ${r === 1 ? "dia" : "dias"}` : "";
  return [sem, d].filter(Boolean).join(" e ") + ` (${dias} ${dias === 1 ? "dia útil" : "dias úteis"})`;
}
