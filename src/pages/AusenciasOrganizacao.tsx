/**
 * As ausencias de toda a gente -- a vista de gestao.
 *
 * Dois separadores: o mapa de ausencias e ferias (com um alternador Mes/Ano
 * dentro) e a lista completa de pedidos com filtros. No modo Mes ve-se a
 * grelha com uma linha por pessoa (ou so a pessoa escolhida, se houver uma);
 * no modo Ano, com uma pessoa escolhida, ve-se o calendario anual dela
 * (reaproveita `CalendarioAnual`, o mesmo componente da ficha individual), e
 * com "Todos" ve-se `MapaMensal` repetido doze vezes, uma por mes do ano --
 * `CalendarioAnual` e feito para uma pessoa so, e nao ha vista equivalente
 * para toda a gente. Um filtro por tipo de ausencia, comum aos dois modos,
 * filtra os `dias` antes de chegarem a qualquer um dos dois componentes. De
 * qualquer um se abre o detalhe do pedido, e dai se salta para a ficha da
 * pessoa.
 *
 * Uma lista vazia aqui NAO prova que nao ha pedidos: a RLS pode estar a
 * esconder tudo. Por isso o hook devolve `recusado` a parte, e o ecra mostra o
 * bloco de sem acesso em vez de "nao ha nada".
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { de, enUS, es, fr, pt } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import { CalendarioAnual } from "@/components/hr/ausencias/CalendarioAnual";
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

const LOCALES: Record<string, Locale> = { en: enUS, pt, es, fr, de };
type Locale = typeof enUS;

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

type ModoMapa = "mes" | "ano";

interface OrganizacaoConteudoProps {
  /**
   * Nome do parametro de URL usado para o sub-separador (mapa/pedidos).
   * Configuravel pela mesma razao que em `AprovacoesConteudo`: dentro de
   * `AusenciasGestao`, "tab" ja identifica o separador de topo.
   */
  tabParam?: string;
}

/**
 * So o conteudo (sem h1/descricao de pagina): usado standalone abaixo e
 * tambem dentro de `AusenciasGestao.tsx`, que fornece o proprio titulo.
 */
