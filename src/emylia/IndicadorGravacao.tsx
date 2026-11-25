// 9/11 (Rúben: «a transcrição não corre enquanto estamos no Estúdio»): enquanto a visita grava, em qualquer página da app (o Estúdio,
// outro negócio) fica em baixo um indicador: a gravar, há quanto tempo, o nível do microfone, e voltar ao negócio. Se o microfone foi
// cortado e não voltou, diz e deixa continuar. Não aparece quando o painel da gravação está à vista.
// 12/11: «Parar» (fica parada, com as falas) e «Continuar»; o «Gravar a visita» do Estúdio está em prototipo-estudio/GravarNoEstudio.tsx.
// 25/11 (Rúben: «isto está bloqueado e não para»): parada, a gravação só acabava no painel do negócio, e o relógio contava os dias desde
// o início (7119:10). Agora, parada, conta só o tempo gravado e tem «Terminar»: abre o negócio, que guarda as falas e apaga a gravação.
// Se o negócio não a fechar (não abre nesta empresa, já não existe), passados uns segundos deixa apagar as falas.
import { useEffect, useState } from "react";
import { Mic, MicOff, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { descartarGravacao, iniciarGravacao, pausarGravacao, pedirTerminarGravacao, useGravacao, useNivelMicrofone, usePainelAberto, useTerminarPedido } from "./gravador";
import { irPara } from "./urlNegocio";

/** Quanto tempo de conversa já está gravado (o fim da última fala), em segundos. */
export const tempoGravado = (falas: { fim: number }[]) => falas.reduce((m, f) => Math.max(m, f.fim || 0), 0);
/** Quanto espera o «Terminar» pelo negócio antes de deixar apagar as falas. */
export const ESPERA_TERMINAR_MS = 8000;

const tempo = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function IndicadorGravacao() {
  const g = useGravacao();
  const painel = usePainelAberto();
  const pedido = useTerminarPedido();
  const [agora, setAgora] = useState(Date.now());
  const [pedidoEm, setPedidoEm] = useState<number | null>(null);
  const [apagar, setApagar] = useState(false);
  const ativo = g.estado === "a_ouvir" || g.estado === "a_ligar" || g.estado === "interrompida" || g.estado === "a_terminar";
  useEffect(() => {
    if (!ativo) return;
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [ativo]);
  // o pedido acabou (a gravação foi guardada ou continuou): esquece a espera
  useEffect(() => { if (pedido === null) { setPedidoEm(null); setApagar(false); } }, [pedido]);
  if (!ativo || g.negocio === null) return null;
  const parada = g.estado === "interrompida";
  const aTerminar = parada && pedido === g.negocio && pedidoEm !== null;
  const naoFechou = aTerminar && agora - pedidoEm >= ESPERA_TERMINAR_MS;
  // com o painel do negócio à vista é ele que mostra a gravação; à espera do «Terminar» que não fechou, o indicador fica
  if (painel && !naoFechou) return null;
  const segundos = parada ? Math.floor(tempoGravado(g.falas)) : g.inicioEm ? Math.max(0, Math.floor((agora - g.inicioEm) / 1000)) : 0;
  const terminar = () => { pedirTerminarGravacao(g.negocio); setPedidoEm(Date.now()); setAgora(Date.now()); irPara(g.voltar); };
  return (
    <div role="status" aria-live="polite" className="fixed bottom-3 left-1/2 z-[60] flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card py-2 pl-4 pr-2 shadow-lg">
      {parada ? <MicOff className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" /> : (
        <span className="relative flex h-3 w-3 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full rounded-full bg-destructive/60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive" />
        </span>
      )}
      <span className="min-w-0 truncate text-sm">
        <b className="font-semibold">{g.noutroSeparador ? "A gravar noutro separador" : naoFechou ? "O negócio não guardou a gravação" : aTerminar ? "A guardar no negócio..." : parada ? "Gravação parada" : g.modo === "visita" ? "A gravar a visita" : "A gravar a chamada"}</b>
        <span className="text-muted-foreground"> · {g.nome} · {tempo(segundos)}{g.falas.length ? ` · ${g.falas.length} ${g.falas.length === 1 ? "fala" : "falas"}` : ""}</span>
      </span>
      {!parada && (
        <span className="hidden h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
          <BarraNivel />
        </span>
      )}
      {/* 20/11: a gravação de outro separador vê-se aqui, sem «Continuar»; depois de recarregar sozinha, o Safari pode pedir um toque */}
      {g.noutroSeparador || (aTerminar && !naoFechou) ? null : naoFechou ? (
        apagar ? (
          <button type="button" className="min-h-9 shrink-0 rounded-full bg-destructive px-3 text-sm font-medium text-destructive-foreground"
            onClick={() => descartarGravacao()}>
            Sim, apagar {g.falas.length === 1 ? "a fala" : `as ${g.falas.length} falas`}
          </button>
        ) : (
          <button type="button" className="min-h-9 shrink-0 rounded-full border border-destructive/40 px-3 text-sm font-medium text-destructive hover:bg-destructive/10"
            onClick={() => setApagar(true)}>
            Apagar a gravação
          </button>
        )
      ) : parada ? (<>
        <button type="button" className="min-h-9 shrink-0 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground"
          onClick={() => void iniciarGravacao({ negocio: g.negocio!, nome: g.nome, modo: g.modo, voltar: g.voltar }, true).catch(() => undefined)}>
          <Mic className="mr-1 inline h-4 w-4" aria-hidden="true" />{g.pedeToque ? "Toque para continuar a gravar" : "Continuar"}
        </button>
        <button type="button" className="min-h-9 shrink-0 rounded-full border border-input px-3 text-sm font-medium hover:bg-accent" onClick={terminar}>
          <Square className="mr-1 inline h-3.5 w-3.5 fill-current" aria-hidden="true" />Terminar
        </button>
      </>) : g.estado === "a_ouvir" || g.estado === "a_ligar" ? (
        // 12/11 (Rúben: «ter aqui o botão para iniciar gravação e o botão para parar»): parar sem terminar (o Continuar retoma)
        <button type="button" className="min-h-9 shrink-0 rounded-full border border-destructive/40 px-3 text-sm font-medium text-destructive hover:bg-destructive/10"
          onClick={() => void pausarGravacao()}>
          <Square className="mr-1 inline h-3.5 w-3.5 fill-current" aria-hidden="true" />Parar
        </button>
      ) : null}
      {(!parada || naoFechou) && (
        <button type="button" className="min-h-9 shrink-0 rounded-full border border-input px-3 text-sm font-medium hover:bg-accent" onClick={() => irPara(g.voltar)}>
          Ao negócio
        </button>
      )}
    </div>
  );
}

/** 19/11: só a barrinha ouve o nível do micro (5× por segundo), não o indicador inteiro. */
function BarraNivel() {
  const nivel = useNivelMicrofone();
  return <span className={cn("block h-full rounded-full", nivel > 0.08 ? "bg-success" : "bg-muted-foreground/40")} style={{ width: `${Math.round(nivel * 100)}%` }} />;
}
