// «Outros dados» da ficha: a sindicalização (só leitura), lida do `usePessoa` pela aba dos detalhes pessoais. Sem resposta
// registada o cartão não aparece (e sem permissão para a ler a base devolve `null`, que dá o mesmo: não se revela sequer que
// existe uma resposta). A escrita é do assistente «Nova pessoa» e do convite; aqui só se mostra. O nome de tratamento entra
// quando houver coluna para ele.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import type { PessoaSindicalizacao } from "@/types/hr";

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="border-t border-border/60 py-2">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm">{valor ?? t("hr.campos.semValor")}</dd>
    </div>
  );
}

interface PessoaOutrosDadosCardProps {
  sindicalizacao: PessoaSindicalizacao | null;
}

export function PessoaOutrosDadosCard({ sindicalizacao }: PessoaOutrosDadosCardProps) {
  const { t } = useTranslation();
  // «Por decidir» (null) nao e resposta: nao ha nada para mostrar.
  if (sindicalizacao === null || sindicalizacao.sindicalizado === null) return null;
  const sim = sindicalizacao.sindicalizado === true;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("rhNova.ficha.outrosDados")}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 sm:grid-cols-2">
          <Linha rotulo={t("rhNova.sec.sindicalizacao")} valor={t(sim ? "rhNova.simNao.sim" : "rhNova.simNao.nao")} />
          {sim && <Linha rotulo={t("hr.pendencias.campo.sindicato")} valor={sindicalizacao.sindicato} />}
          {sim && (
            <Linha
              rotulo={t("rhNova.f.quota")}
              valor={sindicalizacao.quota_percentagem === null ? null : `${sindicalizacao.quota_percentagem} %`}
            />
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
