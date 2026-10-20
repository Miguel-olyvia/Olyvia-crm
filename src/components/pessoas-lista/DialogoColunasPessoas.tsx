import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, RotateCcw, Settings2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import type { IdColuna } from "@/components/pessoas/vistaLinhaPessoa";
import type { EscolhaColuna } from "./colunasPessoas";

const R = "pessoasPagina.real.";
// Nos extremos o botão fica aria-disabled (e não `disabled`): continua focável, e o clique é ignorado pela guarda.
const BOTAO_ICONE = cn("h-11 min-h-11 w-11 min-w-11", FOCO, PISTA_DESATIVADO);
const ID_FIXA = "col-fixed-person";

interface DialogoColunasProps {
  escolha: readonly EscolhaColuna[];
  aoAlternar: (id: IdColuna) => void;
  aoMover: (id: IdColuna, delta: number) => void;
  /** O arrastar: põe a coluna no índice da outra. */
  aoMoverPara: (id: IdColuna, indice: number) => void;
  aoRepor: () => void;
}

/**
 * «Colunas»: uma caixa por coluna e a ordem. Ordena-se arrastando a pega (só com rato) ou com Subir e Descer (teclado e leitores de
 * ecrã), e uma região live diz a posição nova. As alterações aplicam-se e guardam-se logo. «Pessoa» é fixa. Não reutiliza o das
 * Leads: esse está preso a campanhas e só arrasta com rato.
 */
export function DialogoColunasPessoas({ escolha, aoAlternar, aoMover, aoMoverPara, aoRepor }: DialogoColunasProps) {
  const { t } = useTranslation();
  const [arrastada, setArrastada] = useState<IdColuna | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const nomeDe = (id: IdColuna): string => t(`${R}columns.${id}`);

  const mover = (id: IdColuna, delta: number): void => {
    const i = escolha.findIndex((c) => c.id === id);
    const novo = Math.min(Math.max(i + delta, 1), escolha.length - 1);
    // Nos extremos não há para onde ir: não se move nem se anuncia (o botão é só aria-disabled, o clique chega aqui).
    if (i < 1 || novo === i) return;
    aoMover(id, delta);
    setAnuncio(t(`${R}cols.moved`, { name: nomeDe(id), n: novo + 1, total: escolha.length }));
  };
  const largarSobre = (id: IdColuna, indice: number): void => {
    if (arrastada === null || arrastada === id || id === "person") return;
    aoMoverPara(arrastada, indice);
  };

  const repor = (): void => {
    aoRepor();
    setAnuncio(t(`${R}cols.resetDone`));
  };

  return (
    <Dialog onOpenChange={(aberto) => { if (!aberto) setAnuncio(""); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)}>
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          {t(`${R}cols.button`)}
        </Button>
      </DialogTrigger>
      {/* hideClose: o X do componente base diz «Close» em inglês e repete o «Fechar» traduzido do rodapé (44 px). */}
      <DialogContent className="max-w-md" hideClose>
        <DialogHeader>
          <DialogTitle>{t(`${R}cols.title`)}</DialogTitle>
          <DialogDescription>{t(`${R}cols.help`)}</DialogDescription>
        </DialogHeader>
        <ul aria-label={t(`${R}cols.listLabel`)} className="max-h-[50vh] space-y-1 overflow-y-auto">
          {escolha.map((coluna, i) => {
            const fixa = coluna.id === "person";
            const nome = nomeDe(coluna.id);
            return (
              <li
                key={coluna.id} onDragOver={(e) => { e.preventDefault(); largarSobre(coluna.id, i); }}
                className={cn("flex items-center gap-2 rounded-md border bg-background px-2", arrastada === coluna.id && "border-primary bg-primary/5")}
              >
                {fixa ? (
                  <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <span
                    draggable aria-hidden="true" title={t(`${R}cols.drag`, { name: nome })} className="shrink-0 cursor-move"
                    onDragStart={() => setArrastada(coluna.id)} onDragEnd={() => setArrastada(null)}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </span>
                )}
                <Label htmlFor={`col-${coluna.id}`} className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 text-sm">
                  <Checkbox
                    id={`col-${coluna.id}`} checked={coluna.visivel} disabled={fixa} aria-describedby={fixa ? ID_FIXA : undefined}
                    onCheckedChange={() => aoAlternar(coluna.id)}
                  />
                  {nome}
                </Label>
                {fixa ? (
                  <span id={ID_FIXA} className="text-xs text-muted-foreground">{t(`${R}cols.fixed`)}</span>
                ) : (
                  <>
                    <Button
                      type="button" variant="ghost" size="icon" className={BOTAO_ICONE} aria-disabled={i <= 1 || undefined}
                      aria-label={t(`${R}cols.up`, { name: nome })} onClick={() => mover(coluna.id, -1)}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button" variant="ghost" size="icon" className={BOTAO_ICONE} aria-disabled={i === escolha.length - 1 || undefined}
                      aria-label={t(`${R}cols.down`, { name: nome })} onClick={() => mover(coluna.id, 1)}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{anuncio}</div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" className={cn("min-h-11 gap-2", FOCO)} onClick={repor}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t(`${R}cols.reset`)}
          </Button>
          <DialogClose asChild>
            <Button type="button" className={cn("min-h-11", FOCO)}>{t(`${R}cols.close`)}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
