// Os registos da pessoa que não são visitas, no Resumo da ficha: as chamadas e os levantamentos, do mais recente para o mais antigo. Cada um
// diz se está ligado a um negócio (e a qual) ou por ligar. As visitas têm a sua secção (`SeccaoVisitas`).
import { ClipboardList, Phone } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Seccao } from "@/components/ficha-comum/Seccao";
import type { ContactoPessoa, LevantamentoPessoa } from "@/components/negocio-metas/registosTipos";
import { CarregarMais, type MaisItens } from "./CarregarMais";
import { textoDiaCompleto } from "./formatoPessoas";
import { MarcaExemplo } from "./SelosPessoa";

interface SeccaoRegistosProps {
  contactos: readonly ContactoPessoa[];
  levantamentos: readonly LevantamentoPessoa[];
  /** O nome de cada negócio, pelo id. */
  negocios: ReadonlyMap<string, string>;
  /** «Carregar mais» chamadas e levantamentos (a ficha real). */
  maisContactos?: MaisItens;
  maisLevantamentos?: MaisItens;
}

interface Linha {
  chave: string;
  data: string;
  icone: typeof Phone;
  tipo: string;
  detalhe: string;
  negocioId: string | null;
  ligada: "Call" | "Survey";
}

export function SeccaoRegistos({ contactos, levantamentos, negocios, maisContactos, maisLevantamentos }: SeccaoRegistosProps) {
  const { t } = useTranslation();
  const linhas: Linha[] = [
    ...contactos.map((c): Linha => ({
      chave: `c-${c.id}`, data: c.data, icone: Phone, tipo: t("pessoasPagina.reg.kind.contact"), negocioId: c.negocioId, ligada: "Call",
      // Sem resultado conhecido (a base trouxe um que a ficha não conhece): texto neutro, nunca a chave nem «null».
      detalhe: t("pessoasPagina.reg.contact.line", {
        date: textoDiaCompleto(c.data), result: c.resultado ? t(`pessoasPagina.result.${c.resultado}`) : t("pessoasPagina.real.ficha.unknownResult"),
      }),
    })),
    ...levantamentos.map((l): Linha => {
      const n = l.rascunho.linhas.length;
      const medidas = n === 0 ? t("pessoasPagina.reg.survey.noLines") : n === 1 ? t("pessoasPagina.reg.survey.lines.one") : t("pessoasPagina.reg.survey.lines", { count: n });
      return {
        chave: `l-${l.id}`, data: l.data, icone: ClipboardList, tipo: t("pessoasPagina.reg.kind.survey"), negocioId: l.negocioId, ligada: "Survey",
        detalhe: `${t("pessoasPagina.reg.survey.line", { date: textoDiaCompleto(l.data), who: l.feitoPor })} · ${medidas}`,
      };
    }),
  ].sort((a, b) => b.data.localeCompare(a.data));
  if (linhas.length === 0) return null;
  const haPorLigar = linhas.some((l) => l.negocioId === null);
  return (
    <Seccao titulo={t(haPorLigar ? "pessoasPagina.reg.unlinked.title" : "pessoasPagina.reg.kind.records")} marca={<MarcaExemplo />}>
      <div className="space-y-2">
        {haPorLigar && <p className="text-sm text-muted-foreground">{t("pessoasPagina.reg.unlinked.hint")}</p>}
        <ul role="list" className="list-none divide-y divide-border p-0">
          {linhas.map(({ chave, icone: Icone, tipo, detalhe, negocioId, ligada }) => (
            <li key={chave} className="space-y-0.5 py-2 first:pt-0 last:pb-0">
              <p className="inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground">
                <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
                {tipo}
              </p>
              <p className="text-[15px] text-foreground">{detalhe}</p>
              <p className="text-sm text-muted-foreground">
                {negocioId === null ? t("pessoasPagina.reg.item.unlinked") : t(`pessoasPagina.reg.item.linked${ligada}`, { deal: negocios.get(negocioId) ?? "" })}
              </p>
            </li>
          ))}
        </ul>
        <CarregarMais tipo="contactos" estado={maisContactos} />
        <CarregarMais tipo="levantamentos" estado={maisLevantamentos} />
      </div>
    </Seccao>
  );
}
