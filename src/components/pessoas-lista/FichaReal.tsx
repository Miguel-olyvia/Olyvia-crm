// A ficha real da pessoa (P2): lê neg_ficha_pessoa por `useFichaPessoa`, adapta-a e alimenta a MESMA ficha do protótipo (`FichaPessoa`), como
// o `Pessoas.tsx` a alimenta com os stores. A base só entra por `@/hooks/pessoas/`; aqui não há consultas. Com a capacidade `negocios` (P3) a
// ficha ganha o negócio completo (`NegociosDaFichaReal`); sem ela continua só de leitura.
//
// Só se mostra a ficha da pessoa que está aberta (`?open=`): ao passar de A para B não se mostra a de A (nem as ações trabalham sobre ela)
// enquanto B carrega; há um indicador visível e o anúncio. A última ficha só se guarda para o painel deslizar para fora com conteúdo
// quando se fecha (`pessoaId` a null).
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/useTranslation";
import { adaptarFicha } from "@/hooks/pessoas/adaptarFicha";
import { TIPOS_SECCAO, type FichaDb } from "@/hooks/pessoas/fichaTipos";
import { hojeLisboa } from "@/hooks/pessoas/tempoLisboa";
import { useAcoesFichaReal } from "@/hooks/pessoas/useAcoesFichaReal";
import { useFichaPessoa } from "@/hooks/pessoas/useFichaPessoa";
import type { MaisItensFicha } from "@/components/pessoas/CarregarMais";
import { FichaPessoa } from "@/components/pessoas/FichaPessoa";
import type { ItemAtividade, NotaPessoa, Pessoa, Submissao } from "@/components/pessoas/pessoasTipos";
import { NegociosDaFichaReal } from "./NegociosDaFichaReal";

const F = "pessoasPagina.real.ficha.";

// Sem submissões nem notas na ficha real (são da página de submissões): referências fixas para não redesenhar à toa.
const SEM_SUBMISSOES: Submissao[] = [];
const SEM_NOTAS: NotaPessoa[] = [];
const SEM_ATIVIDADE: ItemAtividade[] = [];
const SEM_PESSOAS: ReadonlyMap<string, Pessoa> = new Map();
const NADA = (): void => undefined;

interface FichaRealProps {
  /** A pessoa aberta (o `?open=` da página); `null` com a ficha fechada. */
  pessoaId: string | null;
  /** Os ids das pessoas visíveis na lista, pela ordem da lista (as teclas `[` e `]`). */
  idsVisiveis: string[];
  aoFechar: () => void;
  /** Passa à pessoa `id` sem acrescentar entradas ao histórico. */
  aoIrPara: (id: string) => void;
  /** Tira o `?open=` do endereço sem deixar entrada no histórico (depois de um erro). */
  aoLimpar: () => void;
  /** O elemento a que o foco volta ao fechar, guardado no clique que abriu. */
  origemFoco?: MutableRefObject<HTMLElement | null>;
  /** O negócio a abrir dentro da ficha (`?negocio=`). */
  negocioInicial?: string | null;
  /** Depois de criar um negócio: leva-o ao endereço (`?negocio=`), para a ligação se poder partilhar e recarregar. */
  aoAbrirNegocio?: (negocioId: string, pessoaId: string) => void;
}

