// O interior da ficha da pessoa: cabeçalho, barra de ações, percurso, os painéis de ação (em linha) e as abas fixas. Tudo
// vai num único contentor que rola, para o painel de chamada e o "Guardar" ficarem alcançáveis com zoom ou em ecrãs baixos.
import { useEffect, useId, useRef, useState, type MutableRefObject } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { AnuncioFichaContext } from "@/components/ficha-comum/anuncioFicha";
import { AtividadeFicha } from "./AtividadeFicha";
import { AvisoNegociosPerdidos } from "./AvisoNegociosPerdidos";
import { BarraAcoesFicha } from "./BarraAcoesFicha";
import { CabecalhoFicha } from "./CabecalhoFicha";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { todosNegociosPerdidos } from "./etapaPessoa";
import { FichaNegocios, LINHA_NEGOCIO } from "./FichaNegocios";
import { FichaNotas, FichaSubmissoes } from "./FichaSubmissoesNotas";
import { textoPendentes } from "./formatoPessoas";
import type { TeclaNavegacao, Vizinhas } from "./navegacaoFicha";
import type { AcaoFicha, AcoesFicha } from "./PainelBase";
import { PainelAcaoFicha } from "./PainelAcaoFicha";
import { PercursoPessoa } from "./PercursoPessoa";
import { IDS_NEGOCIOS_DO_QUADRO } from "./pessoasExemplo";
import { ehHistorico, type ItemAtividade, type NotaPessoa, type Pessoa, type ResumoPessoa, type Submissao } from "./pessoasTipos";
import { ResumoFicha } from "./ResumoFicha";
import { useAnuncios, usePaineis } from "./useFichaPaineis";

type AbaFicha = "resumo" | "negocios" | "submissoes" | "notas" | "atividade";

export interface FichaInteriorProps {
  resumo: ResumoPessoa;
  hoje: string;
  /** As submissões pendentes desta pessoa, já ordenadas; vazias sem permissão para as ver. */
  submissoes: Submissao[];
  notas: NotaPessoa[];
  atividade: ItemAtividade[];
  /** Todas as pessoas, por id: as candidatas das submissões. */
  pessoas: ReadonlyMap<string, Pessoa>;
  /** "Voltou a contactar": tem pendentes e ainda não foi respondida nem perdida. */
  voltou: boolean;
  podeVerSubmissoes: boolean;
  acoes: AcoesFicha;
  aoPedir: (submissaoId: string, pessoaId: string) => void;
  aoVerTodasSubmissoes: () => void;
  /** "Criar negócio": a página abre o painel "Novo negócio" com esta pessoa já escolhida. */
  aoCriarNegocio: (pessoa: Pessoa) => void;
  /** Um anúncio vindo da página (resolver uma submissão a partir da ficha), para o leitor de ecrã o ouvir aqui. */
  anuncioExterno?: string;
  /** A ficha chama isto no Esc: fecha o painel aberto (e diz se havia um) em vez de fechar a ficha. */
  fecharPainel: MutableRefObject<(() => boolean) | null>;
  /** A anterior e a seguinte na lista visível, e como passar a elas. */
  vizinhas: Vizinhas;
  aoIr: (id: string, qual: TeclaNavegacao) => void;
}

interface AbasProps extends FichaInteriorProps {
  aba: AbaFicha;
  aoMudar: (a: AbaFicha) => void;
  negocioAberto: string | null;
  aoAbrirNegocio: (id: string) => void;
  aoVoltarNegocio: () => void;
}

/** A aba Negócios: a lista, ou o negócio aberto (com "Voltar aos negócios"). */
function ConteudoNegocios(p: AbasProps) {
  const aberto = p.resumo.negocios.find((n) => n.id === p.negocioAberto);
  if (!aberto) return <FichaNegocios negocios={p.resumo.negocios} hoje={p.hoje} aoAbrir={p.aoAbrirNegocio} />;
  return <DetalheNegocioFicha negocio={aberto} hoje={p.hoje} noQuadro={!ehHistorico(aberto) && (IDS_NEGOCIOS_DO_QUADRO.has(aberto.id) || "novo" in aberto)} aoVoltar={p.aoVoltarNegocio} />;
}

