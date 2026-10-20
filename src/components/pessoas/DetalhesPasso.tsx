// O que o passo escolhido ainda pede: o dia e a hora (visita e "ligar numa data"), mais a morada da visita, ou o motivo ao
// encerrar a abordagem (um da lista, ou «Outro» com o texto). Aparece logo por baixo do "E agora?", sem diálogo.
import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { ErroAgenda } from "./agendaVisitaForm";
import { CamposAgendaVisita } from "./CamposAgendaVisita";
import { CamposDataHora, MensagemErro } from "./CamposDataHora";
import { CamposMotivo } from "./CamposMotivo";
import { type ErrosChamada } from "./chamadaPassos";
import { MoradaVisitaCampos } from "./MoradaVisitaCampos";
import type { ErroMoradaVisita } from "./moradaVisita";
import type { MoradaVisita } from "./pessoasTipos";
import type { FormAgenda } from "./useFormAgendaVisita";
import type { CamposChamada } from "./useFormChamada";

const C = "pessoasPagina.call.";

interface DetalhesPassoProps {
  campos: CamposChamada;
  erros: ErrosChamada;
  /** A morada que a lead indicou (`null` sem morada) e o erro da morada da visita, depois de tentar guardar. */
  moradaLead: MoradaVisita | null;
  erroMorada: ErroMoradaVisita | null;
  hoje: string;
  aoMudar: (parcial: Partial<CamposChamada>) => void;
  /**
   * Só a ficha real: a agenda da base no passo «marcar visita» (quadro, quem vai, dia, hora, duração e aviso de conflito) no lugar do dia e da hora
   * do exemplo; `erro` é o da agenda, depois de tentar guardar.
   */
  agendaReal?: { form: FormAgenda; erro: ErroAgenda | null; /** A chamada está a gravar: a agenda só se lê. */ desativado?: boolean };
}

export function DetalhesPasso({ campos, erros, moradaLead, erroMorada, hoje, aoMudar, agendaReal }: DetalhesPassoProps) {
  const { t } = useTranslation();
  const id = useId();
  if (campos.passo === "perder") return <CamposMotivo motivo={campos.motivo} motivoOutro={campos.motivoOutro} erro={erros.motivo} aoMudar={aoMudar} />;
  if (campos.passo !== "marcarVisita" && campos.passo !== "ligarData") return null;
  const visita = campos.passo === "marcarVisita";
  if (visita && agendaReal) {
    const { form } = agendaReal;
    return (
      <div role="group" aria-labelledby={`${id}-titulo`} className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
        <p id={`${id}-titulo`} className="text-sm font-semibold text-foreground">{t(`${C}whenVisit`)}</p>
        <CamposAgendaVisita
          id={id} hoje={hoje} agenda={form.agenda} valor={form.valor} aoMudar={form.mudar} erro={agendaReal.erro} conflito={form.conflito}
          recursoOcupado={form.recusado} moradaLead={moradaLead} destino={campos.destino} aoMudarDestino={(destino) => aoMudar({ destino })}
          erroMorada={erroMorada} desativado={agendaReal.desativado}
        />
      </div>
    );
  }
  return (
    <div role="group" aria-labelledby={`${id}-titulo`} className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <p id={`${id}-titulo`} className="text-sm font-semibold text-foreground">{t(visita ? `${C}whenVisit` : `${C}whenCall`)}</p>
      <CamposDataHora
        id={id} data={campos.data} hora={campos.hora} hoje={hoje} rotuloData={t(`${C}date`)} rotuloHora={t(`${C}time`)}
        erroData={erros.data ? t(`${C}error.${erros.data}`) : null} erroHora={erros.hora ? t(`${C}error.${erros.hora}`) : null}
        aoMudar={aoMudar}
      />
      {visita && (
        <MoradaVisitaCampos
          id={`${id}-morada`} moradaLead={moradaLead} valor={campos.destino} erro={erroMorada} aoMudar={(destino) => aoMudar({ destino })}
        />
      )}
    </div>
  );
}
