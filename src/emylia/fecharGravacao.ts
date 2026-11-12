// 12/11 (Rúben: «isto tem de sair depois da visita estar fechada»): a gravação de um negócio que já passou da fase dela (a visita fechada, a
// chamada com o contacto feito) acaba sozinha: se ainda ouvia, para e espera pelas últimas transcrições; a transcrição fica no negócio
// (transcricao_visita ou transcricao_chamada, se for mais longa do que a que lá está) e a gravação apaga-se. O indicador de baixo sai.
import { useEffect, useRef } from "react";
import { descartarGravacao, gravacaoAtual, terminarGravacao, useGravacao } from "./gravador";
import { textoDaTranscricao } from "./ChamadaDireto";
import type { Negocio } from "./motor";
import type { Ctx } from "./pecas";

/** A fase em que a gravação já não faz sentido: a visita é a fase 2, a chamada é até ao Contacto (fase 1). */
export const gravacaoPassou = (modo: "chamada" | "visita", fase: number) => (modo === "visita" ? fase > 2 : fase > 1);

export function useFecharGravacao(ctx: Ctx, d: Negocio) {
  const g = useGravacao();
  const aFechar = useRef(false);
  const ref = useRef({ ctx, d });
  ref.current = { ctx, d };
  useEffect(() => {
    if (aFechar.current || g.negocio !== d.id || g.estado === "a_terminar" || !gravacaoPassou(g.modo, d.fase)) return;
    aFechar.current = true;
    void (async () => {
      try {
        const falas = g.estado === "a_ouvir" || g.estado === "a_ligar" || g.estado === "a_terminar" ? await terminarGravacao() : gravacaoAtual().falas;
        const { ctx: c, d: n } = ref.current;
        const k = g.modo === "visita" ? "transcricao_visita" : "transcricao_chamada";
        const texto = textoDaTranscricao(falas);
        if (falas.length && texto.length > (n.f[k] ?? "").length) c.run(() => c.A.campo(n.id, k, texto));
        descartarGravacao();
      } finally { aFechar.current = false; }
    })();
  }, [g.negocio, g.estado, g.modo, d.id, d.fase]);
}
