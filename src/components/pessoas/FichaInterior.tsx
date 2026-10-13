// O interior da ficha da pessoa: cabeçalho, barra de ações, os painéis de ação (em linha) e as abas. Tudo vai num único
// contentor que rola, para o painel de chamada e o "Guardar" ficarem alcançáveis com zoom ou em ecrãs baixos.
import { useCallback, useEffect, useId, useRef, useState, type MutableRefObject } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Aba, ListaAbas, Tabs, TabsContent } from "./AbasSublinhadas";
import { AnuncioFichaContext } from "./anuncioFicha";
import { AtividadeFicha } from "./AtividadeFicha";
import { BarraAcoesFicha } from "./BarraAcoesFicha";
import { CabecalhoFicha } from "./CabecalhoFicha";
import { FichaNegocios } from "./FichaNegocios";
import { FichaNotas, FichaSubmissoes } from "./FichaSubmissoesNotas";
import { textoPendentes } from "./formatoPessoas";
import type { AcaoFicha, AcoesFicha } from "./PainelBase";
import { PainelAcaoFicha } from "./PainelAcaoFicha";
import type { ItemAtividade, NotaPessoa, ResumoPessoa, Submissao } from "./pessoasTipos";
import { ResumoFicha } from "./ResumoFicha";

type AbaFicha = "resumo" | "negocios" | "submissoes" | "notas" | "atividade";

/** Quanto tempo o anúncio fica na região antes de ser limpo. */
const MS_ANUNCIO = 5000;

export interface FichaInteriorProps {
  resumo: ResumoPessoa;
  hoje: string;
  /** As submissões pendentes desta pessoa, já ordenadas; vazias sem permissão para as ver. */
  submissoes: Submissao[];
  notas: NotaPessoa[];
  atividade: ItemAtividade[];
  /** "Voltou a contactar": tem pendentes e ainda não foi respondida nem perdida. */
  voltou: boolean;
  podeVerSubmissoes: boolean;
  acoes: AcoesFicha;
  aoPedir: (submissaoId: string, pessoaId: string) => void;
  aoVerTodasSubmissoes: () => void;
  /** Um anúncio vindo da página (resolver uma submissão a partir da ficha), para o leitor de ecrã o ouvir aqui. */
  anuncioExterno?: string;
  /** A ficha chama isto no Esc: fecha o painel aberto (e diz se havia um) em vez de fechar a ficha. */
  fecharPainel: MutableRefObject<(() => boolean) | null>;
}

/** As abas por esta ordem: Resumo, Negócios, Submissões, Notas e Atividade. */
function AbasFicha(p: FichaInteriorProps & { aba: AbaFicha; aoMudar: (a: AbaFicha) => void }) {
  const { t } = useTranslation();
  const { resumo, submissoes, notas, atividade } = p;
  const verSubmissoes = () => p.aoMudar("submissoes");
  return (
    <Tabs value={p.aba} onValueChange={(v) => p.aoMudar(v as AbaFicha)} className="flex flex-col">
      <ListaAbas aria-label={t("pessoasPagina.fichaTabs.label")} className="shrink-0 px-6">
        <Aba value="resumo" rotulo={t("pessoasPagina.fichaTabs.summary")} />
        <Aba value="negocios" rotulo={t("pessoasPagina.fichaTabs.deals")} contador={resumo.negocios.length} />
        {p.podeVerSubmissoes && (
          <Aba
            value="submissoes" rotulo={t("pessoasPagina.fichaTabs.subs")} contador={submissoes.length}
            contadorLeitor={submissoes.length > 0 ? textoPendentes(t, submissoes.length) : undefined}
            novo={submissoes.length > 0}
          />
        )}
        <Aba value="notas" rotulo={t("pessoasPagina.fichaTabs.notes")} contador={notas.length} />
        <Aba value="atividade" rotulo={t("pessoasPagina.fichaTabs.activity")} contador={atividade.length} />
      </ListaAbas>
      <div data-foco-ficha tabIndex={-1} className="p-6 outline-none">
        <TabsContent value="resumo" className="mt-0">
          <ResumoFicha resumo={resumo} hoje={p.hoje} voltou={p.voltou} pendentes={submissoes.length} aoVerSubmissoes={verSubmissoes} />
        </TabsContent>
        <TabsContent value="negocios" className="mt-0"><FichaNegocios negocios={resumo.negocios} hoje={p.hoje} /></TabsContent>
        <TabsContent value="submissoes" className="mt-0">
          <FichaSubmissoes
            submissoes={submissoes} hoje={p.hoje} aoPedir={(id) => p.aoPedir(id, resumo.pessoa.id)} aoVerTodas={p.aoVerTodasSubmissoes}
          />
        </TabsContent>
        <TabsContent value="notas" className="mt-0">
          <FichaNotas notas={notas} hoje={p.hoje} pendentes={submissoes.length} aoVerSubmissoes={verSubmissoes} />
        </TabsContent>
        <TabsContent value="atividade" className="mt-0"><AtividadeFicha itens={atividade} hoje={p.hoje} /></TabsContent>
      </div>
    </Tabs>
  );
}

