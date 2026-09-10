/**
 * O separador Funcoes: os CARGOS de RH em uso, e um atalho para os GRUPOS DE
 * PERMISSOES -- que sao outra coisa.
 *
 * DOIS CONCEITOS QUE NAO SE MISTURAM
 * ----------------------------------
 * "Cargo" e o que a pessoa faz (`pessoas.cargo`, e o vinculo laboral em
 * `pessoas_vinculos`). "Papel" e o que a pessoa pode ver na aplicacao
 * (`anew_roles`, editado em `/roles` por `rpc_create_role` e companhia).
 *
 * Por isso este separador NAO embute o ecra de Papeis: (a) sao conceitos
 * diferentes e junta-los faz confundir permissao com cargo; (b) esse ecra e
 * monolitico, com o catalogo de permissoes por categorias no proprio ficheiro,
 * e nao ha componente extraivel sem um refactor grande; (c) esta protegido por
 * `roles.view` -- embuti-lo aqui daria, a quem so tem permissao de RH, a
 * superficie de edicao das permissoes do sistema.
 *
 * O atalho para `/roles` so aparece a quem tem `roles.view`.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IdCard, ShieldCheck } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import type { PessoaListItem } from "@/types/hr";

interface PessoasFuncoesTabProps {
  pessoas: PessoaListItem[];
  loading: boolean;
}

interface LinhaDeCargo {
  cargo: string;
  total: number;
  emCurso: number;
}

export function PessoasFuncoesTab({ pessoas, loading }: PessoasFuncoesTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const podeVerPapeis = hasPermission("roles.view");
  const podeVerVinculos = hasPermission("hr.pessoas.vinculos.view");

  const cargos = useMemo<LinhaDeCargo[]>(() => {
    const contagem = new Map<string, LinhaDeCargo>();
    for (const pessoa of pessoas) {
      const cargo = pessoa.cargo?.trim() || "";
      const chave = cargo === "" ? "__sem_cargo__" : cargo;
      const linha = contagem.get(chave) ?? { cargo: chave, total: 0, emCurso: 0 };
      linha.total += 1;
      if (pessoa.estado_contrato_derivado === "em_curso") linha.emCurso += 1;
      contagem.set(chave, linha);
    }
    return [...contagem.values()].sort((a, b) => b.total - a.total);
  }, [pessoas]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <IdCard className="h-4 w-4 text-muted-foreground" />
            {t("hr.funcoes.cargosTitulo")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-8">
              <OlyviaLoader />
            </div>
          ) : cargos.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">{t("employees.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("hr.columns.cargo")}</TableHead>
                    <TableHead className="w-32">{t("hr.funcoes.pessoas")}</TableHead>
                    {podeVerVinculos && (
                      <TableHead className="w-32">{t("hr.estadoContrato.em_curso")}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cargos.map((linha) => (
                    <TableRow key={linha.cargo}>
                      <TableCell>
                        {linha.cargo === "__sem_cargo__" ? (
                          <span className="text-muted-foreground">
                            {t("hr.funcoes.semCargo")}
                          </span>
                        ) : (
                          linha.cargo
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{linha.total}</TableCell>
                      {podeVerVinculos && (
                        <TableCell className="tabular-nums">{linha.emCurso}</TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            {t("hr.funcoes.papeisTitulo")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("hr.funcoes.papeisExplicacao")}</p>
          {podeVerPapeis ? (
            <Button variant="outline" size="sm" onClick={() => navigate("/roles")}>
              {t("hr.funcoes.gerirEmPapeis")}
            </Button>
          ) : (
            <Badge variant="outline" className="font-normal">
              {t("hr.semAcesso")}
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
