/**
 * A lista de pessoas -- o ecra "Pessoas" do modulo de RH, no mesmo padrao da lista de Pessoas do resto da aplicacao:
 * linhas compactas, chips de filtro e um unico botao primario ("Nova pessoa"). Clicar numa linha abre a ficha num painel
 * lateral por cima da lista (nao muda de pagina); "Nova pessoa" abre outro painel lateral.
 *
 * Quatro sub-separadores: Pessoas, Admissões (o pipeline de quem está a entrar), Cargos e (com `hr.pessoas.vinculos.view`)
 * Contratos a terminar.
 * O organograma (com as pessoas e as chefias) vive na página Organização; o antigo `?tab=organograma` redireciona para lá.
 * O separador vive no URL (`?tab=`). A ficha vive no caminho (`/rh-exemplo/pessoas/:id`, que continua a ser uma ligacao
 * direta: abre a lista com a ficha aberta) e abrir, passar a outra pessoa ou fechar atualiza o endereco sem remontar a pagina.
 *
 * RH e a pessoa como TRABALHADORA (filial, contrato, horario); o "estado do acesso" (tem conta ligada?) e o "estado do
 * contrato" sao ciclos de vida separados. A coluna do contrato so se mostra a quem tem `hr.pessoas.vinculos.view`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Aba, ListaAbas } from "@/components/ficha-comum/AbasSublinhadas";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { PipelineAdmissoes } from "@/components/rh-exemplo/hooks/PipelineAdmissoesReal";
import { useEstadoAdmissaoPorPessoa } from "@/components/rh-exemplo/hooks/useEstadoAdmissaoPorPessoa";
import { ContratosATerminarTab } from "@/components/rh-exemplo/fimContrato/ContratosATerminarTab";
import { ehAbaFicha } from "@/components/rh-exemplo/ficha/abas";
import { FichaPessoaRh } from "@/components/rh-exemplo/ficha/FichaPessoaRh";
import { BarraListaRh } from "@/components/rh-exemplo/lista/BarraListaRh";
import { contagens, filtrar, type FiltroAcesso } from "@/components/rh-exemplo/lista/filtros";
import { TabelaPessoasRh } from "@/components/rh-exemplo/lista/TabelaPessoasRh";
import { caminhoDaFicha } from "@/components/rh-exemplo/lista/urlFicha";
import { NovaPessoaDialogo } from "@/components/rh-exemplo/NovaPessoaDialogo";
import { PessoasFuncoesTab } from "@/components/rh-exemplo/PessoasFuncoesTab";
import { SeloExemplo } from "@/components/rh-exemplo/SeloExemplo";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useLocaisTrabalho } from "@/components/rh-exemplo/hooks/useLocaisTrabalho";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import { usePessoas } from "@/components/rh-exemplo/hooks/usePessoas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

const SUBTABS = [
  { value: "pessoas", labelKey: "hr.subtabs.pessoas" },
  { value: "admissoes", labelKey: "rhAdm.tab" },
  { value: "cargos", labelKey: "hr.subtabs.cargos" },
  // So com hr.pessoas.vinculos.view: a lista de contratos a terminar le contratos.
  { value: "contratos", labelKey: "hr.subtabs.contratos" },
] as const;

/** O organograma de pessoas passou para a página Organização, que já mostra as pessoas dentro da estrutura. */
const ORGANIZACAO_URL = "/rh-exemplo/organizacao";

interface FichaAberta {
  id: string | null;
  aberta: boolean;
}

const SUBTAB_INICIAL = "pessoas";

interface CabecalhoProps {
  podeCriar: boolean;
  podeGerirAdmissao: boolean;
  podeGerirRegrasFimContrato: boolean;
  resumo: string;
  aoCriar: () => void;
}

