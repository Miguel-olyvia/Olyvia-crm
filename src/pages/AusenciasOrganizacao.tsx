/**
 * As ausencias de toda a gente -- a vista de gestao.
 *
 * Dois separadores: o mapa do mes (uma linha por pessoa) e a lista completa de
 * pedidos com filtros. De qualquer um se abre o detalhe do pedido, e dai se
 * salta para a ficha da pessoa.
 *
 * Uma lista vazia aqui NAO prova que nao ha pedidos: a RLS pode estar a
 * esconder tudo. Por isso o hook devolve `recusado` a parte, e o ecra mostra o
 * bloco de sem acesso em vez de "nao ha nada".
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import { MapaMensal } from "@/components/hr/ausencias/MapaMensal";
import { PedidoDetalheSheet } from "@/components/hr/ausencias/PedidoDetalheSheet";
import { PedidosLista } from "@/components/hr/ausencias/PedidosLista";
import { CampoSelect } from "@/components/hr/form/Campos";
import { useAusenciasDaOrganizacao } from "@/hooks/useAusenciasDaOrganizacao";
import { useAusenciasTipos } from "@/hooks/useAusenciasTipos";
import { useCompany } from "@/contexts/CompanyContext";
import { useMinhaPessoa } from "@/hooks/useMinhaPessoa";
import { usePermissions } from "@/hooks/usePermissions";
import { usePessoas } from "@/hooks/usePessoas";
import { useTranslation } from "@/hooks/useTranslation";
import { indexarFeriados, nomeTipoAusencia, type FeriadoOrg } from "@/lib/hr/ausencias";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { useEffect } from "react";
import type { EstadoPedido } from "@/types/hrAusencias";

const ESTADOS: EstadoPedido[] = [
  "pendente_chefia",
  "pendente_rh",
  "aprovado",
  "recusado",
  "cancelado",
];

function mesDeHoje(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function AusenciasOrganizacao() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "mapa";

  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { pessoas } = usePessoas();
  const minha = useMinhaPessoa();
  const tipos = useAusenciasTipos();

  const [mes, setMes] = useState(mesDeHoje);
  const dados = useAusenciasDaOrganizacao({ anoDoMapa: Number(mes.slice(0, 4)) });

  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [pedidoAberto, setPedidoAberto] = useState<string | null>(null);
  const [feriados, setFeriados] = useState(() => indexarFeriados([]));

  useEffect(() => {
    const orgId = activeCompany?.id;
    if (!orgId) return;
    void (async () => {
      const { data, error } = await hrFrom("schedule_holidays")
        .select("holiday_date, is_recurring")
        .eq("organization_id", orgId);
      if (error) {
        if (!isPermissionError(error)) captureFlowError(error, "hr-ausencias-load");
        return;
      }
      setFeriados(indexarFeriados((data ?? []) as FeriadoOrg[]));
    })();
  }, [activeCompany?.id]);

  const nomePorPessoaId = useMemo(
    () => new Map(pessoas.map((pessoa) => [pessoa.id, pessoa.nome_completo])),
    [pessoas],
  );

  const filtrados = useMemo(
    () =>
      dados.pedidos.filter(
        (pedido) =>
          (filtroEstado === "" || pedido.estado === filtroEstado) &&
          (filtroTipo === "" || pedido.tipo_id === filtroTipo),
      ),
    [dados.pedidos, filtroEstado, filtroTipo],
  );

  const pedidoSeleccionado = useMemo(
    () => dados.pedidos.find((pedido) => pedido.id === pedidoAberto) ?? null,
    [dados.pedidos, pedidoAberto],
  );

  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (!hasPermission("hr.ausencias.view")) return <SemAcessoCard className="m-6" />;

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
        <h1 className="text-xl font-semibold">{t("hr.ausencias.organizacao.titulo")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("hr.ausencias.organizacao.descricao")}
        </p>
      </div>

      {dados.recusado ? (
        <SemAcessoCard />
      ) : dados.loading || tipos.loading ? (
        <OlyviaLoader />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={mudarTab} className="space-y-4">
              <TabsList>
                <TabsTrigger value="mapa">{t("hr.ausencias.organizacao.mapa")}</TabsTrigger>
                <TabsTrigger value="pedidos">{t("hr.ausencias.organizacao.pedidos")}</TabsTrigger>
              </TabsList>

              <TabsContent value="mapa" className="space-y-3">
                <div className="flex items-end gap-2">
                  <div className="w-48">
                    <label
                      htmlFor="hr-ausencias-org-mes"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      {t("hr.ausencias.organizacao.mes")}
                    </label>
                    <input
                      id="hr-ausencias-org-mes"
                      type="month"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={mes.slice(0, 7)}
                      onChange={(evento) => setMes(`${evento.target.value}-01`)}
                    />
                  </div>
                </div>
                <MapaMensal
                  mes={mes}
                  dias={dados.dias}
                  tiposPorId={tipos.porId}
                  nomePorPessoaId={nomePorPessoaId}
                  feriados={feriados}
                  onAbrirPedido={setPedidoAberto}
                />
              </TabsContent>

              <TabsContent value="pedidos" className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <CampoSelect
                    id="hr-ausencias-org-estado"
                    label={t("hr.ausencias.lista.estado")}
                    valor={filtroEstado}
                    onChange={setFiltroEstado}
                    vazioLabel={t("hr.ausencias.organizacao.todos")}
                    opcoes={ESTADOS.map((estado) => ({
                      value: estado,
                      label: t(`hr.ausencias.estado.${estado}`),
                    }))}
                  />
                  <CampoSelect
                    id="hr-ausencias-org-tipo"
                    label={t("hr.ausencias.lista.tipo")}
                    valor={filtroTipo}
                    onChange={setFiltroTipo}
                    vazioLabel={t("hr.ausencias.organizacao.todos")}
                    opcoes={tipos.tipos.map((tipo) => ({ value: tipo.id, label: nomeTipoAusencia(tipo, t) }))}
                  />
                </div>
                <PedidosLista
                  pedidos={filtrados}
                  tiposPorId={tipos.porId}
                  nomePorPessoaId={nomePorPessoaId}
                  vazioTexto={t("hr.ausencias.organizacao.semPedidos")}
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
              aprovarChefia: hasPermission("hr.ausencias.aprovar.chefia"),
              aprovarRh: hasPermission("hr.ausencias.aprovar.rh"),
              editarHistorico: hasPermission("hr.ausencias.historico.editar"),
              verJustificacao: hasPermission("hr.ausencias.justificacao.view"),
            }}
            onFechar={() => setPedidoAberto(null)}
            onDecidirChefia={dados.decidirChefia}
            onDecidirRh={dados.decidirRh}
            onCancelar={dados.cancelar}
            onCorrigirAprovado={dados.corrigirAprovado}
            onVerMotivo={dados.verMotivo}
            onIrParaFicha={() => navigate(`/rh/pessoas/${pedidoSeleccionado.pessoa_id}`)}
          />
      )}
    </div>
  );
}
