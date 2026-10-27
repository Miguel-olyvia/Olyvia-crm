// A aba «Calendário»: o mês da pessoa dia a dia, com o botão do relatório mensal.
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarioPessoa, type MesVisivel } from "@/components/rh-exemplo/calendarioPessoa/CalendarioPessoa";
import type { AssiduidadeDoMes } from "@/components/rh-exemplo/calendarioPessoa/fonteMes";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  pessoaId: string;
  pessoaNome: string;
  mes: MesVisivel;
  aoMudarMes: (mes: MesVisivel) => void;
  souAPessoa: boolean;
  permissoes: PermissoesAssiduidade;
  aoAbrirRegisto: (data: string) => void;
  aoAbrirRelatorio: () => void;
  assiduidade: AssiduidadeDoMes;
  dataAdmissao?: string | null;
}

export function AbaCalendario({
  pessoaId, pessoaNome, mes, aoMudarMes, souAPessoa, permissoes, aoAbrirRegisto, aoAbrirRelatorio, assiduidade, dataAdmissao = null,
}: Props) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("rhCal.titulo")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CalendarioPessoa
          pessoaId={pessoaId} pessoaNome={pessoaNome} mes={mes} aoMudarMes={aoMudarMes} souAPessoa={souAPessoa}
          permissoes={permissoes} aoAbrirRegisto={aoAbrirRegisto} assiduidade={assiduidade} dataAdmissao={dataAdmissao}
          acoes={
            <Button type="button" variant="outline" className="min-h-11" onClick={aoAbrirRelatorio}>
              {t("rhExemplo.relatorio.abrir")}
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}
