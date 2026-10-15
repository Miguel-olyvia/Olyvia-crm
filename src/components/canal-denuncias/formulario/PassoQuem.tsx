// Passo 2: quem está envolvido. Nada é obrigatório: quem não sabe pode seguir em frente.
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { Campo } from "../comum/Campo";
import { GrupoRadios } from "../comum/GrupoRadios";
import { AINDA_ACONTECE } from "../lib/tipos";
import type { PassoProps } from "./PassoModo";

export function PassoQuem({ dados, onChange }: PassoProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <Campo id="den-envolvidos" rotulo={t("cd.campo.envolvidos")} ajuda={t("cd.ajuda.envolvidos")}>
        {(a) => <Textarea {...a} rows={3} value={dados.envolvidos} onChange={(e) => onChange({ envolvidos: e.target.value })} />}
      </Campo>
      <GrupoRadios
        nome="den-testemunhas"
        legenda={t("cd.campo.testemunhas")}
        valor={dados.testemunhas}
        opcoes={AINDA_ACONTECE.map((v) => ({ valor: v, rotulo: t(`cd.resposta.${v}`) }))}
        onChange={(v) => onChange({ testemunhas: v })}
      />
      <Campo id="den-reportado" rotulo={t("cd.campo.jaReportado")} ajuda={t("cd.ajuda.jaReportado")}>
        {(a) => <Textarea {...a} rows={3} value={dados.jaReportado} onChange={(e) => onChange({ jaReportado: e.target.value })} />}
      </Campo>
    </div>
  );
}
