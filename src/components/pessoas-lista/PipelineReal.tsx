import { useCallback, useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { MIN_PESQUISA } from "@/hooks/pessoas/listaPessoasTipos";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useQuadroPessoas } from "@/hooks/pessoas/useQuadroPessoas";
import { useQuadroPosContrato } from "@/hooks/pessoas/useQuadroPosContrato";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { AcoesCabecalhoPessoas } from "./AcoesCabecalhoPessoas";
import { BarraListaReal } from "./BarraListaReal";
import { FichaReal } from "./FichaReal";
import { QuadroReal, textoEstadoQuadro } from "./QuadroReal";
import { useFiltrosLista } from "./useFiltrosLista";
import { usePessoaAberta } from "./usePessoaAberta";

const R = "pessoasPagina.real.";

/**
 * O Pipeline real (/pipeline): só o Quadro, de cartões de negócio (clicar abre a pessoa já no negócio), com pesquisa, tipo e ordem (o Quadro ignora a etapa e os filtros extra, por isso não se
 * mostram). A ficha, «Nova lead» e «Workflow» são os da Lista (usePessoaAberta e AcoesCabecalhoPessoas). Só se monta em modo real.
 */
export function PipelineReal() {
  const { t } = useTranslation();
  const fonte = useFontePessoas();
  const utilizadorId = fonte.modo === "real" ? (fonte.utilizadorId ?? null) : null;
  const f = useFiltrosLista(utilizadorId);
  const quadro = useQuadroPessoas({ papel: f.filtros.papel, pesquisa: f.filtros.pesquisa, ordem: f.filtros.ordem }, true);
  // Financeiro e Obra: leitura à parte, com os mesmos filtros (o Quadro das sete colunas não muda).
  const posContrato = useQuadroPosContrato({ papel: f.filtros.papel, pesquisa: f.filtros.pesquisa, ordem: f.filtros.ordem }, true);
  const aberta = usePessoaAberta();
  // As setas da ficha seguem as pessoas únicas pela ordem das colunas (só as carregadas).
  const idsVisiveis = useMemo(
    () => [...new Set([...quadro.cartoes, ...posContrato.cartoes].map((c) => c.pessoaId))],
    [quadro.cartoes, posContrato.cartoes],
  );
  // O quadro só tem negócios: passar à pessoa seguinte (`[` e `]`) abre o primeiro negócio dela que está no quadro, nunca só a pessoa.
  const { aoIrPara } = aberta;
  const irParaPessoa = useCallback(
    (id: string) => aoIrPara(id, [...quadro.cartoes, ...posContrato.cartoes].find((c) => c.pessoaId === id)?.id),
    [aoIrPara, quadro.cartoes, posContrato.cartoes],
  );
  const contagem = t(`${R}board.subtitle`, { n: quadro.cartoes.length + posContrato.cartoes.length });
  const dicaPendente = f.pesquisa.trim().length > 0 && f.pesquisa.trim().length < MIN_PESQUISA;
  // O estado de Financeiro e Obra entra no anúncio (a contagem da página só soma o que já se leu).
  const estadoPos = posContrato.isError ? t(`${R}board.pos.error`) : posContrato.isLoading ? t(`${R}board.pos.loading`) : "";
  const anuncio = [
    contagem,
    t(`${R}orderAnnounce`, { ordem: t(`${R}order.${f.filtros.ordem}`) }),
    textoEstadoQuadro(t, quadro),
    estadoPos,
    dicaPendente ? t(`${R}searchHint`) : "",
  ].filter(Boolean).join(". ");
  const conteudo = (
    <div className="mx-auto w-full max-w-[1536px] space-y-5 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <CabecalhoPagina
        subtitulo={contagem} titulo={t(`${R}pipeline.title`)} aviso={null} pai={{ to: "/pessoas", texto: t("sidebar.crm") }}
        acoes={<AcoesCabecalhoPessoas aoAbrirPessoa={aberta.aoAbrir} aoAnunciar={aberta.anunciar} />}
      />
      <BarraListaReal
        pesquisa={f.pesquisa} papel={f.filtros.papel} etapa={null} ordem={f.filtros.ordem}
        aoMudarPesquisa={f.mudarPesquisa} aoMudarPapel={f.mudarPapel} aoMudarEtapa={f.mudarEtapa} aoMudarOrdem={f.mudarOrdem}
        semEtapas
      />
      {/* Sempre montado: as regiões live que nascem já com texto não são anunciadas de forma fiável. */}
      <div role="status" aria-live="polite" className="sr-only">{anuncio}</div>
      <div aria-live="polite" className="sr-only">{aberta.mensagemAcao}</div>
      <QuadroReal
        quadro={quadro} posContrato={posContrato} aoAbrir={aberta.aoAbrirQuadro} aoLimpar={f.limpar}
        temFiltros={f.filtros.papel !== null || f.filtros.pesquisa.trim().length >= MIN_PESQUISA}
      />
    </div>
  );
  // Com uma pessoa aberta a ficha toma o lugar do quadro, na área de conteúdo (o quadro fica montado, escondido).
  return (
    <FichaReal
      pessoaId={aberta.abertaId} idsVisiveis={idsVisiveis} aoFechar={aberta.fechar} aoIrPara={irParaPessoa} aoLimpar={aberta.limpar}
      origemFoco={aberta.origemFoco} negocioInicial={aberta.negocioId} aoAbrirNegocio={aberta.aoAbrirNegocio}
      voltaPara="pipeline" tituloPagina={t(`${R}pipeline.title`)} comGuia
    >
      {conteudo}
    </FichaReal>
  );
}
