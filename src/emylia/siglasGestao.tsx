// 16/11: as peças da sigla (SKU) nos ecrãs de gestão do Catálogo: o texto «Sigla: BC» na linha e o formulário de editar, com o mesmo padrão de
// «Renomear» (foco no campo, Enter grava, Esc cancela, aria-disabled com a razão ligada, erro no sítio). A base decide (skuDados.ts).
import { useId, useState, type KeyboardEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CAMPO, NOTA, Campo } from "./pecasForm";
import { ENTRA, protegido } from "./gestaoPecas";
import { SIGLA_MAX, normalizarSigla, validarSigla } from "./skuDados";

/** A sigla na linha: «Sigla: BC», ou «Sem sigla» (a base preenche-as; uma por preencher não impede o resto). */
export function SiglaTexto({ sigla }: { sigla: string | null }) {
  return <span className={cn("rounded-md bg-muted px-2 py-0.5 text-sm tabular-nums", sigla ? "text-foreground/75" : "text-muted-foreground")}>{sigla ? `Sigla: ${sigla}` : "Sem sigla"}</span>;
}

/** O formulário de uma sigla. `exigeLetra`: categorias e subcategorias (uma opção pode ser só números). */
export function FormSigla({ rotulo, inicial, exigeLetra, aGravar, erro, idGuardar, onEnviar, onCancelar }: {
  rotulo: string; inicial: string | null; exigeLetra: boolean; aGravar: boolean; erro: string | null; idGuardar: string;
  onEnviar: (sigla: string) => void; onCancelar: () => void;
}) {
  const [sigla, setSigla] = useState(inicial ?? "");
  const razaoId = useId();
  const invalida = validarSigla(sigla, exigeLetra);
  const mudou = sigla !== (inicial ?? "");
  const porque = aGravar ? "A guardar…" : invalida ?? (!mudou ? "Altere a sigla para guardar." : null);
  const enviar = () => { if (!porque) onEnviar(sigla); };
  const tecla = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } else if (e.key === "Escape" && !aGravar) { e.stopPropagation(); onCancelar(); } };
  // a razão só se vê quando há algo escrito que está errado; vazia ao abrir e «sem alteração» ficam só para quem ouve
  const visivel = !!porque && !aGravar && sigla !== "" && mudou;
  return (
    <div className={cn("grid gap-3 rounded-xl border border-border bg-card p-3", ENTRA)}>
      <Campo rot={rotulo} dica={`A sigla só muda os SKU futuros; os que já existem ficam como estão. De 1 a ${SIGLA_MAX} letras (A a Z) ou algarismos.`}>
        {(id) => (
          <input id={id} value={sigla} maxLength={SIGLA_MAX} aria-invalid={!!erro || (visivel && !!invalida)} aria-required="true" autoCapitalize="characters" autoComplete="off" spellCheck={false} autoFocus
            onChange={(e) => setSigla(normalizarSigla(e.target.value))} onKeyDown={tecla} className={cn(CAMPO, "border-foreground/40 uppercase tabular-nums")} />
        )}
      </Campo>
      {erro && <p className="text-[15px] text-red-700 dark:text-red-400" role="alert">{erro}</p>}
      {porque && <p id={razaoId} className={visivel ? NOTA : "sr-only"}>{porque}</p>}
      <div className="flex flex-wrap gap-2">
        <Button id={idGuardar} className="min-h-11 text-[15px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50" {...protegido(porque, razaoId, enviar)}>
          {aGravar && <Loader2 className="mr-1 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}Guardar sigla
        </Button>
        <Button variant="outline" className="min-h-11 text-[15px]" onClick={onCancelar} disabled={aGravar}>Cancelar</Button>
      </div>
    </div>
  );
}
