import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { juntarPessoas } from "@/components/pessoas/juntarPessoas";
import { paraPainelNegocio } from "@/components/pessoas/paraPainelNegocio";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "@/components/pessoas/pessoasExemplo";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { AbaQuadro } from "@/components/negocio-metas/AbaQuadro";
import { BotaoWorkflow } from "@/components/negocio-metas/BotaoWorkflow";
import { DashboardNegocios } from "@/components/negocio-metas/DashboardNegocios";
import { NovoNegocioDialogo } from "@/components/negocio-metas/NovoNegocioDialogo";
import { criarNegocioNovo, useNegociosNovos } from "@/components/negocio-metas/negociosNovos";
import type { DadosCriarNegocio, PessoaOpcao } from "@/components/negocio-metas/novoNegocio";
import { useParametroOpen } from "@/components/negocio-metas/useParametroOpen";
import { SeletorModo } from "@/components/negocio-metas/SeletorModo";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { DETALHES_EXEMPLO } from "@/components/negocio-metas/negocioDetalhesExemplo";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import {
  filtrarNegocios, numerosDashboard, resumoQuadro,
} from "@/components/negocio-metas/logicaQuadro";
import { useAcoesExemplo } from "@/components/negocio-metas/acoesExemplo";
import { useFiltrosPagina } from "@/components/negocio-metas/useFiltrosPagina";
import { useAbrirWorkflow } from "@/components/negocio-metas/useAbrirWorkflow";
import { usePreferenciasQuadro } from "@/components/negocio-metas/usePreferenciasQuadro";
import { DadosPainelProvider } from "@/components/negocio-metas/useDadosPainel";
import { WorkflowExemploProvider } from "@/components/negocio-metas/useWorkflowExemplo";

/** A ficha de cada pessoa, no formato do painel do negócio (a página é quem junta Pessoas e Negócio e metas). */
const PESSOAS_DO_PAINEL = new Map(
  juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO).map((r) => [r.pessoa.id, paraPainelNegocio(r)]),
);
const pessoaDe = (pessoaId: string) => PESSOAS_DO_PAINEL.get(pessoaId) ?? null;
/** As pessoas a escolher em "Novo negócio" (a página é quem lê Pessoas; Negócio e metas só recebe esta lista). */
const PESSOAS_PARA_ESCOLHER: PessoaOpcao[] = PESSOAS_EXEMPLO.map((p) => ({ id: p.id, nome: p.nome, contacto: p.contacto }));
const detalheDe = (negocioId: string) => DETALHES_EXEMPLO[negocioId] ?? null;

type Vista = "quadro" | "dashboard";

const vistaDoEndereco = (params: URLSearchParams): Vista => {
  if (params.get("open")) return "quadro";
  return params.get("separador") === "dashboard" ? "dashboard" : "quadro";
};

const ehVista = (valor: string): valor is Vista => valor === "quadro" || valor === "dashboard";

/**
 * "Negócio e metas" (Aquisição): as abas Quadro (com Lista) e Dashboard no topo, como as do Inventário, e o botão
 * "Workflow" no cabeçalho, que abre a configuração num diálogo (?workflow=1). Só conteúdo de
 * exemplo, sem qualquer leitura à base: os números vêm de
 * `negocioMetasExemplo.ts` e os totais são calculados em `negocioMetas.ts` e
 * `logicaQuadro.ts`.
 */
