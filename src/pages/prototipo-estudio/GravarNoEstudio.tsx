// 12/11 (Rúben: «ter aqui o botão para iniciar gravação e o botão para parar»). No Estúdio de um negócio, quando não há gravação a correr,
// fica em baixo, no sítio do indicador da gravação, o botão «Gravar a visita». A gravar, o indicador (emylia/IndicadorGravacao.tsx) toma o
// lugar dele, com «Parar» e «Continuar». Uma gravação terminada ainda por guardar no negócio não se apaga: manda-se guardá-la primeiro.
import { useState } from "react";
import { Mic } from "lucide-react";
import { iniciarGravacao, useGravacao } from "@/emylia/gravador";
import { irPara } from "@/emylia/urlNegocio";
import type { Projeto } from "./necessidadesEstudio";

const PILULA = "fixed bottom-3 left-1/2 z-[60] flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card py-2 pl-4 pr-2 shadow-lg";

export function GravarNoEstudio({ p }: { p: Projeto }) {
  const g = useGravacao();
  const [erro, setErro] = useState("");
  if (p.negocio === undefined) return null;
  if (g.estado === "a_ouvir" || g.estado === "a_ligar" || g.estado === "interrompida" || g.estado === "a_terminar") return null;
  if (g.estado === "terminada" && g.negocio !== null) {
    return (
      <div role="status" className={PILULA}>
        <span className="min-w-0 truncate text-sm"><b className="font-semibold">Gravação terminada</b><span className="text-muted-foreground"> · {g.nome} · por guardar no negócio</span></span>
        <button type="button" className="min-h-9 shrink-0 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground" onClick={() => irPara(g.voltar)}>Guardar no negócio</button>
      </div>
    );
  }
  const gravar = () => {
    setErro("");
    void iniciarGravacao({ negocio: p.negocio!, nome: p.nome ?? "", modo: "visita", voltar: p.origem ?? "/negocios" })
      .catch((e: Error) => setErro(e.message));
  };
  return (
    <div className={PILULA}>
      <span className="min-w-0 truncate text-sm">{erro ? <span className="text-destructive">{erro}</span> : <span className="text-muted-foreground">O que se disser muda o Estúdio sozinho.</span>}</span>
      <button type="button" className="min-h-9 shrink-0 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground" onClick={gravar}>
        <Mic className="mr-1 inline h-4 w-4" aria-hidden="true" />Gravar a visita
      </button>
    </div>
  );
}
