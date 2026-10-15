// Aba «Resumo»: o que foi dito, a gravidade e a avaliação inicial, a identidade (protegida) e o responsável.
import { Paperclip } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { useTranslation } from "@/hooks/useTranslation";
import { mudarGravidade } from "../dados/loja";
import { dataCurta } from "../lib/datas";
import { formatoTamanho } from "../lib/formato";
import { GRAVIDADES, type Denuncia, type Gravidade } from "../lib/tipos";
import { SeccaoIdentidade } from "./SeccaoIdentidade";
import { SeccaoResponsavel } from "./SeccaoResponsavel";

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-xs text-muted-foreground sm:pt-0.5">{rotulo}</dt>
      <dd className="whitespace-pre-line break-words text-sm">{children}</dd>
    </div>
  );
}

export function AbaResumo({ d }: { d: Denuncia }) {
  const { t } = useTranslation();
  const vazio = <span className="text-muted-foreground">—</span>;
  return (
    <div className="space-y-4">
      <p className="whitespace-pre-line break-words text-sm">{d.descricao}</p>
      <dl className="space-y-2">
        <Linha rotulo={t("cd.campo.tipo")}>{t(`cd.tipo.${d.tipo}`)}</Linha>
        <Linha rotulo={t("cd.acomp.recebidaEm")}>{dataCurta(d.recebidaEm, true)}</Linha>
        <Linha rotulo={t("cd.campo.quando")}>{d.quando} · {t(`cd.resposta.${d.aindaAcontece}`)}</Linha>
        <Linha rotulo={t("cd.campo.onde")}>{d.onde || vazio}</Linha>
        <Linha rotulo={t("cd.campo.envolvidos")}>{d.envolvidos || vazio}</Linha>
        <Linha rotulo={t("cd.campo.testemunhas")}>{t(`cd.resposta.${d.testemunhas}`)}</Linha>
        <Linha rotulo={t("cd.campo.jaReportado")}>{d.jaReportado || vazio}</Linha>
        <Linha rotulo={t("cd.rever.provas")}>
          {d.anexos.length === 0 ? vazio : d.anexos.map((a) => (
            <span key={a.nome} className="flex items-center gap-1">
              <Paperclip className="h-3 w-3" aria-hidden="true" />{a.nome} · {formatoTamanho(a.tamanho)}
            </span>
          ))}
        </Linha>
        <Linha rotulo={t("cd.avaliacao.avaliacao")}>{d.avaliacaoInicial || vazio}</Linha>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="den-gravidade" className="text-sm font-medium">{t("cd.gravidade.titulo")}</label>
        <div className="w-40">
          <NativeSelect id="den-gravidade" className="h-11" value={d.gravidade}
            options={GRAVIDADES.map((g) => ({ value: g, label: t(`cd.gravidade.${g}`) }))}
            onValueChange={(v) => mudarGravidade(d.id, v as Gravidade)} />
        </div>
      </div>
      <SeccaoIdentidade d={d} />
      <SeccaoResponsavel d={d} />
    </div>
  );
}
