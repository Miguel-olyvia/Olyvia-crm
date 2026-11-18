// 18/11: o estado de leitura do Catálogo: «a ler» (indicador acessível; aos 10 s avisa e oferece «Tentar de novo») e «erro» (a mensagem e «Tentar de novo»).
// Só apresentação: os tempos (10 s e 30 s) e a nova leitura são de quem a chama (CatalogoCustos).
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const AVISO_LENTO_MS = 10_000;
export const LIMITE_LEITURA_MS = 30_000;
export const ERRO_DEMOROU = "A leitura do Catálogo demorou demasiado.";

function TentarDeNovo({ onRepetir }: { onRepetir: () => void }) {
  return <Button type="button" variant="outline" className="min-h-11 min-w-11" onClick={onRepetir}>Tentar de novo</Button>;
}

/** `foco`: o número da tentativa. Depois de «Tentar de novo» (foco > 0) o foco vai para o indicador, para o teclado e o leitor de ecrã não ficarem sem contexto
 *  quando o botão desaparece. Na primeira leitura (foco 0) não se rouba o foco. */
export function LeituraCatalogo({ lento, onRepetir, foco = 0 }: { lento: boolean; onRepetir: () => void; foco?: number }) {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => { if (foco > 0) raiz.current?.focus(); }, [foco]);
  return (
    <div ref={raiz} tabIndex={-1} data-testid="leitura-catalogo" role="status" aria-busy="true" className="flex flex-col items-start gap-3 p-6 text-[15px] text-muted-foreground outline-none">
      <p className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />A ler o Catálogo…</p>
      {lento && (
        <>
          <p>Está a demorar mais do que o normal.</p>
          <TentarDeNovo onRepetir={onRepetir} />
        </>
      )}
    </div>
  );
}

export function ErroLeituraCatalogo({ erro, onRepetir }: { erro: string; onRepetir: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 p-6 text-[15px]">
      <p className="text-destructive">{erro}</p>
      <TentarDeNovo onRepetir={onRepetir} />
    </div>
  );
}
