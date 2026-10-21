// Uma visita da pessoa, no Resumo da ficha: o dia da semana, a data e a hora, o estado em texto (Por fazer ou Feita), o resultado (se já se
// registou), a MORADA DA VISITA (com a indicação de que é igual à morada da lead ou outra), a nota de acesso, o comercial e a que negócio
// está ligada (ou que está por ligar). Uma visita cancelada só se lê: diz «Cancelada» e não pede resultado, nem se altera, nem se cancela, nem se liga.
// Uma visita por fazer, sem resultado e por ligar pode alterar-se; uma por fazer e sem resultado pode cancelar-se (com confirmação; a base recusa se o
// negócio já fechou); uma já feita já aconteceu; uma ligada a um negócio só se desliga na ficha do negócio.
import { useState } from "react";
import { AlertCircle, CalendarClock, MapPin } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LinhaCampo, ListaCampos } from "@/components/ficha-comum/ListaCampos";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { AlterarVisita } from "./AlterarVisita";
import { ConfirmarCancelarVisita } from "./ConfirmarCancelarVisita";
import { idLinhaVisita } from "./focoVisita";
import { diaDaSemana, textoDiaCompleto } from "./formatoPessoas";
import { textoMoradaVisita } from "./moradaVisita";
import type { AcoesFicha } from "./PainelBase";
import type { Pessoa } from "./pessoasTipos";

const K = "pessoasPagina.nextVisit.";
const R = "pessoasPagina.visitResult.";
const X = "pessoasPagina.real.visit.cancelar.";

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

interface LinhaVisitaPessoaProps {
  pessoa: Pessoa;
  visita: VisitaPessoa;
  /** O nome do negócio a que a visita está ligada; `undefined` se está por ligar. */
  negocio?: string;
  hoje: string;
  /** O exemplo: muda a visita em memória. Sem isto (e sem `naBase`) o botão «Alterar» não existe. */
  alterarVisita?: AcoesFicha["alterarVisita"];
  /** A ficha real: «Alterar visita» grava na base pelo próprio diálogo (quadro, recursos, duração, conflito). */
  naBase?: boolean;
  /** Cancela a visita na base; sem isto (o exemplo) o botão «Cancelar visita» não existe. */
  cancelarVisita?: AcoesFicha["cancelarVisita"];
  /** O exemplo: houve um levantamento feito nesta visita (a linha di-lo). Sem isto (a ficha real) a linha não o diz. */
  comLevantamento?: boolean;
  /** Abre o diálogo do resultado desta visita. */
  aoRegistarResultado: (visitaId: string) => void;
}

export function LinhaVisitaPessoa({ pessoa, visita, negocio, hoje, alterarVisita, naBase = false, cancelarVisita, comLevantamento = false, aoRegistarResultado }: LinhaVisitaPessoaProps) {
  const { t } = useTranslation();
  const [aAlterar, setAAlterar] = useState(false);
  const [aCancelar, setACancelar] = useState(false);
  const quando = useQuando(visita.data, visita.hora);
  const porFazer = visita.estado === "porFazer";
  const cancelada = visita.estado === "cancelada";
  const ligada = visita.negocioId !== null;
  // Uma visita feita, cancelada ou com resultado já não se altera nem se cancela; uma ligada a um negócio ainda se cancela (a base decide).
  const semResultado = visita.resultado === undefined;
  const podeAlterar = porFazer && !ligada && semResultado && (naBase || alterarVisita !== undefined);
  const podeCancelar = porFazer && semResultado && cancelarVisita !== undefined;
  const porConcluir = porFazer && visita.data !== "" && visita.data < hoje;
  // O resultado pede-se de uma visita que já aconteceu (feita, ou com o dia a chegar ao fim) e ainda sem resultado; as ligadas já seguiram.
  const pedeResultado = !ligada && visita.resultado === undefined && (visita.estado === "feita" || porConcluir || (porFazer && visita.data === hoje));
  return (
    <li id={idLinhaVisita(visita.id)} tabIndex={-1} className="space-y-2 py-3 outline-none first:pt-0 last:pb-0">
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
      {comLevantamento && <p className="text-sm text-foreground">{t("pessoasPagina.reg.visits.withSurvey")}</p>}
      {!cancelada && (
        <p className="text-sm text-muted-foreground">
          {ligada ? t("pessoasPagina.reg.visits.linked", { deal: negocio ?? "" }) : t("pessoasPagina.reg.visits.unlinked")}
        </p>
      )}
      {visita.resultado && <p className="text-[15px] font-medium text-foreground">{t(`${R}summary`, { result: t(`${R}result.${visita.resultado}`) })}</p>}
      {(podeAlterar || podeCancelar || pedeResultado) ? (
        <div className="flex flex-wrap gap-2">
          {podeAlterar && (
            <>
              <Button
                type="button" variant="outline" aria-label={t(`${K}changeLabel`, { when: quando, work: pessoa.nome })} className={cn("min-h-11", FOCO)}
                onClick={() => setAAlterar(true)}
              >
                {t(`${K}change`)}
              </Button>
              <AlterarVisita
                aberto={aAlterar} aoMudarAberto={setAAlterar} pessoa={pessoa} visita={visita} hoje={hoje} naBase={naBase}
                aoGuardar={(dados) => alterarVisita?.(visita.id, dados)}
              />
            </>
          )}
          {podeCancelar && (
            <Button
              type="button" variant="outline" aria-label={t(`${X}buttonLabel`, { when: quando, work: pessoa.nome })} className={cn("min-h-11", FOCO)}
              onClick={() => setACancelar(true)}
            >
              {t(`${X}button`)}
            </Button>
          )}
          {pedeResultado && (
            <Button
              type="button" variant="outline" aria-label={t(`${R}openLabel`, { when: quando })} className={cn("min-h-11", FOCO)}
              onClick={() => aoRegistarResultado(visita.id)}
            >
              {t(`${R}open`)}
            </Button>
          )}
        </div>
      ) : null}
      {/* Fora do bloco dos botões: quando a ficha se refaz e a visita passa a Cancelada, «Cancelar visita» desaparece, mas o diálogo tem de continuar
          montado até fechar, para devolver o foco à linha. */}
      {cancelarVisita !== undefined && (
        <ConfirmarCancelarVisita
          pedido={aCancelar ? { visitaId: visita.id, nome: pessoa.nome, quando } : null} aoCancelar={(id) => cancelarVisita(id)}
          aoFechar={() => setACancelar(false)}
        />
      )}
    </li>
  );
}
