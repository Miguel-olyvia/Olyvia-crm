// Uma visita de um pedido, no Resumo da ficha: o dia da semana, a data e a hora, o estado em texto (Por fazer ou Feita), a MORADA DA
// VISITA (com a indicação de que é igual à morada da lead ou outra), a nota de acesso e o comercial. Uma visita por fazer pode alterar-se;
// uma já feita já aconteceu (o dia, a hora e a morada já não mudam nada).
import { useState } from "react";
import { AlertCircle, CalendarClock, MapPin } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LinhaCampo, ListaCampos } from "@/components/ficha-comum/ListaCampos";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { AlterarVisita } from "./AlterarVisita";
import { diaDaSemana, textoDiaCompleto } from "./formatoPessoas";
import { textoMoradaVisita } from "./moradaVisita";
import type { AcoesFicha } from "./PainelBase";
import type { Pessoa } from "./pessoasTipos";

const K = "pessoasPagina.nextVisit.";

/** "domingo, 12/10/2026 · 15:00" a partir do dia e da hora da visita; sem dia, só a hora (ou nada). */
function useQuando(data: string, hora: string): string {
  const { t } = useTranslation();
  if (data === "") return hora;
  const dia = `${t(`pessoasPagina.weekday.${diaDaSemana(data)}`)}, ${textoDiaCompleto(data)}`;
  return hora ? `${dia} · ${hora}` : dia;
}

/** A indicação em texto de que a morada da visita é a da lead ou outra (a cor não é o único sinal). */
function ChipOrigem({ igual }: { igual: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground">
      {t(`${K}${igual ? "chip.same" : "chip.other"}`)}
    </span>
  );
}

interface VisitaDoPedidoProps {
  pessoa: Pessoa;
  pedidoId: string;
  visita: VisitaNegocio;
  /** O nome do pedido (ver `nomeDoPedido`): diz de que pedido é o botão «Alterar visita», para o nome acessível ser único. */
  trabalho: string;
  hoje: string;
  alterarVisita: AcoesFicha["alterarVisita"];
}

export function VisitaDoPedido({ pessoa, pedidoId, visita, trabalho, hoje, alterarVisita }: VisitaDoPedidoProps) {
  const { t } = useTranslation();
  const [aAlterar, setAAlterar] = useState(false);
  const quando = useQuando(visita.data, visita.hora);
  const porFazer = visita.estado === "porFazer";
  const porConcluir = porFazer && visita.data !== "" && visita.data < hoje;
  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground">
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
          {quando}
        </p>
        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-sm text-foreground">{t(`${K}state.${visita.estado}`)}</span>
      </div>
      {porConcluir && (
        <p className="flex items-center gap-1.5 text-[15px] text-foreground">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          {t(`${K}overdueHint`, { date: textoDiaCompleto(visita.data) })}
        </p>
      )}
      <ListaCampos>
        <LinhaCampo rotulo={t(`${K}address`)}>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>{textoMoradaVisita(visita.morada) || t(`${K}noAddress`)}</span>
            <ChipOrigem igual={visita.igualALead} />
          </span>
        </LinhaCampo>
        {visita.nota && <LinhaCampo rotulo={t(`${K}access`)}>{visita.nota}</LinhaCampo>}
        <LinhaCampo rotulo={t(`${K}rep`)}>{visita.feitoPor}</LinhaCampo>
      </ListaCampos>
      {porFazer && (
        <>
          <Button
            type="button" variant="outline" aria-label={t(`${K}changeLabel`, { when: quando, work: trabalho })} className={cn("min-h-11", FOCO)}
            onClick={() => setAAlterar(true)}
          >
            {t(`${K}change`)}
          </Button>
          <AlterarVisita
            aberto={aAlterar} aoMudarAberto={setAAlterar} pedidoNome={trabalho} pessoa={pessoa} visita={visita} hoje={hoje}
            aoGuardar={(dados) => alterarVisita(pedidoId, visita.id, dados)}
          />
        </>
      )}
    </li>
  );
}
