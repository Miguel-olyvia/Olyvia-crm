/**
 * Resumo SO DE LEITURA da contratacao e da saida da pessoa, calculadas pelos contratos (`datasDaPessoa`, a mesma regra do
 * servidor). Nao tem campos: as datas mudam-se nas datas do contrato, acima. Sem contrato vivo, a contratacao e provisoria
 * (a que a pessoa tem desde a criacao) e diz-se que falta o contrato.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarRange } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { datasDaPessoa } from "@/components/rh-exemplo/hooks/datasDaPessoaReal";
import type { PessoaVinculo } from "@/components/rh-exemplo/tipos";

interface ContratoDatasDaPessoaProps {
  vinculos: readonly PessoaVinculo[];
  /** `pessoas.data_admissao` enquanto nao ha contrato: provisoria. */
  dataAdmissaoProvisoria: string | null;
  /** `pessoas.data_saida`: sem contrato vivo a base mantem-na (barreira de acesso), por isso o resumo mostra-a. */
  dataSaidaGravada?: string | null;
  /** `pessoas.data_antiguidade`: com so contratos `futuro` depois de uma saida, as tres datas ficam como estao gravadas. */
  dataAntiguidadeGravada?: string | null;
  /** Os contratos ainda a carregar: nao se sabe se falta contrato, por isso nao se avisa (nao pisca). */
  carregando?: boolean;
}

export function ContratoDatasDaPessoa({ vinculos, dataAdmissaoProvisoria, dataSaidaGravada = null, dataAntiguidadeGravada = null, carregando = false }: ContratoDatasDaPessoaProps) {
  const { t } = useTranslation();
  const datas = datasDaPessoa(vinculos, {
    contratacao: dataAdmissaoProvisoria, antiguidade: dataAntiguidadeGravada, saida: dataSaidaGravada,
  });
  // Provisoria so se ha uma admissao provisoria: pessoa nova sem contrato nem admissao mostra tudo vazio.
  const semContrato = datas.data_admissao === null && !carregando && dataAdmissaoProvisoria !== null;
  const vazio = t("hr.campos.semValor");
  return (
    <Card data-testid="resumo-datas-pessoa">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          {t("hr.contrato.datasPessoa.titulo")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1">
            <dt className="text-sm text-muted-foreground">{t("hr.contrato.datasPessoa.contratacao")}</dt>
            <dd className="text-sm font-medium tabular-nums">
              {datas.data_admissao ?? (semContrato ? (dataAdmissaoProvisoria ?? vazio) : vazio)}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-sm text-muted-foreground">{t("hr.contrato.datasPessoa.saida")}</dt>
            <dd className="text-sm font-medium tabular-nums" data-testid="resumo-data-saida">
              {datas.data_saida ?? vazio}
            </dd>
          </div>
        </dl>
        {/* Fora da <dl>: uma lista de definicoes so tem termos e definicoes. */}
        {semContrato && (
          <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
            {t("hr.contrato.datasPessoa.provisoria")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {semContrato ? t("hr.contrato.datasPessoa.provisoriaAjuda") : t("hr.contrato.datasPessoa.ajuda")}
        </p>
      </CardContent>
    </Card>
  );
}
