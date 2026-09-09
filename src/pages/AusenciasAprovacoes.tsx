/**
 * A caixa de entrada de quem decide -- chefia e RH no MESMO ecra.
 *
 * PORQUE E QUE OS DOIS PAPEIS PARTILHAM O ECRA
 * --------------------------------------------
 * Uma pessoa pode ser chefe de uma equipa E estar no RH. Se fossem dois ecras,
 * essa pessoa andava a saltar entre eles para nao perder pedidos. Aqui a lista
 * e uma so e cada linha diz em que passo esta; as accoes disponiveis no
 * detalhe e que mudam conforme a permissao e o passo.
 *
 * A LISTA NAO E FILTRADA POR NOS
 * ------------------------------
 * Quem ve o que decide-o a RLS: `hr.ausencias.view` ve a organizacao toda, e a
 * chefia ve a sua cadeia por `hr_ausencias_pessoa_na_minha_cadeia`. Repetir a
 * regra no cliente daria duas versoes da mesma coisa.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import { PedidoDetalheSheet } from "@/components/hr/ausencias/PedidoDetalheSheet";
import { PedidosLista } from "@/components/hr/ausencias/PedidosLista";
import { useAusenciasDaOrganizacao } from "@/hooks/useAusenciasDaOrganizacao";
import { useAusenciasTipos } from "@/hooks/useAusenciasTipos";
import { useCompany } from "@/contexts/CompanyContext";
import { useMinhaPessoa } from "@/hooks/useMinhaPessoa";
import { usePermissions } from "@/hooks/usePermissions";
import { usePessoas } from "@/hooks/usePessoas";
import { useTranslation } from "@/hooks/useTranslation";

export default function AusenciasAprovacoes() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "aDecidir";

  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const dados = useAusenciasDaOrganizacao();
  const tipos = useAusenciasTipos();
  const { pessoas } = usePessoas();
  const minha = useMinhaPessoa();

  const podeChefia = hasPermission("hr.ausencias.aprovar.chefia");
  const podeRh = hasPermission("hr.ausencias.aprovar.rh");

  const [pedidoAberto, setPedidoAberto] = useState<string | null>(null);

  const nomePorPessoaId = useMemo(
    () => new Map(pessoas.map((pessoa) => [pessoa.id, pessoa.nome_completo])),
    [pessoas],
  );

  const aDecidir = useMemo(
    () =>
      dados.pendentes.filter((pedido) =>
        pedido.estado === "pendente_chefia" ? podeChefia : podeRh,
      ),
    [dados.pendentes, podeChefia, podeRh],
  );

  const jaDecididos = useMemo(
    () =>
      dados.pedidos.filter(
        (pedido) => pedido.estado !== "pendente_chefia" && pedido.estado !== "pendente_rh",
      ),
    [dados.pedidos],
  );

  const pedidoSeleccionado = useMemo(
    () => dados.pedidos.find((pedido) => pedido.id === pedidoAberto) ?? null,
    [dados.pedidos, pedidoAberto],
  );

  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (!podeChefia && !podeRh) return <SemAcessoCard className="m-6" />;

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
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">{t("hr.ausencias.aprovacoes.titulo")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("hr.ausencias.aprovacoes.descricao")}
        </p>
      </div>

      {dados.recusado ? (
        <SemAcessoCard />
      ) : dados.loading || tipos.loading ? (
        <OlyviaLoader />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t("hr.ausencias.aprovacoes.aDecidirContagem", { total: aDecidir.length })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={mudarTab} className="space-y-3">
              <TabsList>
                <TabsTrigger value="aDecidir">
                  {t("hr.ausencias.aprovacoes.aDecidir")}
                </TabsTrigger>
                <TabsTrigger value="decididos">
                  {t("hr.ausencias.aprovacoes.decididos")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="aDecidir">
                <PedidosLista
                  pedidos={aDecidir}
                  tiposPorId={tipos.porId}
                  nomePorPessoaId={nomePorPessoaId}
                  vazioTexto={t("hr.ausencias.aprovacoes.nadaAEspera")}
                  onAbrir={setPedidoAberto}
                />
              </TabsContent>

              <TabsContent value="decididos">
                <PedidosLista
                  pedidos={jaDecididos}
                  tiposPorId={tipos.porId}
                  nomePorPessoaId={nomePorPessoaId}
                  vazioTexto={t("hr.ausencias.aprovacoes.semDecididos")}
                  onAbrir={setPedidoAberto}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {pedidoSeleccionado && (
        <PedidoDetalheSheet
          pedido={pedidoSeleccionado}
          decisoes={dados.decisoesPorPedido.get(pedidoSeleccionado.id) ?? []}
          tipo={tipos.porId.get(pedidoSeleccionado.tipo_id) ?? null}
          pessoaNome={nomePorPessoaId.get(pedidoSeleccionado.pessoa_id) ?? "—"}
          nomePorPessoaId={nomePorPessoaId}
          souOAutor={minha.pessoaId === pedidoSeleccionado.pessoa_id}
          saving={dados.saving}
          permissoes={{
            aprovarChefia: podeChefia,
            aprovarRh: podeRh,
            editarHistorico: hasPermission("hr.ausencias.historico.editar"),
            verJustificacao: hasPermission("hr.ausencias.justificacao.view"),
          }}
          onFechar={() => setPedidoAberto(null)}
          onDecidirChefia={dados.decidirChefia}
          onDecidirRh={dados.decidirRh}
          onCancelar={dados.cancelar}
          onCorrigirAprovado={dados.corrigirAprovado}
        />
      )}
    </div>
  );
}
