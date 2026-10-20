import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { N } from "./PecasNovoNegocio";
import { FOCO } from "./estilos";
import { useQuestionario, type EstadoDoQuestionario } from "./QuestionarioContexto";

interface Props {
  estado: EstadoDoQuestionario;
  aoRepetir: () => void;
}

/** O erro de acesso que a base explica (NG008: sem levantamento; 42501: sem acesso) tem razão própria; o resto é a falha genérica. Esta pasta não importa de `@/hooks/pessoas`: lê-se o `codigo` do erro. */
function razaoDoErro(erro: unknown): "ng008" | "permission" | null {
  const codigo = typeof erro === "object" && erro !== null ? (erro as { codigo?: unknown }).codigo : null;
  if (codigo === "NG008") return "ng008";
  return codigo === "42501" ? "permission" : null;
}

/**
 * No lugar das perguntas, enquanto não chegam: «a carregar», ou o erro com «Repetir» (e a razão de não se poder gravar). Pronto, nada.
 * Ao carregar em «Repetir» o botão não desaparece: fica ocupado (aria-busy, sem pedir outra leitura) até a leitura acabar, para o foco do teclado
 * não cair no corpo da página.
 */
export function EstadoQuestionario({ estado, aoRepetir }: Props) {
  const { t } = useTranslation();
  const { erro } = useQuestionario();
  const [repetindo, setRepetindo] = useState(false);
  // A repetição acaba quando a leitura deixa de estar a carregar (deu certo, ou falhou outra vez).
  useEffect(() => {
    if (estado !== "a-carregar") setRepetindo(false);
  }, [estado]);

  if (estado === "pronto") return null;
  const aRepetir = estado === "a-carregar" && repetindo;
  if (estado === "a-carregar" && !aRepetir) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {t(`${N}qform.loading`)}
      </p>
    );
  }
  const razao = razaoDoErro(erro);
  return (
    <div role={aRepetir ? undefined : "alert"} className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <p className="min-w-0 flex-1">{t(`${N}qform.error`)} {razao ? t(`${N}qform.error.${razao}`) : t(`${N}qform.error.blocked`)}</p>
      <Button
        type="button" variant="outline" className={cn("min-h-11", FOCO)} aria-busy={aRepetir || undefined} aria-disabled={aRepetir || undefined}
        onClick={() => {
          if (aRepetir) return;
          setRepetindo(true);
          aoRepetir();
        }}
      >
        {aRepetir ? t(`${N}qform.loading`) : t(`${N}qform.retry`)}
      </Button>
    </div>
  );
}