export function OrganizacaoConteudo({ tabParam = "tab" }: OrganizacaoConteudoProps) {
  const { t, language } = useTranslation();
  const locale = LOCALES[language] ?? enUS;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get(tabParam) || "mapa";

  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { pessoas } = usePessoas();
  const minha = useMinhaPessoa();
  const tipos = useAusenciasTipos();

  const [mes, setMes] = useState(mesDeHoje);
  const dados = useAusenciasDaOrganizacao({ anoDoMapa: Number(mes.slice(0, 4)) });

  const [modoMapa, setModoMapa] = useState<ModoMapa>("mes");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroTipoMapa, setFiltroTipoMapa] = useState("");
  const [pedidoAberto, setPedidoAberto] = useState<string | null>(null);
  const [feriados, setFeriados] = useState(() => indexarFeriados([]));
  const [pessoaAnoId, setPessoaAnoId] = useState("");

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

  useEffect(() => {
    setPessoaAnoId("");
  }, [activeCompany?.id]);

  const nomePorPessoaId = useMemo(
    () => new Map(pessoas.map((pessoa) => [pessoa.id, pessoa.nome_completo])),
    [pessoas],
  );

  /**
   * O calendario anual reaproveita o ano ja carregado pelo hook (o mesmo do
   * mapa mensal, `anoDoMapa`) -- pedir outro ano exigiria outra leitura a
   * base. Trocar de ano aqui move tambem o mes do mapa, para os dois
   * separadores ficarem sempre a olhar para o mesmo ano.
   */
  const anoCalendario = Number(mes.slice(0, 4));
  const mudarAnoCalendario = (delta: number) =>
    setMes(`${anoCalendario + delta}-${mes.slice(5, 7)}-01`);

  /**
   * O filtro por tipo de ausencia vale para os dois modos do mapa (Mes e
   * Ano) e aplica-se antes do filtro por pessoa -- nem `MapaMensal` nem
   * `CalendarioAnual` sabem nada de tipo, so veem os `dias` que lhes chegam.
   */
  const diasDoMapaPorTipo = useMemo(
    () => (filtroTipoMapa ? dados.dias.filter((dia) => dia.tipo_id === filtroTipoMapa) : dados.dias),
    [dados.dias, filtroTipoMapa],
  );

  const diasDaPessoaAno = useMemo(
    () => diasDoMapaPorTipo.filter((dia) => dia.pessoa_id === pessoaAnoId),
    [diasDoMapaPorTipo, pessoaAnoId],
  );

  /**
   * No modo Mes a mesma pessoa escolhida no dropdown filtra a grelha a uma
   * linha so; sem pessoa escolhida ve-se toda a gente, como sempre foi. O
   * `MapaMensal` nao sabe nada de filtro por pessoa -- so ve os `dias` que
   * lhe chegam, por isso o filtro fica aqui.
   */
  const diasDoMapaMensal = useMemo(
    () => (pessoaAnoId ? diasDaPessoaAno : diasDoMapaPorTipo),
    [pessoaAnoId, diasDaPessoaAno, diasDoMapaPorTipo],
  );

  /**
   * No modo Ano com "Todos", `CalendarioAnual` nao serve -- e feito para UMA
   * pessoa. Em vez disso repete-se `MapaMensal` (a mesma grelha do modo Mes,
   * todas as pessoas em linhas) doze vezes, uma por mes do ano escolhido; o
   * proprio `MapaMensal` ja filtra os `dias` ao mes que recebe.
   */
  const mesesDoAno = useMemo(
    () =>
      Array.from({ length: 12 }, (_, indice) => `${anoCalendario}-${String(indice + 1).padStart(2, "0")}-01`),
    [anoCalendario],
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
        proximos.set(tabParam, valor);
        return proximos;
      },
      { replace: true },
    );

  return (
    <>
      {dados.recusado ? (
        <SemAcessoCard />
      ) : dados.loading || tipos.loading ? (
        <OlyviaLoader />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={mudarTab} className="space-y-4">
              <TabsList>
                <TabsTrigger value="mapa">{t("hr.ausencias.organizacao.mapaAusencias")}</TabsTrigger>
                <TabsTrigger value="pedidos">{t("hr.ausencias.organizacao.pedidos")}</TabsTrigger>
              </TabsList>

              <TabsContent value="mapa" className="space-y-3">
                <div className="flex flex-wrap items-end gap-4">
                  <fieldset className="space-y-1.5">
                    <legend className="text-sm font-medium">
                      {t("hr.ausencias.organizacao.modo")}
                    </legend>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={modoMapa === "mes" ? "default" : "outline"}
                        aria-pressed={modoMapa === "mes"}
                        onClick={() => setModoMapa("mes")}
                      >
                        {t("hr.ausencias.organizacao.modoMes")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={modoMapa === "ano" ? "default" : "outline"}
                        aria-pressed={modoMapa === "ano"}
                        onClick={() => setModoMapa("ano")}
                      >
                        {t("hr.ausencias.organizacao.modoAno")}
                      </Button>
                    </div>
                  </fieldset>

                  <div className="w-48">
                    <CampoSelect
                      id="hr-ausencias-org-pessoa"
                      label={t("hr.ausencias.organizacao.pessoa")}
                      valor={pessoaAnoId}
                      onChange={setPessoaAnoId}
                      vazioLabel={t("hr.ausencias.organizacao.todos")}
                      opcoes={pessoas.map((pessoa) => ({
                        value: pessoa.id,
                        label: pessoa.nome_completo,
                      }))}
                    />
                  </div>

                  <div className="w-48">
                    <CampoSelect
                      id="hr-ausencias-org-mapa-tipo"
                      label={t("hr.ausencias.lista.tipo")}
                      valor={filtroTipoMapa}
                      onChange={setFiltroTipoMapa}
                      vazioLabel={t("hr.ausencias.organizacao.todos")}
                      opcoes={tipos.tipos.map((tipo) => ({
                        value: tipo.id,
                        label: nomeTipoAusencia(tipo, t),
                      }))}
                    />
                  </div>

                  {modoMapa === "mes" ? (
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
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={t("hr.ausencias.organizacao.anoAnterior", {
                          ano: anoCalendario - 1,
                        })}
                        onClick={() => mudarAnoCalendario(-1)}
                      >
                        {anoCalendario - 1}
                      </Button>
                      <span className="text-sm font-medium tabular-nums">{anoCalendario}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={t("hr.ausencias.organizacao.anoSeguinte", {
                          ano: anoCalendario + 1,
                        })}
                        onClick={() => mudarAnoCalendario(1)}
                      >
                        {anoCalendario + 1}
                      </Button>
                    </div>
                  )}
                </div>

                {modoMapa === "mes" ? (
                  <MapaMensal
                    mes={mes}
                    dias={diasDoMapaMensal}
                    tiposPorId={tipos.porId}
                    nomePorPessoaId={nomePorPessoaId}
                    feriados={feriados}
                    onAbrirPedido={setPedidoAberto}
                  />
                ) : pessoaAnoId ? (
                  <CalendarioAnual
                    ano={anoCalendario}
                    dias={diasDaPessoaAno}
                    tiposPorId={tipos.porId}
                    feriados={feriados}
                    onAbrirPedido={setPedidoAberto}
                  />
                ) : (
                  <div className="space-y-4">
                    {mesesDoAno.map((mesDoAno) => (
                      <div key={mesDoAno} className="space-y-1.5">
                        <p className="text-sm font-medium capitalize">
                          {format(new Date(`${mesDoAno}T12:00:00Z`), "LLLL yyyy", { locale })}
                        </p>
                        <MapaMensal
                          mes={mesDoAno}
                          dias={diasDoMapaPorTipo}
                          tiposPorId={tipos.porId}
                          nomePorPessoaId={nomePorPessoaId}
                          feriados={feriados}
                          onAbrirPedido={setPedidoAberto}
                        />
                      </div>
                    ))}
                  </div>
                )}
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
            pedidos={dados.pedidos}
            permissoes={{
              aprovarChefia: hasPermission("hr.ausencias.aprovar.chefia"),
              aprovarRh: hasPermission("hr.ausencias.aprovar.rh"),
              editarHistorico: hasPermission("hr.ausencias.historico.editar"),
              verJustificacao: hasPermission("hr.ausencias.justificacao.view"),
              // Sem `onIniciarAlteracao` (este ecra nao tem a RPC de
              // alteracao ligada -- so a ficha da pessoa tem): o botao nunca
              // aparece aqui, mesmo que a permissao exista.
              pedir: hasPermission("hr.ausencias.pedir"),
              pedirOutros: hasPermission("hr.ausencias.pedir.outros"),
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
    </>
  );
}