export function FichaReal({ pessoaId, idsVisiveis, aoFechar, aoIrPara, aoLimpar, origemFoco, negocioInicial = null, aoAbrirNegocio }: FichaRealProps) {
  const { t } = useTranslation();
  const lida = useFichaPessoa(pessoaId);
  const ultima = useRef<FichaDb | null>(null);
  if (pessoaId !== null && lida.ficha && lida.ficha.pessoa.id === pessoaId) ultima.current = lida.ficha;
  // Com uma pessoa aberta, só a SUA ficha; sem ninguém aberto (a fechar), a última, para o painel não deslizar vazio.
  const mostrada: FichaDb | null = pessoaId === null ? ultima.current : (lida.ficha?.pessoa.id === pessoaId ? lida.ficha : null);
  const adaptada = useMemo(() => {
    if (!mostrada) return null;
    const hoje = hojeLisboa();
    return { ...adaptarFicha(mostrada, hoje), hoje };
  }, [mostrada]);
  const acoes = useAcoesFichaReal(mostrada?.pessoa.id ?? "", mostrada);

  // Uma falha ao abrir (pessoa que já não existe, identificador inválido, erro da base): um toast com a chave do erro e o ?open= limpo.
  // Só a falha NOVA conta: o `useFichaPessoa` não dá falha enquanto há uma leitura a correr (reabrir a mesma pessoa com um erro em cache).
  const falhou = pessoaId !== null && (lida.estado === "erro" || lida.estado === "indisponivel");
  const avisada = useRef<string | null>(null);
  const chaveErro = lida.erro?.chave;
  useEffect(() => {
    if (!falhou) {
      avisada.current = null;
      return;
    }
    if (avisada.current === pessoaId) return;
    avisada.current = pessoaId;
    toast.error(t(chaveErro ?? `${F}notFound`));
    aoLimpar();
  }, [falhou, pessoaId, chaveErro, t, aoLimpar]);

  // «Carregar mais» de cada secção: os estados são desta pessoa (o hook indexa-os por pessoa).
  const { carregarMais, carregandoTipos, errosMais } = lida;
  const maisItens = useMemo<MaisItensFicha>(() => Object.fromEntries(TIPOS_SECCAO.map((tipo) => [tipo, {
    temMais: !!mostrada?.[tipo]?.tem_mais,
    aCarregar: carregandoTipos.includes(tipo),
    erro: errosMais[tipo]?.chave ?? null,
    aoPedir: () => { void carregarMais(tipo); },
  }])), [mostrada, carregarMais, carregandoTipos, errosMais]);
  const avisoAtualizacao = useMemo(() => (lida.atualizacaoFalhou ? { aoRepetir: lida.recarregar } : undefined), [lida.atualizacaoFalhou, lida.recarregar]);

  const aAbrir = pessoaId !== null && mostrada === null && lida.estado === "a-carregar";
  const ficha = (aoCriarNegocio?: () => void, negocioAbrir: string | null = null) => (
    <FichaPessoa
      resumo={adaptada?.resumo ?? null} aberto={pessoaId !== null && adaptada !== null} aoFechar={aoFechar} idsVisiveis={idsVisiveis}
      aoIrPara={aoIrPara} origemFoco={origemFoco} hoje={adaptada?.hoje ?? hojeLisboa()} submissoes={SEM_SUBMISSOES} notas={SEM_NOTAS}
      atividade={adaptada?.atividade ?? SEM_ATIVIDADE} pessoas={adaptada?.pessoas ?? SEM_PESSOAS} voltou={false} podeVerSubmissoes={false}
      acoes={acoes} aoPedir={NADA} aoVerTodasSubmissoes={NADA} comNotas={false} maisItens={maisItens} avisoAtualizacao={avisoAtualizacao}
      aoCriarNegocio={aoCriarNegocio} negocioInicial={negocioAbrir}
    />
  );
  return (
    <div aria-busy={aAbrir}>
      {/* Sempre montada: as regiões live que nascem já com texto não são anunciadas de forma fiável. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{aAbrir ? t(`${F}opening`) : ""}</div>
      {aAbrir && (
        <div aria-hidden="true" className="fixed bottom-4 right-4 z-50 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-lg">
          {t(`${F}opening`)}
        </div>
      )}
      {acoes.capacidades?.negocios === false ? ficha() : (
        <NegociosDaFichaReal ficha={mostrada} pessoaAberta={pessoaId} negocioDoEndereco={negocioInicial} aoAbrirNegocio={aoAbrirNegocio} aoFecharFicha={aoLimpar}>
          {({ aoCriarNegocio, negocioInicial: aAbrir }) => ficha(aoCriarNegocio, aAbrir)}
        </NegociosDaFichaReal>
      )}
    </div>
  );
}
