// A ficha real da pessoa (P2): lê neg_ficha_pessoa por `useFichaPessoa`, adapta-a e alimenta a MESMA ficha do protótipo (`FichaPessoa`), como
// o `Pessoas.tsx` a alimenta com os stores. A base só entra por `@/hooks/pessoas/`; aqui não há consultas. Com a capacidade `negocios` (P3) a
// ficha ganha o negócio completo (`NegociosDaFichaReal`); sem ela continua só de leitura.
//
// A ficha toma o lugar da página (o quadro ou a lista, `children`) na área de conteúdo do layout, sem Sheet: a página fica montada mas escondida (estado,
// «Carregar mais» e rolagem preservados) e a barra lateral e o topo continuam à vista.
//
// Só se mostra a ficha da pessoa que está aberta (`?open=`): ao passar de A para B não se mostra a de A (nem as ações trabalham sobre ela)
// enquanto B carrega; há um indicador visível e o anúncio. A última ficha só se guarda para o painel deslizar para fora com conteúdo
// quando se fecha (`pessoaId` a null).
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/useTranslation";
import { adaptarFicha } from "@/hooks/pessoas/adaptarFicha";
import { TIPOS_SECCAO, type FichaDb } from "@/hooks/pessoas/fichaTipos";
import { hojeLisboa } from "@/hooks/pessoas/tempoLisboa";
import { useAcoesFichaReal } from "@/hooks/pessoas/useAcoesFichaReal";
import { useFichaPessoa } from "@/hooks/pessoas/useFichaPessoa";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useGuardarContactoPessoa } from "@/hooks/pessoas/useGuardarContactoPessoa";
import { useGuardarIdentidadePessoa } from "@/hooks/pessoas/useGuardarIdentidadePessoa";
import { useSubstituirContactoPessoa } from "@/hooks/pessoas/useSubstituirContactoPessoa";
import { useQualificarLeadPessoa } from "@/hooks/pessoas/useQualificarLeadPessoa";
import { useSubmissoesPessoa } from "@/hooks/pessoas/useSubmissoesPessoa";
import type { MaisItensFicha } from "@/components/pessoas/CarregarMais";
import { FichaPessoa } from "@/components/pessoas/FichaPessoa";
import type { SeparadorSubmissoesReal } from "@/components/pessoas/FichaInterior";
import type { ItemAtividade, NotaPessoa, Pessoa, Submissao } from "@/components/pessoas/pessoasTipos";
import { type DadosContactoFormulario } from "./contactoFormulario";
import { ContactoFichaReal } from "./ContactoFichaReal";
import { IdentidadeFichaReal } from "./IdentidadeFichaReal";
import { NegociosDaFichaReal } from "./NegociosDaFichaReal";
import { QualificacaoManualFichaReal } from "./QualificacaoManualFichaReal";
import { SubmissoesFichaReal } from "./SubmissoesFichaReal";
import { useScrollAoVoltar } from "./useScrollAoVoltar";

const F = "pessoasPagina.real.ficha.";

// Sem a aba Notas na ficha real; as submissões têm o seu separador (só leitura, `SubmissoesFichaReal`). Referências fixas para não redesenhar à toa.
const SEM_SUBMISSOES: Submissao[] = [];
const SEM_NOTAS: NotaPessoa[] = [];
const SEM_ATIVIDADE: ItemAtividade[] = [];
const SEM_PESSOAS: ReadonlyMap<string, Pessoa> = new Map();
const NADA = (): void => undefined;

/** O tipo da entidade que a base devolve; qualquer outro valor (ou a falta dele, numa leitura antiga) não se edita. */
const tipoDeIdentidade = (tipo: string | null | undefined): "person" | "organization" | null => (tipo === "person" || tipo === "organization" ? tipo : null);

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
  /** O quadro de onde se abriu a ficha: dá o nome à ligação «← Pipeline» / «← Pessoas» no topo da página. */
  voltaPara?: "pipeline" | "pessoas";
  /** O conteúdo da página (o quadro ou a lista): fica montado mas escondido enquanto a ficha está à vista. */
  children?: ReactNode;
  /** O título da página («Pipeline», «Pessoas»): um h1 só para leitores de ecrã, porque o h1 da página está escondido com a ficha aberta. */
  tituloPagina?: string;
  /** O ecrã guiado fase a fase (só o Pipeline). Sem ele, a ficha completa de sempre: cabeçalho, ações, percurso e abas (a página de Pessoas). */
  comGuia?: boolean;
}

