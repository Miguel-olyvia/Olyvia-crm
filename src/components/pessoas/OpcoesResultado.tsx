// "Como correu?": o resultado da chamada, em cartões grandes (grelha de 2 colunas). Cada cartão é um radio nativo escondido
// (as setas mudam de opção) com ícone e texto; o escolhido leva cor, contorno mais grosso e um visto, para a cor não ser o
// único sinal.
import { useId, type ReactNode } from "react";
import { CalendarClock, Check, PhoneCall, PhoneMissed, PhoneOff, ThumbsDown, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { classeCartao } from "./cartaoOpcao";
import { RESULTADOS_CONTACTO } from "./opcoesPessoa";
import type { ResultadoContacto } from "./pessoasTipos";

const ICONES: Record<ResultadoContacto, LucideIcon> = {
  atendeuInteressado: PhoneCall, atendeuMaisTarde: CalendarClock, naoAtendeu: PhoneMissed, semInteresse: ThumbsDown, numeroErrado: PhoneOff,
};

/** O visto do cartão escolhido (o espaço fica reservado para o texto não saltar). */
export function Visto({ escolhido }: { escolhido: boolean }): ReactNode {
  return (
    <span className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
      {escolhido && <Check className="h-4 w-4 text-primary" />}
    </span>
  );
}

interface OpcoesResultadoProps {
  valor: ResultadoContacto | null;
  aoEscolher: (r: ResultadoContacto) => void;
}

export function OpcoesResultado({ valor, aoEscolher }: OpcoesResultadoProps) {
  const { t } = useTranslation();
  const nome = useId();
  const idLegenda = useId();
  return (
    <div role="radiogroup" aria-labelledby={idLegenda} className="space-y-2">
      <p id={idLegenda} className="text-sm font-semibold text-foreground">{t("pessoasPagina.call.how")}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {RESULTADOS_CONTACTO.map((r) => {
          const Icone = ICONES[r];
          const escolhido = valor === r;
          return (
            <label key={r} className="relative flex cursor-pointer">
              <input type="radio" name={nome} className="peer sr-only" checked={escolhido} onChange={() => aoEscolher(r)} />
              <span className={classeCartao(escolhido)}>
                <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t(`pessoasPagina.result.${r}`)}
                <Visto escolhido={escolhido} />
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
