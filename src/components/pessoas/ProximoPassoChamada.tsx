// "E agora?": o próximo passo depois da chamada, em cartões de escolha única. Os que cabem mudam com o resultado (ver
// `chamadaPassos.ts`); o recomendado leva a marca "Recomendado" em texto. A visita marcada na chamada é da pessoa: não há pedido a escolher.
import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { ehRecomendado } from "./chamadaPassos";
import { classeCartao } from "./cartaoOpcao";
import { Visto } from "./OpcoesResultado";
import type { PassoChamada, ResultadoContacto } from "./pessoasTipos";

interface ProximoPassoChamadaProps {
  resultado: ResultadoContacto | null;
  passos: readonly PassoChamada[];
  valor: PassoChamada;
  aoEscolher: (p: PassoChamada) => void;
}

export function ProximoPassoChamada({ resultado, passos, valor, aoEscolher }: ProximoPassoChamadaProps) {
  const { t } = useTranslation();
  const nome = useId();
  const idLegenda = useId();
  return (
    <div className="space-y-2">
      {/* Antes de escolher como correu não há rádios: um grupo de rádio vazio não diz nada, por isso é um simples grupo. */}
      <div role={resultado === null ? "group" : "radiogroup"} aria-labelledby={idLegenda} className="space-y-2">
        <p id={idLegenda} className="text-sm font-semibold text-foreground">{t("pessoasPagina.call.next")}</p>
        {resultado === null ? (
          <p className="text-sm text-muted-foreground">{t("pessoasPagina.call.nextWait")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {passos.map((p) => {
              const escolhido = valor === p;
              return (
                <label key={p} className="relative flex cursor-pointer">
                  <input type="radio" name={nome} className="peer sr-only" checked={escolhido} onChange={() => aoEscolher(p)} />
                  <span className={classeCartao(escolhido)}>
                    {t(`pessoasPagina.step.${p}`)}
                    {ehRecomendado(resultado, p) && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">{t("pessoasPagina.call.recommended")}</span>
                    )}
                    <Visto escolhido={escolhido} />
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
