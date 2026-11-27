/**
 * A linha de vida de um ativo, desenhada. Comprado: o valor desce em linha reta da compra até ao fim da vida (ou até à desativação), com
 * o ponto de hoje; o que falta vai a tracejado. Alugado: uma barra do início ao fim do contrato (sem fim, uma seta), cheia até hoje,
 * com o que já se pagou. Só desenha o que a ficha já diz em texto (valor atual, amortização, datas e pago até hoje), por isso o conjunto
 * é decorativo (`aria-hidden`): o leitor de ecrã lê as secções. Sem vida em meses (por uso) não há linha.
 */
import type { CSSProperties } from "react";
import { dataPt, euros } from "@/components/rh-exemplo/custo/formato";
import { indiceDoMes, mesDaData } from "@/components/rh-exemplo/lib/custo";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { ResumoAmortizacao } from "./lib/amortizacaoAtivo";
import { posicaoNoContrato } from "./lib/ativosUi";
import { mesPt } from "./lib/resumoAtivo";
import type { Ativo } from "./lib/tipos";

const W = 700;
const X0 = 16;
const X1 = W - 16;
const PING = "motion-safe:animate-ping [transform-box:fill-box] [transform-origin:center]";

/** Uma etiqueta debaixo da linha: o que é, a data e (se houver) o valor. */
function Marca({ titulo, data, valor, className, style }: { titulo: string; data?: string; valor?: string; className?: string; style?: CSSProperties }) {
  return (
    <div className={cn("min-w-0 text-xs", className)} style={style}>
      <p className="text-muted-foreground">{titulo}</p>
      {data && <p className="font-semibold tabular-nums">{data}</p>}
      {valor && <p className="font-semibold tabular-nums text-primary dark:text-violet-300">{valor}</p>}
    </div>
  );
}

/** A posição do «hoje» no meio, entre 18 % e 82 % para não tapar as pontas. */
const posicaoDoMeio = (k: number): CSSProperties => ({ left: `${Math.min(82, Math.max(18, k * 100))}%` });

function LinhaComprado({ a, resumo, desativado }: { a: Ativo; resumo: ResumoAmortizacao; desativado: boolean }) {
  const { t } = useTranslation();
  const H = 150;
  const yT = 18;
  const yB = H - 18;
  const k = resumo.mesesTotais > 0 ? Math.min(1, resumo.mesesDecorridos / resumo.mesesTotais) : 1;
  const queda = Math.min(1, Math.max(0, resumo.percentagem / 100));
  const xh = X0 + (X1 - X0) * k;
  const yh = yT + (yB - yT) * queda;
  const acabou = k >= 1;
  const tituloFim = desativado ? t("ativos.ui.linha.parou") : acabou ? t("ativos.ui.linha.vidaConcluida") : t("ativos.ui.linha.fimPrevisto");
  return (
    <div aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="presentation" focusable="false">
        <line x1={X0} y1={yB} x2={X1} y2={yB} className="stroke-border" strokeWidth={1.5} />
        <path d={`M${X0} ${yT} L${xh} ${yh} L${xh} ${yB} L${X0} ${yB} Z`} className="fill-primary" fillOpacity={0.12} />
        <line x1={X0} y1={yT} x2={xh} y2={yh} className="stroke-primary" strokeWidth={4} strokeLinecap="round" />
        {!acabou && <line x1={xh} y1={yh} x2={X1} y2={yB} className="stroke-primary" strokeOpacity={0.4} strokeWidth={3} strokeDasharray="7 7" strokeLinecap="round" />}
        <circle cx={X0} cy={yT} r={6} className="fill-card stroke-primary" strokeWidth={3} />
        {!acabou && <circle cx={X1} cy={yB} r={6} className="fill-card stroke-primary" strokeOpacity={0.5} strokeWidth={3} />}
        {!desativado && <circle cx={xh} cy={yh} r={9} className={cn("fill-primary", PING)} fillOpacity={0.5} />}
        <circle cx={xh} cy={yh} r={8} className={desativado ? "fill-muted-foreground stroke-card" : "fill-primary stroke-card"} strokeWidth={3} />
      </svg>
      <div className="relative mt-3 flex items-start justify-between gap-3">
        <Marca titulo={t("ativos.ui.linha.compra")} data={a.dataCompra ? dataPt(a.dataCompra) : undefined} valor={euros(resumo.valorCompra, "—")} />
        {!acabou && (
          <Marca
            titulo={t("ativos.ui.linha.hoje")} valor={euros(resumo.valorAtual, "—")}
            className="text-center sm:absolute sm:-translate-x-1/2" style={posicaoDoMeio(k)}
          />
        )}
        <Marca titulo={tituloFim} data={mesPt(resumo.fim)} valor={euros(acabou ? resumo.valorAtual : resumo.valorResidual, "—")} className="text-right" />
      </div>
    </div>
  );
}

