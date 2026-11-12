// 9/11 (Rúben: «a transcrição não corre enquanto estamos no Estúdio»): enquanto a visita grava, em qualquer página da app (o Estúdio,
// outro negócio) fica em baixo um indicador: a gravar, há quanto tempo, o nível do microfone, e voltar ao negócio. Se o microfone foi
// cortado e não voltou, diz e deixa continuar. Não aparece quando o painel da gravação está à vista.
// 12/11: «Parar» (fica parada, com as falas) e «Continuar»; o «Gravar a visita» do Estúdio está em prototipo-estudio/GravarNoEstudio.tsx.
import { useEffect, useState } from "react";
import { Mic, MicOff, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { iniciarGravacao, pausarGravacao, useGravacao, usePainelAberto } from "./gravador";
import { irPara } from "./urlNegocio";

const tempo = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function IndicadorGravacao() {
  const g = useGravacao();
  const painel = usePainelAberto();
  const [agora, setAgora] = useState(Date.now());
  const ativo = g.estado === "a_ouvir" || g.estado === "a_ligar" || g.estado === "interrompida" || g.estado === "a_terminar";
  useEffect(() => {
    if (!ativo) return;
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [ativo]);
  if (!ativo || painel || g.negocio === null) return null;
  const parada = g.estado === "interrompida";
  const segundos = g.inicioEm ? Math.max(0, Math.floor((agora - g.inicioEm) / 1000)) : 0;
  return (
    <div role="status" aria-live="polite" className="fixed bottom-3 left-1/2 z-[60] flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card py-2 pl-4 pr-2 shadow-lg">
      {parada ? <MicOff className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" /> : (
        <span className="relative flex h-3 w-3 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full rounded-full bg-destructive/60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive" />
        </span>
      )}
      <span className="min-w-0 truncate text-sm">
        <b className="font-semibold">{parada ? "Gravação parada" : g.modo === "visita" ? "A gravar a visita" : "A gravar a chamada"}</b>
        <span className="text-muted-foreground"> · {g.nome} · {tempo(segundos)}{g.falas.length ? ` · ${g.falas.length} ${g.falas.length === 1 ? "fala" : "falas"}` : ""}</span>
      </span>
      {!parada && (
        <span className="hidden h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
          <span className={cn("block h-full rounded-full", g.nivel > 0.08 ? "bg-success" : "bg-muted-foreground/40")} style={{ width: `${Math.round(g.nivel * 100)}%` }} />
        </span>
      )}
      {parada ? (
        <button type="button" className="min-h-9 shrink-0 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground"
          onClick={() => void iniciarGravacao({ negocio: g.negocio!, nome: g.nome, modo: g.modo, voltar: g.voltar }, true).catch(() => undefined)}>
          <Mic className="mr-1 inline h-4 w-4" aria-hidden="true" />Continuar
        </button>
      ) : g.estado === "a_ouvir" || g.estado === "a_ligar" ? (
        // 12/11 (Rúben: «ter aqui o botão para iniciar gravação e o botão para parar»): parar sem terminar (o Continuar retoma)
        <button type="button" className="min-h-9 shrink-0 rounded-full border border-destructive/40 px-3 text-sm font-medium text-destructive hover:bg-destructive/10"
          onClick={() => void pausarGravacao()}>
          <Square className="mr-1 inline h-3.5 w-3.5 fill-current" aria-hidden="true" />Parar
        </button>
      ) : null}
      <button type="button" className="min-h-9 shrink-0 rounded-full border border-input px-3 text-sm font-medium hover:bg-accent" onClick={() => irPara(g.voltar)}>
        Ao negócio
      </button>
    </div>
  );
}