/** A região de anúncios: o mesmo texto duas vezes seguidas volta a ser lido (alterna um espaço) e limpa-se ao fim de uns segundos. */
function useAnuncios(externo: string | undefined) {
  const [anuncio, setAnuncio] = useState({ texto: "", n: 0 });
  const anunciar = useCallback((texto: string) => setAnuncio((a) => ({ texto, n: a.n + 1 })), []);
  useEffect(() => {
    if (!anuncio.texto) return undefined;
    const id = setTimeout(() => setAnuncio((a) => ({ ...a, texto: "" })), MS_ANUNCIO);
    return () => clearTimeout(id);
  }, [anuncio]);
  useEffect(() => { if (externo) anunciar(externo); }, [externo, anunciar]);
  return { texto: anuncio.texto + (anuncio.n % 2 ? " " : ""), anunciar };
}

/** Qual painel está aberto, quais já foram abertos (ficam montados, escondidos) e o que fazer no Esc. */
function usePaineis(fecharPainel: FichaInteriorProps["fecharPainel"], anunciar: (m: string) => void) {
  const { t } = useTranslation();
  const [acao, setAcao] = useState<AcaoFicha | null>(null);
  const [visitados, setVisitados] = useState<AcaoFicha[]>([]);
  const origem = useRef<HTMLElement | null>(null);
  const conteudo = useRef<Partial<Record<AcaoFicha, boolean>>>({});
  const avisado = useRef(false);

  const fechar = useCallback((descartar: boolean) => {
    if (descartar && acao) setVisitados((v) => v.filter((x) => x !== acao));
    setAcao(null);
    if (origem.current?.isConnected) origem.current.focus();
  }, [acao]);
  // Abrir o painel que já está aberto fecha-o (sem descartar); abrir outro esconde o atual e guarda o que lá está.
  const abrir = (a: AcaoFicha, o: HTMLElement | null) => {
    origem.current = o;
    avisado.current = false;
    if (a === acao) { setAcao(null); return; }
    setVisitados((v) => (v.includes(a) ? v : [...v, a]));
    setAcao(a);
  };
  // O Esc fecha só o painel; com algo escrito, o primeiro Esc avisa e só o segundo descarta.
  useEffect(() => {
    fecharPainel.current = () => {
      if (acao === null) return false;
      if (conteudo.current[acao] && !avisado.current) {
        avisado.current = true;
        anunciar(t("pessoasPagina.panel.discardHint"));
      } else {
        fechar(true);
      }
      return true;
    };
    return () => { fecharPainel.current = null; };
  }, [acao, fechar, fecharPainel, anunciar, t]);
  const mudarConteudo = (a: AcaoFicha) => (c: boolean) => { conteudo.current[a] = c; avisado.current = false; };
  return { acao, visitados, abrir, fechar, mudarConteudo };
}

export function FichaInterior(p: FichaInteriorProps) {
  const [aba, setAba] = useState<AbaFicha>("resumo");
  const painelId = useId();
  const { texto, anunciar } = useAnuncios(p.anuncioExterno);
  const { acao, visitados, abrir, fechar, mudarConteudo } = usePaineis(p.fecharPainel, anunciar);
  return (
    <AnuncioFichaContext.Provider value={anunciar}>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <CabecalhoFicha resumo={p.resumo} voltou={p.voltou} />
        <BarraAcoesFicha resumo={p.resumo} aberta={acao} painelId={painelId} aoAbrir={abrir} />
        {visitados.map((a) => (
          <PainelAcaoFicha
            key={a} acao={a} id={`${painelId}-${a}`} ativo={a === acao} pessoa={p.resumo.pessoa} hoje={p.hoje} acoes={p.acoes}
            aoFechar={() => fechar(true)} aoMudarConteudo={mudarConteudo(a)}
            aoConcluir={(mensagem) => { anunciar(mensagem); fechar(true); }}
          />
        ))}
        <AbasFicha {...p} aba={aba} aoMudar={setAba} />
      </div>
      <div role="status" className="sr-only">{texto}</div>
    </AnuncioFichaContext.Provider>
  );
}