const NegocioMetas = () => {
  const { t } = useTranslation();
  const novos = useNegociosNovos();
  // Os negócios criados com "Novo negócio" entram em todas as vistas; sem nenhum, são exatamente os do exemplo.
  const dados = useMemo(
    () => (novos.length === 0 ? DADOS_EXEMPLO : { ...DADOS_EXEMPLO, negocios: [...DADOS_EXEMPLO.negocios, ...novos] }),
    [novos],
  );
  const { negocios } = dados;
  const { abrir } = useParametroOpen();
  const [recemCriado, setRecemCriado] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState({ n: 0, texto: "" });
  const prefs = usePreferenciasQuadro();
  const acoes = useAcoesExemplo();
  const { filtros, mudarFiltros } = useFiltrosPagina(prefs);
  const [params, setParams] = useSearchParams();
  const [workflowAberto, mudarWorkflow] = useAbrirWorkflow();
  // A vista vive no endereço, a única fonte: ?open=<id> (vindo, por exemplo, da ficha de uma pessoa) força o
  // Quadro, onde está o painel do negócio; senão ?separador=dashboard (o workflow vive em ?workflow=1); sem nada, o Quadro.
  const vista = vistaDoEndereco(params);
  /** Muda de separador escrevendo-o no endereço (sem entrada nova no histórico). Sair do Quadro fecha o painel (?open). */
  const mudarVista = useCallback((nova: Vista) => {
    setParams((atual) => {
      const p = new URLSearchParams(atual);
      if (nova === "quadro") p.delete("separador");
      else {
        p.set("separador", nova);
        p.delete("open");
      }
      return p;
    }, { replace: true });
  }, [setParams]);

  /** Cria o negócio, avisa (toast e leitor de ecrã) e abre o painel dele, com o foco no título. */
  const aoCriar = (dadosNovo: DadosCriarNegocio) => {
    const criado = criarNegocioNovo(dadosNovo, HOJE_EXEMPLO);
    setRecemCriado(criado.id);
    abrir(criado.id);
    toast.success(t("businessGoals.new.created"));
    setAnuncio((a) => ({ n: a.n + 1, texto: t("businessGoals.new.announce", { nome: criado.pessoa, servico: criado.servico }) }));
  };

  const visiveis = useMemo(() => filtrarNegocios(negocios, filtros, HOJE_EXEMPLO), [negocios, filtros]);
  const resumo = resumoQuadro(visiveis);
  const porFechar = numerosDashboard(negocios)[1];
  const de = resumo.n !== negocios.length ? ` (${t("businessGoals.of")} ${negocios.length})` : "";
  const subtitulo = t("businessGoals.summary", {
    shown: `${resumo.n}${de}`,
    proposal: formatarMeta("euro", resumo.valorEmProposta),
    open: resumo.porFechar,
    value: formatarMeta("euro", porFechar.valorNota ?? 0),
  });

  return (
    <WorkflowExemploProvider>
      <DadosPainelProvider pessoaDe={pessoaDe} detalheDe={detalheDe}>
        <div className="mx-auto w-full max-w-[1536px] space-y-5 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
          {/* Como no Inventário: a barra de abas no topo, com a linha fina por baixo, e só depois migalhas e título. */}
          <Tabs value={vista} onValueChange={(v) => { if (ehVista(v)) mudarVista(v); }} className="space-y-5">
            <ListaAbas aria-label={t("businessGoals.tabs.label")}>
              <Aba value="quadro" rotulo={t("businessGoals.tabs.board")} />
              <Aba value="dashboard" rotulo={t("businessGoals.tabs.dashboard")} />
            </ListaAbas>
            <CabecalhoPagina
              subtitulo={subtitulo}
              acoes={(
                <>
                  {vista === "quadro" && <SeletorModo modo={prefs.modo} aoMudar={prefs.mudarModo} />}
                  <BotaoWorkflow aberto={workflowAberto} aoMudar={mudarWorkflow} />
                  <NovoNegocioDialogo pessoas={PESSOAS_PARA_ESCOLHER} aoCriar={aoCriar} />
                </>
              )}
            />
            <TabsContent value="quadro" className="mt-0">
              <AbaQuadro
                negocios={negocios} hoje={HOJE_EXEMPLO} filtros={filtros} modo={prefs.modo} ordem={prefs.ordem}
                acoes={acoes} aoMudarFiltros={mudarFiltros} aoMudarOrdem={prefs.mudarOrdem} focarTituloDe={recemCriado}
              />
            </TabsContent>
            <TabsContent value="dashboard" className="mt-0">
              <DashboardNegocios dados={dados} aoIrParaQuadro={() => mudarVista("quadro")} />
            </TabsContent>
          </Tabs>
          {/* Região viva só para leitores de ecrã, no fim da página (o primeiro "status" continua a ser o do Quadro). */}
          <p role="status" className="sr-only"><span key={anuncio.n}>{anuncio.texto}</span></p>
        </div>
      </DadosPainelProvider>
    </WorkflowExemploProvider>
  );
};

export default NegocioMetas;