export function FichaReal({ pessoaId, idsVisiveis, aoFechar, aoIrPara, aoLimpar, origemFoco, negocioInicial = null, aoAbrirNegocio, voltaPara, children, tituloPagina, comGuia = false }: FichaRealProps) {
  const { t } = useTranslation();
  const lida = useFichaPessoa(pessoaId);
  const ultima = useRef<FichaDb | null>(null);
  if (pessoaId !== null && lida.ficha && lida.ficha.pessoa.id === pessoaId) ultima.current = lida.ficha;
  // Com uma pessoa aberta, só a SUA ficha; sem ninguém aberto (a fechar), a última, para o painel não deslizar vazio.
  const mostrada: FichaDb | null = pessoaId === null ? ultima.current : (lida.ficha?.pessoa.id === pessoaId ? lida.ficha : null);
  const fonte = useFontePessoas();
  const momentoGanho = fonte.modo === "real" ? fonte.momentoGanho : null;
  const adaptada = useMemo(() => {
    if (!mostrada) return null;
    const hoje = hojeLisboa();
    return { ...adaptarFicha(mostrada, hoje, momentoGanho), hoje };
  }, [mostrada, momentoGanho]);
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

  // As submissões de formulário, lidas como Leads as lê (só leitura), e a identidade da pessoa (tipo e nome, sem NIF).
  const submissoes = useSubmissoesPessoa(pessoaId);
  const { recarregar: recarregarSubmissoes } = submissoes;
  const hojeDaFicha = adaptada?.hoje ?? hojeLisboa();
  const campanhaDaLead = adaptada?.resumo.pessoa.campanha;
  const separadorSubmissoes = useMemo<SeparadorSubmissoesReal>(() => ({
    total: submissoes.estado === "ok" ? submissoes.submissoes.length : null,
    pendentes: submissoes.pendentes,
    conteudo: <SubmissoesFichaReal
      submissoes={submissoes.submissoes} estado={submissoes.estado} desatualizado={submissoes.desatualizado} hoje={hojeDaFicha}
      campanhaDaLead={campanhaDaLead} aoTentarDeNovo={recarregarSubmissoes}
    />,
  }), [submissoes.estado, submissoes.submissoes, submissoes.desatualizado, submissoes.pendentes, hojeDaFicha, campanhaDaLead, recarregarSubmissoes]);
  const pessoaAdaptada = adaptada?.resumo.pessoa;
  const pessoaIdMostrada = mostrada?.pessoa.id ?? "";
  const { guardar: guardarIdentidade } = useGuardarIdentidadePessoa(pessoaIdMostrada, pessoaAdaptada?.tipoCliente);
  const { guardar: substituirContacto } = useSubstituirContactoPessoa(pessoaIdMostrada);
  const { guardar: guardarPreferencias } = useGuardarContactoPessoa(pessoaIdMostrada);
  // O telefone e o email substituem-se primeiro; se isso falhar as preferências não se tocam. Se as preferências falharem a seguir, o telefone
  // e o email já ficaram (a ficha refaz-se) e o formulário só volta a mandar o que ainda falta.
  const guardarContacto = useCallback(async ({ email, telefone, contacto, hora, lingua }: DadosContactoFormulario): Promise<void> => {
    if (email !== undefined || telefone !== undefined) await substituirContacto({ email, telefone });
    if (contacto !== undefined || hora !== undefined || lingua !== undefined) await guardarPreferencias({ contacto, hora, lingua });
  }, [substituirContacto, guardarPreferencias]);
  const { classificar } = useQualificarLeadPessoa(mostrada?.pessoa.id ?? "", mostrada?.pessoa.lead_id ?? "");
  const identidade = mostrada ? (
    <>
      <IdentidadeFichaReal
        nome={mostrada.pessoa.nome?.trim() ?? ""} tipo={tipoDeIdentidade(mostrada.pessoa.tipo)} empresaNome={mostrada.pessoa.empresa_nome ?? null}
        nomeProprio={mostrada.pessoa.first_name ?? null} apelido={mostrada.pessoa.last_name ?? null}
        tipoCliente={pessoaAdaptada?.tipoCliente} podeEditar={mostrada.permissoes?.editar === true} aoGuardar={guardarIdentidade}
      />
      <ContactoFichaReal
        key={`contacto-${mostrada.pessoa.id}`} telefone={pessoaAdaptada?.contacto.telefone ?? null} email={pessoaAdaptada?.contacto.email ?? null}
        contactoPreferido={pessoaAdaptada?.contactoPreferido} horaPreferida={pessoaAdaptada?.horaPreferida} lingua={pessoaAdaptada?.lingua}
        podeEditar={mostrada.permissoes?.editar === true} aoGuardar={guardarContacto}
      />
      {/* O selo MQL/SQL classifica-se à mão (como em Leads); as regras do Workflow não o acendem. */}
      <QualificacaoManualFichaReal
        key={mostrada.pessoa.id} leadId={mostrada.pessoa.lead_id} qualificacao={adaptada?.resumo.pessoa.qualificacao}
        podeEditar={mostrada.permissoes?.editar === true} aoClassificar={classificar}
      />
    </>
  ) : undefined;

  const aAbrir = pessoaId !== null && mostrada === null && lida.estado === "a-carregar";
  // A ficha só toma o lugar da página quando a primeira chegou; nas trocas com [ e ] (a seguinte ainda a ler) a página não reaparece.
  const jaViu = useRef(false);
  if (pessoaId === null) jaViu.current = false;
  else if (adaptada !== null) jaViu.current = true;
  const fichaVisivel = pessoaId !== null && (adaptada !== null || jaViu.current);
  // Só o ecrã guiado toma o lugar da página; a ficha completa abre num painel lateral e a lista fica à vista.
  const fichaNaPagina = comGuia && fichaVisivel;
  const zonaFicha = useRef<HTMLDivElement>(null);
  useScrollAoVoltar(fichaNaPagina, zonaFicha);
  const ficha = (aoCriarNegocio?: () => void, negocioAbrir: string | null = null) => (
    <FichaPessoa
      resumo={adaptada?.resumo ?? null} aberto={pessoaId !== null} naPagina={comGuia} aoFechar={aoFechar} idsVisiveis={idsVisiveis}
      aoIrPara={aoIrPara} origemFoco={origemFoco} hoje={hojeDaFicha} submissoes={SEM_SUBMISSOES} notas={SEM_NOTAS}
      atividade={adaptada?.atividade ?? SEM_ATIVIDADE} pessoas={adaptada?.pessoas ?? SEM_PESSOAS} voltou={mostrada?.pessoa.voltou_a_contactar === true}
      podeVerSubmissoes separadorSubmissoes={separadorSubmissoes} identidade={identidade} comGuia={comGuia} voltaPara={voltaPara}
      acoes={acoes} aoPedir={NADA} aoVerTodasSubmissoes={NADA} comNotas={false} maisItens={maisItens} avisoAtualizacao={avisoAtualizacao}
      aoCriarNegocio={aoCriarNegocio} negocioInicial={negocioAbrir}
    />
  );
  return (
    <>
      <div data-pagina-escondida="" hidden={fichaNaPagina}>{children}</div>
      <div aria-busy={aAbrir}>
        {/* Sempre montada: as regiões live que nascem já com texto não são anunciadas de forma fiável. */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{aAbrir ? t(`${F}opening`) : ""}</div>
        {aAbrir && (
          <div aria-hidden="true" className="fixed bottom-4 right-4 z-50 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-lg">
            {t(`${F}opening`)}
          </div>
        )}
        <div ref={zonaFicha} hidden={!fichaNaPagina && comGuia} className={comGuia ? "mx-auto w-full max-w-[1536px] px-4 pb-10 pt-4 sm:px-6 sm:pt-6" : undefined}>
          {fichaNaPagina && tituloPagina && <h1 className="sr-only">{tituloPagina}</h1>}
          {acoes.capacidades?.negocios === false ? ficha() : (
            <NegociosDaFichaReal ficha={mostrada} pessoaAberta={pessoaId} negocioDoEndereco={negocioInicial} aoAbrirNegocio={aoAbrirNegocio} aoFecharFicha={aoLimpar}>
              {({ aoCriarNegocio, negocioInicial: aAbrir }) => ficha(aoCriarNegocio, aAbrir)}
            </NegociosDaFichaReal>
          )}
        </div>
      </div>
    </>
  );
}
