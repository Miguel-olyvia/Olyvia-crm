// "Próxima visita" no Resumo da ficha: o dia da semana, a data, a hora e a MORADA DA VISITA (com a indicação de que é igual à
// morada da lead ou outra), mais as duas ações: "Visita concluída → Criar negócio" (a única ação principal do bloco) e
// "Alterar visita". Uma visita cujo dia já passou diz "Visita por concluir"; uma já marcada como feita diz "Visita feita" e deixa de
// se poder alterar (só falta criar o negócio). Sem visita, não há bloco.
import { useState } from "react";
import { AlertCircle, CalendarClock, MapPin } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LinhaCampo, ListaCampos } from "@/components/ficha-comum/ListaCampos";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/negocio-metas/estilos";
import { AlterarVisita } from "./AlterarVisita";
import { textoDiaCompleto } from "./formatoPessoas";
import { textoMoradaVisita } from "./moradaVisita";
import type { Pessoa } from "./pessoasTipos";
import { MarcaExemplo } from "./SelosPessoa";
import type { AcoesFicha } from "./PainelBase";
import { diaDaSemana, type VisitaResolvida } from "./visitaProxima";

const K = "pessoasPagina.nextVisit.";

interface SeccaoVisitaProps {
  pessoa: Pessoa;
  visita: VisitaResolvida;
  hoje: string;
  alterarVisita: AcoesFicha["alterarVisita"];
  /** "Visita concluída → Criar negócio": a página abre o painel "Novo negócio" com a visita já preenchida. */
  aoCriarNegocio: () => void;
}

/** "domingo, 12/10/2026 · 15:00" a partir do dia e da hora da visita. */
function useQuando(data: string, hora: string): string {
  const { t } = useTranslation();
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

export function SeccaoProximaVisita({ pessoa, visita, hoje, alterarVisita, aoCriarNegocio }: SeccaoVisitaProps) {
  const { t } = useTranslation();
  const [aAlterar, setAAlterar] = useState(false);
  const quando = useQuando(visita.data, visita.hora);
  const porConcluir = visita.estado === "porConcluir";
  // Uma visita feita já aconteceu: não se altera (o dia, a hora e a morada já não mudam nada) e só falta criar o negócio.
  const feita = visita.estado === "feita";
  return (
    <Seccao titulo={t(`${K}${feita ? "titleDone" : porConcluir ? "titleOverdue" : "title"}`)} marca={<MarcaExemplo />}>
      <div className="space-y-2">
        <p className="inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground">
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
          {quando}
        </p>
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
              <span>{textoMoradaVisita(visita.moradaVisita) || t(`${K}noAddress`)}</span>
              <ChipOrigem igual={visita.igualALead} />
            </span>
          </LinhaCampo>
          {visita.notaAcesso && <LinhaCampo rotulo={t(`${K}access`)}>{visita.notaAcesso}</LinhaCampo>}
          <LinhaCampo rotulo={t(`${K}rep`)}>{visita.comercial}</LinhaCampo>
        </ListaCampos>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" className={cn("min-h-11", FOCO)} onClick={aoCriarNegocio}>{t(`${K}done`)}</Button>
          {!feita && (
            <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={() => setAAlterar(true)}>{t(`${K}change`)}</Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t(`${K}${feita ? "doneHintDone" : "doneHint"}`)}</p>
      </div>
      {!feita && (
        <AlterarVisita
          aberto={aAlterar} aoMudarAberto={setAAlterar} pessoa={pessoa} visita={visita} hoje={hoje}
          aoGuardar={(dados) => alterarVisita(pessoa.id, dados)}
        />
      )}
    </Seccao>
  );
}