/** As abas por esta ordem: Resumo, Negócios, Submissões, Notas e Atividade. A lista de abas fica fixa no topo ao rolar. */
function AbasFicha(p: AbasProps) {
  const { t } = useTranslation();
  const { resumo, submissoes, notas, atividade } = p;
  const verSubmissoes = () => p.aoMudar("submissoes");
  return (
    <Tabs value={p.aba} onValueChange={(v) => p.aoMudar(v as AbaFicha)} className="mt-2 flex flex-col">
      <ListaAbas aria-label={t("pessoasPagina.fichaTabs.label")} className="sticky top-0 z-10 shrink-0 bg-background px-6">
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
      <div data-foco-ficha tabIndex={-1} className="px-6 pb-6 outline-none">
        <TabsContent value="resumo" className="mt-0">
          <ResumoFicha
            resumo={resumo} hoje={p.hoje} voltou={p.voltou} podeVerSubmissoes={p.podeVerSubmissoes} pendentes={submissoes.length}
            aoVerSubmissoes={verSubmissoes}
          />
        </TabsContent>
        <TabsContent value="negocios" className="mt-0 pt-4"><ConteudoNegocios {...p} /></TabsContent>
        <TabsContent value="submissoes" className="mt-0 pt-4">
          <FichaSubmissoes
            submissoes={submissoes} hoje={p.hoje} pessoas={p.pessoas} aoPedir={(id) => p.aoPedir(id, resumo.pessoa.id)} aoVerTodas={p.aoVerTodasSubmissoes}
          />
        </TabsContent>
        <TabsContent value="notas" className="mt-0 pt-4">
          <FichaNotas notas={notas} hoje={p.hoje} pendentes={submissoes.length} aoVerSubmissoes={verSubmissoes} />
        </TabsContent>
        <TabsContent value="atividade" className="mt-0 pt-4"><AtividadeFicha itens={atividade} hoje={p.hoje} /></TabsContent>
      </div>
    </Tabs>
  );
}

/** Abrir um negócio dentro da ficha e voltar à lista com o foco na mesma linha. Mudar de aba fecha o negócio aberto. */
function useNegocioAberto() {
  const [aberto, setAberto] = useState<string | null>(null);
  const ultimo = useRef<string | null>(null);
  useEffect(() => {
    if (aberto !== null || ultimo.current === null) return;
    document.querySelector<HTMLElement>(`[${LINHA_NEGOCIO}="${ultimo.current}"]`)?.focus();
    ultimo.current = null;
  }, [aberto]);
  return {
    aberto,
    abrir: (id: string) => { ultimo.current = id; setAberto(id); },
    voltar: () => setAberto(null),
    esquecer: () => { ultimo.current = null; setAberto(null); },
  };
}

/** Quando a pessoa ganha um negócio (um "Criar negócio" que acaba de terminar), a ficha passa à aba Negócios para o mostrar. */
function useAbrirNegociosAoCriar(resumo: ResumoPessoa, esquecer: () => void, irParaNegocios: () => void) {
  const antes = useRef({ id: resumo.pessoa.id, n: resumo.negocios.length });
  const n = resumo.negocios.length;
  useEffect(() => {
    const anterior = antes.current;
    antes.current = { id: resumo.pessoa.id, n };
    if (anterior.id === resumo.pessoa.id && n > anterior.n) { esquecer(); irParaNegocios(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a mudar o número de negócios da mesma pessoa
  }, [n, resumo.pessoa.id]);
}

export function FichaInterior(p: FichaInteriorProps) {
  const { t } = useTranslation();
  const [aba, setAba] = useState<AbaFicha>("resumo");
  const negocio = useNegocioAberto();
  const painelId = useId();
  const { texto, anunciar } = useAnuncios(p.anuncioExterno);
  const { acao, visitados, abrir, fechar, mudarConteudo } = usePaineis(p.fecharPainel, anunciar);
  useAbrirNegociosAoCriar(p.resumo, negocio.esquecer, () => setAba("negocios"));
  const reativar = () => {
    p.acoes.reativar(p.resumo.pessoa.id);
    anunciar(t("pessoasPagina.live.reactivated", { name: p.resumo.pessoa.nome }));
  };
  return (
    <AnuncioFichaContext.Provider value={anunciar}>
      <div className="flex min-h-0 flex-1 scroll-pt-14 flex-col overflow-y-auto">
        <CabecalhoFicha resumo={p.resumo} vizinhas={p.vizinhas} aoIr={p.aoIr} />
        <BarraAcoesFicha
          resumo={p.resumo} aberta={acao} painelId={painelId} aoAbrir={abrir} aoReativar={reativar}
          aoCriarNegocio={() => p.aoCriarNegocio(p.resumo.pessoa)}
        />
        <div className="mt-3 px-6"><PercursoPessoa resumo={p.resumo} /></div>
        {todosNegociosPerdidos(p.resumo) && <AvisoNegociosPerdidos aoMarcar={(origem) => abrir("perder", origem)} />}
        {visitados.map((a) => (
          <PainelAcaoFicha
            key={a} acao={a} id={`${painelId}-${a}`} ativo={a === acao} pessoa={p.resumo.pessoa} resumo={p.resumo} hoje={p.hoje} acoes={p.acoes}
            aoFechar={() => fechar(true)} aoMudarConteudo={mudarConteudo(a)}
            aoConcluir={(mensagem) => { anunciar(mensagem); fechar(true); }}
          />
        ))}
        <AbasFicha
          {...p} aba={aba} aoMudar={(a) => { negocio.esquecer(); setAba(a); }} negocioAberto={negocio.aberto}
          aoAbrirNegocio={negocio.abrir} aoVoltarNegocio={negocio.voltar}
        />
      </div>
      <div role="status" className="sr-only">{texto}</div>
    </AnuncioFichaContext.Provider>
  );
}
