/**
 * A lista de pessoas -- o ecra "Organizacao" do modulo de RH.
 *
 * Tres sub-separadores: Pessoas, Organograma e Funcoes.
 *
 * "Atividade" e "Equipas" NAO existem: nao foram pedidos e foram retirados.
 * Organograma e Funcoes deixaram de ser estados vazios -- o primeiro desenha a
 * arvore de chefia sobre `pessoas.reporta_a_pessoa_id` e remete para o
 * organograma de EMPRESAS que ja existe (`/org-chart`); o segundo lista os
 * cargos em uso e remete para o ecra de Papeis que ja existe (`/roles`).
 *
 * O separador vive no URL (`?tab=`), no padrao de CampaignDetail: recarregar a
 * pagina ou partilhar o link nao perde o separador aberto -- que e a regra de
 * URL-as-state deste projecto.
 *
 * DOIS ESTADOS INDEPENDENTES NA TABELA
 * ------------------------------------
 * "Estado do acesso" (tem conta ligada?) e "Estado do contrato" sao ciclos de
 * vida separados e vem de sitios diferentes: o primeiro de `pessoas_contas`, o
 * segundo da coluna `estado_contrato`. Uma pessoa com contrato em curso pode
 * nao ter conta nenhuma, e revogar a conta nao termina contrato nenhum.
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IdCard, Network, Plus, Search, UserMinus, UserPlus, Users } from "lucide-react";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { PessoaFormDialog } from "@/components/hr/PessoaFormDialog";
import { PessoasFuncoesTab } from "@/components/hr/PessoasFuncoesTab";
import { PessoasOrganogramaTab } from "@/components/hr/PessoasOrganogramaTab";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useLocaisTrabalho } from "@/hooks/useLocaisTrabalho";
import { usePessoas } from "@/hooks/usePessoas";
import { useTranslation } from "@/hooks/useTranslation";
import type { PessoaListItem } from "@/types/hr";

const SUBTABS = [
  { value: "pessoas", labelKey: "hr.subtabs.pessoas", icon: Users },
  { value: "organograma", labelKey: "hr.subtabs.organograma", icon: Network },
  { value: "funcoes", labelKey: "hr.subtabs.funcoes", icon: IdCard },
] as const;

function EstadoAcessoBadge({ pessoa }: { pessoa: PessoaListItem }) {
  const { t } = useTranslation();
  const variante = pessoa.estadoAcesso === "ativo" ? "default" : "outline";
  return (
    <Badge variant={variante} className="font-normal">
      {t(`hr.estadoAcesso.${pessoa.estadoAcesso}`)}
    </Badge>
  );
}

export default function Pessoas() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "pessoas";

  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const canCreate = hasPermission("hr.pessoas.create");

  const { pessoas, stats, loading, error, criarPessoa } = usePessoas();
  const { locais } = useLocaisTrabalho();
  const nomeDoLocal = (localId: string | null) =>
    localId ? (locais.find((local) => local.id === localId)?.nome ?? null) : null;
  const [procura, setProcura] = useState("");
  const [dialogoAberto, setDialogoAberto] = useState(false);

  const filtradas = useMemo(() => {
    const termo = procura.trim().toLowerCase();
    if (termo === "") return pessoas;
    return pessoas.filter((pessoa) =>
      [pessoa.nome_completo, pessoa.nome_social, pessoa.cargo, pessoa.numero_interno]
        .filter(Boolean)
        .some((campo) => (campo as string).toLowerCase().includes(termo)),
    );
  }, [pessoas, procura]);

  const cartoes = [
    { key: "activos", labelKey: "hr.stats.activos", valor: stats.activos, icon: Users },
    {
      key: "entradas",
      labelKey: "hr.stats.entradas90d",
      valor: stats.entradas90d,
      icon: UserPlus,
    },
    { key: "saidas", labelKey: "hr.stats.saidas90d", valor: stats.saidas90d, icon: UserMinus },
  ] as const;

  if (companyLoading || permissionsLoading) {
    return <OlyviaLoader />;
  }

  if (!activeCompany) {
    return <NoOrganizationState />;
  }

  const mudarTab = (valor: string) =>
    setSearchParams(
      (anterior) => {
        const proximos = new URLSearchParams(anterior);
        proximos.set("tab", valor);
        return proximos;
      },
      { replace: true },
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("hr.pessoas.title")}</h1>
          <p className="text-muted-foreground">{t("hr.pessoas.subtitle")}</p>
        </div>
        {canCreate && (
          <Button onClick={() => setDialogoAberto(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            {t("hr.pessoas.new")}
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={mudarTab} className="space-y-4">
        <TabsList>
          {SUBTABS.map(({ value, labelKey, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="gap-2">
              <Icon className="h-4 w-4" />
              {t(labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="pessoas" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {cartoes.map(({ key, labelKey, valor, icon: Icon }) => (
              <Card key={key}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t(labelKey)}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">{valor}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
              placeholder={t("hr.pessoas.search")}
            />
          </div>

          {error && (
            <Card className="border-destructive/40">
              <CardContent className="py-4 text-sm text-destructive">
                {t("hr.erros.carregarLista")} — {error}
              </CardContent>
            </Card>
          )}

          {loading ? (
            <OlyviaLoader />
          ) : filtradas.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {procura.trim() === "" ? t("employees.empty") : t("hr.pessoas.emptyFiltered")}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("hr.columns.colaborador")}</TableHead>
                        <TableHead>{t("hr.columns.cargo")}</TableHead>
                        <TableHead>{t("hr.columns.local")}</TableHead>
                        <TableHead>{t("hr.columns.contratacao")}</TableHead>
                        <TableHead>{t("hr.columns.estadoAcesso")}</TableHead>
                        <TableHead>{t("hr.columns.estadoContrato")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtradas.map((pessoa) => (
                        <TableRow
                          key={pessoa.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/rh/pessoas/${pessoa.id}`)}
                        >
                          <TableCell>
                            <div className="font-medium">
                              {pessoa.nome_social || pessoa.nome_completo}
                            </div>
                            {pessoa.email_trabalho && (
                              <div className="text-xs text-muted-foreground">
                                {pessoa.email_trabalho}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{pessoa.cargo ?? "—"}</TableCell>
                          {/* `local_id` e a fonte de verdade; `local_trabalho`
                              e a legenda legada da ronda 1 e serve de recurso
                              enquanto nao houver local escolhido. */}
                          <TableCell>
                            {nomeDoLocal(pessoa.local_id) ?? pessoa.local_trabalho ?? "—"}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {pessoa.data_admissao ?? "—"}
                          </TableCell>
                          <TableCell>
                            <EstadoAcessoBadge pessoa={pessoa} />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                pessoa.estado_contrato === "em_curso" ? "secondary" : "outline"
                              }
                              className="font-normal"
                            >
                              {t(`hr.estadoContrato.${pessoa.estado_contrato}`)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="organograma">
          <PessoasOrganogramaTab pessoas={pessoas} loading={loading} error={error} />
        </TabsContent>

        <TabsContent value="funcoes">
          <PessoasFuncoesTab pessoas={pessoas} loading={loading} />
        </TabsContent>
      </Tabs>

      {canCreate && (
        <PessoaFormDialog
          open={dialogoAberto}
          onOpenChange={setDialogoAberto}
          colegas={pessoas.map((pessoa) => ({
            id: pessoa.id,
            nome_completo: pessoa.nome_completo,
          }))}
          onCriar={criarPessoa}
          onCriada={(id) => navigate(`/rh/pessoas/${id}`)}
        />
      )}
    </div>
  );
}
