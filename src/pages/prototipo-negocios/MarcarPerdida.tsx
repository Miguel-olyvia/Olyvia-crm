// "Marcar como perdida" no fim do Resumo, só nas leads em curso. A confirmação aparece no lugar do botão, com o foco em "Cancelar", e pede o motivo
// da perda numa lista (select nativo com rótulo); só se confirma com um motivo escolhido. Esc cancela só a confirmação (o painel fica aberto) e o foco
// volta ao botão; um segundo Esc fecha o painel.
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MOTIVOS_PERDA } from "./perdaDocs";
import { BORDA_CTRL } from "./PessoaLinha";

interface PerderProps {
  nome: string;
  abertos: number;
  confirmar: boolean;
  /** Pessoa de exemplo: o negócio dela não existe no Estado, por isso não há avisos com "Anular". */
  exemplo?: boolean;
  perder: () => void;
  cancelar: () => void;
  /** Recebe o motivo escolhido. */
  confirmarSim: (motivo: string) => void;
}

type ConfirmarProps = Pick<PerderProps, "nome" | "abertos" | "exemplo" | "cancelar" | "confirmarSim">;

/** A confirmação: só existe enquanto se confirma, por isso o motivo nasce sempre vazio. */
function ConfirmarPerda({ nome, abertos, exemplo, cancelar, confirmarSim }: ConfirmarProps) {
  const cancelarRef = useRef<HTMLButtonElement>(null), aoCancelar = useRef(cancelar);
  const [motivo, setMotivo] = useState(""), idMotivo = useId();
  aoCancelar.current = cancelar;
  useEffect(() => {
    cancelarRef.current?.focus();
    // O painel (Radix) escuta o Esc no documento, em captura: este ouvinte na janela corre antes e impede que o painel feche.
    const esc = (e: KeyboardEvent) => { if (e.key !== "Escape") return; e.stopPropagation(); e.preventDefault(); aoCancelar.current(); };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, []);
  const negocios = abertos === 1 ? "o negócio aberto" : `os ${abertos} negócios abertos`;
  return (
    <div role="alertdialog" aria-labelledby="pessoa-perda-texto" className="grid gap-3 border-y border-border py-3 animate-in fade-in-0 motion-reduce:animate-none">
      <p id="pessoa-perda-texto" className="text-[15px]">
        Marcar {nome} como perdida? Perdem-se {negocios}. Sai das leads (fica no chip Perdidas) e no histórico.{abertos > 1 && !exemplo ? " Cada negócio tem o seu aviso com “Anular”." : ""}
      </p>
      <div>
        <label htmlFor={idMotivo} className="block text-[15px] text-muted-foreground">Motivo da perda</label>
        <select id={idMotivo} value={motivo} onChange={(e) => setMotivo(e.target.value)}
          className={cn("h-11 w-full max-w-sm cursor-pointer rounded-md border bg-card px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", BORDA_CTRL)}>
          <option value="">Escolhe o motivo</option>
          {MOTIVOS_PERDA.map((m) => <option key={m.nome} value={m.nome}>{m.nome}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button ref={cancelarRef} type="button" variant="outline" className="min-h-11 cursor-pointer text-[15px]" aria-label={`Cancelar e manter ${nome} nas leads`} onClick={cancelar}>Cancelar</Button>
        <Button type="button" variant="destructive" disabled={!motivo} className="min-h-11 cursor-pointer text-[15px]" aria-label={`Sim, marcar como perdida: ${nome} e perder ${negocios}`} onClick={() => confirmarSim(motivo)}>
          Sim, marcar como perdida
        </Button>
      </div>
    </div>
  );
}

export function MarcarPerdida({ nome, abertos, confirmar, exemplo, perder, cancelar, confirmarSim }: PerderProps) {
  const botao = useRef<HTMLButtonElement>(null), jaConfirmou = useRef(false);
  // Ao fechar a confirmação sem perder, o foco volta ao botão (a confirmação põe o foco em "Cancelar" ao montar).
  useEffect(() => {
    if (!confirmar && jaConfirmou.current) botao.current?.focus();
    jaConfirmou.current = confirmar;
  }, [confirmar]);
  if (!confirmar) return <Button ref={botao} type="button" variant="outline" className="min-h-11 cursor-pointer text-[15px]" onClick={perder}>Marcar como perdida</Button>;
  return <ConfirmarPerda nome={nome} abertos={abertos} exemplo={exemplo} cancelar={cancelar} confirmarSim={confirmarSim} />;
}