function CabecalhoPessoasRh({ podeCriar, podeGerirAdmissao, podeGerirRegrasFimContrato, resumo, aoCriar }: CabecalhoProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Os dois ecrãs de configuração não têm entrada no menu: abrem daqui, ao lado de «Nova pessoa», atrás da mesma permissão
  // que protege cada rota (`hr.admissao.obrigatorios.gerir` e `hr.contratos.regras.gerir`).
  const botoesConfiguracao = [
    { mostrar: podeGerirAdmissao, caminho: "/rh-exemplo/admissao/configuracao", chave: "rhA.pessoas.camposAdmissao" },
    { mostrar: podeGerirRegrasFimContrato, caminho: "/rh-exemplo/contratos/configuracao", chave: "rhA.pessoas.regrasFimContrato" },
  ].filter((c) => c.mostrar);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold">
          {t("hr.pessoas.title")}
          <SeloExemplo />
        </h1>
        <p className="text-muted-foreground">{t("rhForm.lista.sub")}</p>
        <p className="text-sm tabular-nums text-muted-foreground">{resumo}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {botoesConfiguracao.map(({ caminho, chave }) => (
          <Button key={caminho} type="button" variant="outline" onClick={() => navigate(caminho)} className={cn("min-h-11 gap-2", FOCO)}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            {t(chave)}
          </Button>
        ))}
        {podeCriar && (
          <Button type="button" onClick={aoCriar} className={cn("min-h-11 gap-2", FOCO)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("hr.pessoas.new")}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function PessoasRh({ pessoaIdInicial }: { pessoaIdInicial?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabDoUrl = searchParams.get("tab");
  const abaDoUrl = searchParams.get("aba");

  // Ligacao antiga com ficha no caminho (`/pessoas/:id?tab=laborais`, `?tab=contratos`): o ?tab= que e aba da ficha escolhe a
  // aba da ficha, uma so vez (e passa a ?aba=). E o que fazem «Fichas sem cargo» e «Contratos a terminar».
  const [abaLegada] = useState<string | undefined>(() =>
    pessoaIdInicial !== undefined && tabDoUrl !== null && ehAbaFicha(tabDoUrl) ? tabDoUrl : undefined,
  );
  const abaGasta = useRef(false);
  const aGastarAba = !abaGasta.current && abaLegada !== undefined && tabDoUrl === abaLegada;
  useEffect(() => {
    if (!aGastarAba) return;
    abaGasta.current = true;
    setSearchParams(
      (anterior) => {
        const proximos = new URLSearchParams(anterior);
        proximos.delete("tab");
        if (!proximos.has("aba") && abaLegada !== undefined) proximos.set("aba", abaLegada);
        return proximos;
      },
      { replace: true },
    );
  }, [aGastarAba, abaLegada, setSearchParams]);
  // A aba da ficha: a do URL se for uma aba da ficha; senao, a da ligacao antiga que se esta a gastar; senao, a omissao.
  const abaDaFicha = abaDoUrl !== null && ehAbaFicha(abaDoUrl) ? abaDoUrl : aGastarAba ? abaLegada : undefined;

  const { activeCompany, isLoading: companyLoading, semOrganizacao } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const podeCriar = hasPermission("hr.pessoas.create");
  const podeVerVinculos = hasPermission("hr.pessoas.vinculos.view");
  const podeGerirAdmissao = hasPermission("hr.admissao.obrigatorios.gerir");
  const podeGerirRegrasFimContrato = hasPermission("hr.contratos.regras.gerir");
  const { pessoas, stats, loading, error, criarPessoa } = usePessoas();
  const podeVerAdmissoes = hasPermission("hr.pessoas.convite.enviar") || hasPermission("hr.onboarding.approve");
  // Os separadores que quem olha pode ver; um ?tab= fora deles (desconhecido, ou sem permissao) cai em «Pessoas».
  const subtabsVisiveis = SUBTABS.filter(
    ({ value }) => (value !== "contratos" || podeVerVinculos) && (value !== "admissoes" || podeVerAdmissoes),
  );
  const tabPedido = aGastarAba ? null : tabDoUrl;
  const activeTab = subtabsVisiveis.some(({ value }) => value === tabPedido) ? (tabPedido as string) : SUBTAB_INICIAL;
  // Um só pedido à lista real serve o chip de cada linha e a pastilha «por aprovar».
  const admissoes = useEstadoAdmissaoPorPessoa();
  const porAprovar = admissoes.porAprovar;
  // So para leitura: uma pessoa cujo local actual ja foi desactivado tem de continuar a mostrar o nome.
  const { locais } = useLocaisTrabalho({ apenasAtivos: false });
  const nomeDoLocal = (localId: string | null) => (localId ? (locais.find((l) => l.id === localId)?.nome ?? null) : null);

  const [procura, setProcura] = useState("");
  const [filtro, setFiltro] = useState<FiltroAcesso>("todas");
  const [novaAberta, setNovaAberta] = useState(false);
  const [ficha, setFicha] = useState<FichaAberta>({ id: pessoaIdInicial ?? null, aberta: pessoaIdInicial !== undefined });

  // Uma ligacao direta para outra pessoa (mudou o :id do endereco) abre a ficha dela.
  useEffect(() => {
    if (pessoaIdInicial !== undefined) setFicha({ id: pessoaIdInicial, aberta: true });
  }, [pessoaIdInicial]);

  const filtradas = useMemo(() => filtrar(pessoas, procura, filtro), [pessoas, procura, filtro]);
  const contagemDosChips = useMemo(() => contagens(pessoas, procura), [pessoas, procura]);
  const idsVisiveis = useMemo(() => filtradas.map((p) => p.id), [filtradas]);

  /**
   * Acerta o endereco PELO ROUTER: o caminho da ficha (`id`; `undefined` deixa-o como esta) e os parametros de pesquisa (`aba`).
   * Substitui a entrada do historico: abrir e fechar a ficha nao enche o botao «voltar».
   */
  const atualizarUrl = useCallback(
    (id: string | null | undefined, editar?: (parametros: URLSearchParams) => void) => {
      const parametros = new URLSearchParams(location.search);
      editar?.(parametros);
      const pesquisa = parametros.toString();
      navigate(
        {
          pathname: id === undefined ? location.pathname : caminhoDaFicha(location.pathname, id),
          search: pesquisa === "" ? "" : `?${pesquisa}`,
          hash: location.hash,
        },
        { replace: true },
      );
    },
    [location.pathname, location.search, location.hash, navigate],
  );
  const abrirFicha = useCallback(
    (id: string) => {
      setFicha({ id, aberta: true });
      atualizarUrl(id);
    },
    [atualizarUrl],
  );
  const fecharFicha = useCallback(() => {
    setFicha((atual) => ({ ...atual, aberta: false }));
    atualizarUrl(null, (parametros) => parametros.delete("aba"));
  }, [atualizarUrl]);
  const mudarAbaDaFicha = useCallback(
    (aba: string) => atualizarUrl(undefined, (parametros) => parametros.set("aba", aba)),
    [atualizarUrl],
  );

  // Mudou a organizacao ativa: a ficha e o painel «Nova pessoa» eram da anterior. A primeira organizacao a carregar (uma
  // ligacao direta com ficha) nao fecha nada.
  const organizacaoId = semOrganizacao ? undefined : activeCompany.id;
  const organizacaoAnterior = useRef(organizacaoId);
  useEffect(() => {
    if (organizacaoAnterior.current === organizacaoId) return;
    const haviaOrganizacao = organizacaoAnterior.current !== undefined;
    organizacaoAnterior.current = organizacaoId;
    if (!haviaOrganizacao) return;
    setNovaAberta(false);
    fecharFicha();
  }, [organizacaoId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (tabDoUrl === "organograma") return <Navigate to={ORGANIZACAO_URL} replace />;
  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (semOrganizacao) return <NoOrganizationState />;

  const mudarTab = (valor: string) =>
    setSearchParams(
      (anterior) => {
        const proximos = new URLSearchParams(anterior);
        proximos.set("tab", valor);
        return proximos;
      },
      { replace: true },
    );
  const limpar = () => {
    setProcura("");
    setFiltro("todas");
  };

  return (
    <div className="space-y-6">
      <CabecalhoPessoasRh
        podeCriar={podeCriar} podeGerirAdmissao={podeGerirAdmissao} podeGerirRegrasFimContrato={podeGerirRegrasFimContrato}
        aoCriar={() => setNovaAberta(true)}
        resumo={t("rhForm.lista.resumo", { activos: stats.activos, entradas: stats.entradas90d, saidas: stats.saidas90d })}
      />

      <Tabs value={activeTab} onValueChange={mudarTab} className="space-y-4">
        <ListaAbas>
          {subtabsVisiveis.map(({ value, labelKey }) => (
            <Aba
              key={value} value={value} rotulo={t(labelKey)}
              {...(value === "admissoes" && porAprovar > 0 ? { contador: porAprovar, contadorLeitor: t("rhAdm.tabPorAprovar", { n: porAprovar }) } : {})}
            />
          ))}
        </ListaAbas>

        <TabsContent value="pessoas" className="mt-0 space-y-4">
          <BarraListaRh
            pesquisa={procura} aoPesquisar={setProcura} filtro={filtro} aoFiltrar={setFiltro}
            contagens={contagemDosChips} total={filtradas.length}
          />
          {error && <p role="alert" className="text-sm text-destructive">{t("hr.erros.carregarLista")} — {error}</p>}
          {admissoes.erro && <p role="alert" className="text-sm text-destructive">{t("rhForm.lista.admissaoErro")}</p>}
          {admissoes.incompleto && <p role="status" className="text-sm text-muted-foreground">{t("rhForm.lista.admissaoIncompleta")}</p>}
          {loading ? (
            <OlyviaLoader />
          ) : filtradas.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
              <p className="text-sm text-foreground">{pessoas.length === 0 ? t("rhForm.lista.vazia") : t("hr.pessoas.emptyFiltered")}</p>
              {pessoas.length > 0 && <Button type="button" className="min-h-11" onClick={limpar}>{t("rhForm.lista.limpar")}</Button>}
            </div>
          ) : (
            <TabelaPessoasRh
              pessoas={filtradas} nomeDoLocal={nomeDoLocal} comContrato={podeVerVinculos}
              abertaId={ficha.aberta ? ficha.id : null} aoAbrir={abrirFicha}
              estadoAdmissaoPorPessoa={admissoes.estadoPorPessoa}
            />
          )}
        </TabsContent>

        <TabsContent value="admissoes" className="mt-0">
          {podeVerAdmissoes && <PipelineAdmissoes key={activeCompany.id} aoAbrirFicha={abrirFicha} />}
        </TabsContent>
        <TabsContent value="cargos" className="mt-0">
          <PessoasFuncoesTab pessoas={pessoas} loading={loading} />
        </TabsContent>
        {podeVerVinculos && (
          <TabsContent value="contratos" className="mt-0">
            <ContratosATerminarTab organizationId={activeCompany.id} />
          </TabsContent>
        )}
      </Tabs>

      <FichaPessoaRh id={ficha.id} aberta={ficha.aberta} aoFechar={fecharFicha} idsVisiveis={idsVisiveis} aoIrPara={abrirFicha}
        aba={abaDaFicha} aoMudarAba={mudarAbaDaFicha}
      />

      {podeCriar && (
        <NovaPessoaDialogo
          open={novaAberta} onOpenChange={setNovaAberta}
          colegas={pessoas.map((p) => ({ id: p.id, nome_completo: p.nome_completo }))}
          onCriar={criarPessoa} onCriada={abrirFicha}
        />
      )}
    </div>
  );
}
