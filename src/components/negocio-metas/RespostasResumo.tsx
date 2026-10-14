import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { TituloPainel } from "./CamposPainel";
import { N } from "./PecasNovoNegocio";
import type { MoradaObraNegocio, RespostaNegocio, SeccaoVisitaNegocio } from "./negocioMetas";

function ListaRespostas({ respostas }: { respostas: readonly RespostaNegocio[] }) {
  return (
    <ul className="space-y-1 text-sm text-foreground">
      {respostas.map((r) => (
        <li key={r.pergunta}>
          <span className="text-muted-foreground">{r.pergunta}: </span>
          <span className="font-medium">{r.resposta}</span>
        </li>
      ))}
    </ul>
  );
}

/** A Qualificação escrita ao criar o negócio, só para ler. */
export function QualificacaoResumo({ respostas }: { respostas: readonly RespostaNegocio[] }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-1.5">
      <TituloPainel id={id}>{t(`${N}qual.title`)}</TituloPainel>
      <ListaRespostas respostas={respostas} />
    </section>
  );
}

/** A morada da obra escrita ao criar o negócio, só para ler: rua, código postal e localidade, e o andar. */
export function MoradaObraResumo({ morada }: { morada: MoradaObraNegocio }) {
  const { t } = useTranslation();
  const id = useId();
  const linha = [morada.rua, [morada.codigoPostal, morada.localidade].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return (
    <section aria-labelledby={id} className="space-y-1.5">
      <TituloPainel id={id}>{t(`${N}address.title`)}</TituloPainel>
      {linha && <p className="text-sm text-foreground">{linha}</p>}
      {morada.andar && <p className="text-sm text-muted-foreground">{morada.andar}</p>}
    </section>
  );
}

/** A Visita escrita ao criar o negócio, só para ler: o que se respondeu em cada secção. */
export function VisitaResumo({ seccoes }: { seccoes: readonly SeccaoVisitaNegocio[] }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-3">
      <TituloPainel id={id}>{t(`${N}visit.title`)}</TituloPainel>
      {seccoes.map((s) => (
        <div key={s.titulo} className="space-y-1">
          <h4 className="text-sm font-semibold text-foreground">{s.titulo}</h4>
          <ListaRespostas respostas={s.respostas} />
        </div>
      ))}
    </section>
  );
}
