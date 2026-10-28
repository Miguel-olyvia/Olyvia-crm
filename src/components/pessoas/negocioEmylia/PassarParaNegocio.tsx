// A saída da Visita: «Passar para o Negócio». Aparece com o levantamento guardado, no fim do assistente (e também com o assistente só para ler), e leva o negócio à fase
// Negócio da Emylia (negocios.fase = 3, gravada por neg_guardar_negocio). O que falta responder no levantamento é opcional e não a bloqueia. Quando não se pode
// (sem permissão, documentos do CRM, a ler, erro) a ação fica à vista, desativada, com a razão dita em texto.
import { useId } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { AcaoPassar } from "./useNegocioEmyliaDoGuia";

const N = "pessoasPagina.real.neg.passar.";

interface PassarParaNegocioProps {
  acao: AcaoPassar;
  /** O erro da última gravação, se a passagem falhou. */
  erro?: string | null;
}

export function PassarParaNegocio({ acao, erro = null }: PassarParaNegocioProps) {
  const { t } = useTranslation();
  const idRazao = useId();
  if (!acao.visivel) return null;
  const desativada = acao.razao !== null || acao.aFazer;
  const texto = acao.aFazer ? t(`${N}aFazer`) : acao.razao ? t(`${N}razao.${acao.razao}`) : null;
  return (
    <section aria-labelledby={`${idRazao}-t`} className="space-y-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
      <h3 id={`${idRazao}-t`} className="text-lg font-semibold text-foreground">{t(`${N}titulo`)}</h3>
      <p className="text-[15px] text-muted-foreground">{t(`${N}texto`)}</p>
      <Button
        type="button" aria-disabled={desativada || undefined} aria-busy={acao.aFazer || undefined} aria-describedby={texto ? idRazao : undefined}
        className={cn("min-h-11 gap-2 rounded-lg px-6 font-semibold", FOCO, desativada && "opacity-60")}
        onClick={() => { if (!desativada) acao.fazer(); }}
      >
        {t(`${N}botao`)}
        {acao.aFazer ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
      </Button>
      {texto && <p id={idRazao} role="status" className="text-sm text-muted-foreground">{texto}</p>}
      {erro && <p role="alert" className="text-sm text-destructive">{t(`${N}erro`, { erro })}</p>}
    </section>
  );
}
