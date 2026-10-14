import { Info } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { MoradaObra } from "./CamposMoradaObra";
import { BlocosPerguntas } from "./PerguntaEscolha";
import { N } from "./PecasNovoNegocio";
import type { ChaveMorada, MoradaObraForm } from "./moradaObra";
import type { Respostas } from "./perguntasTipos";
import { BLOCO_QUALIFICACAO } from "./qualificacaoExemplo";
import { contarRespostas } from "./respostasVisita";

export interface AcoesQualificacao {
  escolher: (pergunta: string, opcao: string) => void;
  morada: (chave: ChaveMorada, valor: string) => void;
  preencherMorada: (morada: MoradaObraForm) => void;
}

interface Props {
  id: string;
  respostas: Respostas;
  morada: MoradaObraForm;
  erroCodigoPostal: boolean;
  /** A morada da aba Geral, para o atalho da morada da obra. */
  moradaContacto: string;
  acoes: AcoesQualificacao;
}

/** A aba Qualificação (só exemplo): as seis perguntas de escolha rápida e a morada da obra. Tudo opcional. */
export function AbaQualificacao({ id, respostas, morada, erroCodigoPostal, moradaContacto, acoes }: Props) {
  const { t } = useTranslation();
  const { respondidas, total } = contarRespostas([BLOCO_QUALIFICACAO], respostas);
  return (
    <div className="space-y-6">
      <p role="note" className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {t(`${N}qual.help`)}
      </p>
      <section aria-labelledby={`${id}-qualificacao`} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`${id}-qualificacao`} className="text-sm font-semibold text-foreground">{t(`${N}qual.questions`)}</h3>
          <p aria-live="polite" className="text-sm tabular-nums text-muted-foreground">{t(`${N}answered`, { n: respondidas, m: total })}</p>
        </div>
        <BlocosPerguntas blocos={[BLOCO_QUALIFICACAO]} respostas={respostas} aoEscolher={acoes.escolher} />
      </section>
      <MoradaObra
        id={id} valores={morada} erroCodigoPostal={erroCodigoPostal} moradaContacto={moradaContacto}
        aoMudar={acoes.morada} aoPreencher={acoes.preencherMorada}
      />
    </div>
  );
}
