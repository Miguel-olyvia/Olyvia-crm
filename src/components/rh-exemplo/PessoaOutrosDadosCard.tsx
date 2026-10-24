// Os dados da admissão que a ficha ainda não mostrava noutro cartão: como a pessoa quer ser tratada e a sindicalização. Só leitura,
// lidos da ficha em memória; sem nenhum dos dois, o cartão não aparece.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFichaRh } from "@/components/rh-exemplo/dados/loja";
import { useTranslation } from "@/hooks/useTranslation";

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="border-t border-border/60 py-2">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm">{valor ?? t("hr.campos.semValor")}</dd>
    </div>
  );
}

export function PessoaOutrosDadosCard({ pessoaId }: { pessoaId: string }) {
  const { t } = useTranslation();
  const ficha = useFichaRh(pessoaId);
  const tratamento = ficha?.nomeTratamento ?? null;
  const sindical = ficha?.sindicalizacao ?? null;
  if (tratamento === null && sindical === null) return null;
  const sim = sindical?.sindicalizado === true;
  const estado = sindical === null || sindical.sindicalizado === null ? null : t(sim ? "rhNova.simNao.sim" : "rhNova.simNao.nao");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("rhNova.ficha.outrosDados")}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 sm:grid-cols-2">
          <Linha rotulo={t("rhNova.f.nomeTratamento")} valor={tratamento} />
          <Linha rotulo={t("rhNova.sec.sindicalizacao")} valor={estado} />
          {sim && <Linha rotulo={t("hr.pendencias.campo.sindicato")} valor={sindical?.sindicato ?? null} />}
          {sim && <Linha rotulo={t("rhNova.f.quota")} valor={sindical?.quota_percentagem == null ? null : `${sindical.quota_percentagem} %`} />}
        </dl>
      </CardContent>
    </Card>
  );
}
