// A faixa fina de alertas da ficha real, logo por baixo do cabeçalho: uma linha por alerta (ícone, texto e, quando há o que fazer, um botão), e só
// quando o alerta existe. Sem alertas não desenha nada. Os alertas são os que antes viviam em secções grandes no Resumo: visitas por fechar, voltou a
// contactar (e sem contacto há muito, ou negócios abertos de uma perdida) e «todos os negócios perdidos». O botão de cada um abre a aba certa do apoio.
import { CalendarClock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { AbrirApoio } from "./apoioTipos";
import { avisosPessoa } from "./avisosPessoa";
import { AvisoNegociosPerdidos } from "./AvisoNegociosPerdidos";
import { todosNegociosPerdidos } from "./etapaPessoa";
import type { ResumoPessoa } from "./pessoasTipos";
import { visitasDaFicha, visitasPorFechar } from "./proximaVisita";
import { ICONE_AVISO, textosDoAviso } from "./SeccoesResumo";

interface FaixaAlertasFichaProps {
  resumo: ResumoPessoa;
  hoje: string;
  /** Voltou a contactar: tem submissões pendentes e ainda ninguém lhe respondeu. */
  voltou: boolean;
  podeVerSubmissoes: boolean;
  /** Quantas submissões estão por rever (o botão do aviso «Voltou a contactar»). */
  pendentes: number;
  aoAbrirApoio: AbrirApoio;
  /** Abre «Encerrar abordagem» (o aviso «todos os negócios perdidos»); ausente quando a pessoa não se encerra. */
  aoEncerrar?: (origem: HTMLElement | null) => void;
}

const LINHA = "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-muted/60 px-3 py-2";

export function FaixaAlertasFicha({ resumo, hoje, voltou, podeVerSubmissoes, pendentes, aoAbrirApoio, aoEncerrar }: FaixaAlertasFichaProps) {
  const { t } = useTranslation();
  const nPorFechar = visitasPorFechar(visitasDaFicha(resumo), hoje).length;
  const avisos = avisosPessoa({ pessoa: resumo.pessoa, voltou, podeVerSubmissoes, negociosAbertos: resumo.abertos.length });
  const todosPerdidos = todosNegociosPerdidos(resumo) && aoEncerrar !== undefined;
  if (nPorFechar === 0 && avisos.length === 0 && !todosPerdidos) return null;
  return (
    <section aria-label={t("pessoasPagina.faixa.regiao")}>
      <ul className="list-none space-y-2 p-0">
        {nPorFechar > 0 && (
          <li className={LINHA}>
            <CalendarClock className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
              {t(`pessoasPagina.faixa.porFechar.${nPorFechar === 1 ? "one" : "many"}`, { count: nPorFechar })}
            </p>
            <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={(e) => aoAbrirApoio("visitas", e.currentTarget)}>
              {t("pessoasPagina.faixa.verVisitas")}
            </Button>
          </li>
        )}
        {avisos.map((a) => {
          const Icone = ICONE_AVISO[a.tipo];
          const { titulo, dica } = textosDoAviso(t, a);
          return (
            <li key={a.tipo} className={LINHA}>
              <Icone className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm text-foreground"><strong className="font-semibold">{titulo}</strong> {dica}</p>
              {a.tipo === "voltou" && pendentes > 0 && (
                <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={(e) => aoAbrirApoio("submissoes", e.currentTarget)}>
                  {t("pessoasPagina.actions.submissions", { count: pendentes })}
                </Button>
              )}
            </li>
          );
        })}
        {todosPerdidos && (
          <li className="list-none">
            <AvisoNegociosPerdidos aoMarcar={(origem) => aoEncerrar?.(origem)} className="mx-0 mb-0 px-3 py-2" />
          </li>
        )}
      </ul>
    </section>
  );
}