function LinhaAlugado({ a, mes, pago }: { a: Ativo; mes: string; pago: number | null }) {
  const { t } = useTranslation();
  if (!a.inicioAluguer) return null;
  const H = 70;
  const y = 28;
  const desativado = a.estado === "desativado" && a.desativadoEm !== null;
  const inicio = mesDaData(a.inicioAluguer);
  // Sem fim, a barra mostra os meses até hoje e mais um ano à frente, com uma seta: o contrato continua.
  const fimDaBarra = a.fimAluguer ?? null;
  let k: number;
  if (desativado && a.desativadoEm) {
    k = fimDaBarra ? posicaoNoContrato(a.inicioAluguer, fimDaBarra, mesDaData(a.desativadoEm)) / 100 : 1;
  } else if (fimDaBarra) {
    k = posicaoNoContrato(a.inicioAluguer, fimDaBarra, mes) / 100;
  } else {
    const decorridos = Math.max(0, indiceDoMes(mes) - indiceDoMes(inicio) + 1);
    k = decorridos / Math.max(24, decorridos + 12);
  }
  const xh = X0 + (X1 - X0) * Math.min(1, Math.max(0, k));
  return (
    <div aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="presentation" focusable="false">
        <rect x={X0} y={y - 7} width={X1 - X0} height={14} rx={7} className="fill-muted" />
        <rect x={X0} y={y - 7} width={Math.max(14, xh - X0)} height={14} rx={7} className={desativado ? "fill-muted-foreground" : "fill-primary"} />
        {!fimDaBarra && !desativado && <path d={`M${X1 - 12} ${y - 12} L${X1 + 4} ${y} L${X1 - 12} ${y + 12}`} fill="none" className="stroke-muted-foreground" strokeWidth={2.5} strokeLinecap="round" />}
        {!desativado && <circle cx={xh} cy={y} r={10} className={cn("fill-primary", PING)} fillOpacity={0.5} />}
        <circle cx={xh} cy={y} r={9} className={desativado ? "fill-muted-foreground stroke-card" : "fill-primary stroke-card"} strokeWidth={3} />
      </svg>
      <div className="relative mt-2 flex items-start justify-between gap-3">
        <Marca titulo={t("ativos.ui.linha.inicio")} data={dataPt(a.inicioAluguer)} />
        {pago !== null && (
          <Marca
            titulo={t(desativado ? "ativos.ui.linha.parou" : "ativos.ui.linha.hoje")} valor={t("ativos.ui.linha.pago", { valor: euros(pago, "—") })}
            className="text-center sm:absolute sm:-translate-x-1/2" style={posicaoDoMeio(k)}
          />
        )}
        <Marca
          titulo={t(fimDaBarra ? "ativos.ui.linha.fimContrato" : "ativos.ui.linha.semFim")}
          data={fimDaBarra ? dataPt(fimDaBarra) : t("ativos.ui.linha.renova")} className="text-right"
        />
      </div>
    </div>
  );
}

interface Props {
  a: Ativo;
  mes: string;
  /** O resumo da amortização (comprado com vida em meses); `null` nos outros. */
  resumo: ResumoAmortizacao | null;
  /** O que já se pagou de renda até hoje (alugado), de `repartoDoAtivo`. */
  pago: number | null;
}

export function LinhaDeVida({ a, mes, resumo, pago }: Props) {
  if (a.forma === "alugado") return <LinhaAlugado a={a} mes={mes} pago={pago} />;
  if (!resumo) return null;
  return <LinhaComprado a={a} resumo={resumo} desativado={a.estado === "desativado"} />;
}
