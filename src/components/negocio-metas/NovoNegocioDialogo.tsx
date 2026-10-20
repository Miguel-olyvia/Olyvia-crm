import { useRef, useState, type ReactNode } from "react";
import { ChevronRight, Plus, Sparkles, X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FormularioNovoNegocio } from "./FormularioNovoNegocio";
import { FormularioRegistos } from "./FormularioRegistos";
import { FOCO, PISTA_DESATIVADO } from "./estilos";
import { HOJE_EXEMPLO } from "./negocioMetasExemplo";
import type { VisitaNegocio } from "./negocioMetas";
import type { AbaNovoNegocio, DadosCriarNegocio, PessoaOpcao, RascunhoLevantamento, ValoresIniciaisNegocio } from "./novoNegocio";

interface NovoNegocioDialogoProps {
  /** As pessoas a escolher; a página monta a lista (esta pasta não importa de Pessoas). */
  pessoas: readonly PessoaOpcao[];
  /**
   * O que o painel faz: `negocio` (por omissão) cria um negócio à mão e liga registos da pessoa; `registos` é o painel «Visita e
   * levantamento» da pessoa, que guarda as visitas e o levantamento nos registos dela (precisa de `guardarLevantamento`) e nunca cria negócio.
   */
  modo?: "negocio" | "registos";
  /** Chamado ao confirmar, já com o painel a fechar (no modo `negocio`). */
  aoCriar?: (dados: DadosCriarNegocio) => void;
  /** Controlo de fora (por exemplo a ficha de uma pessoa): sem isto o painel abre com o próprio botão. */
  aberto?: boolean;
  aoMudarAberto?: (aberto: boolean) => void;
  /** Não mostra o botão "Novo negócio" (o painel abre só por `aberto`). */
  semBotao?: boolean;
  /** A pessoa já escolhida ao abrir (a ficha de onde se veio): o seletor fica desativado, a pessoa não se muda. */
  pessoaInicialId?: string;
  /** O que já vem preenchido ao abrir (a visita concluída de uma pessoa: comercial, aba Visita e morada da obra). */
  valoresIniciais?: ValoresIniciaisNegocio;
  /**
   * Modo `registos`, ficha real: os ids das visitas que já existem na base. Essas não se removem (cancelam-se, com confirmação) e, já feitas ou
   * canceladas, só se leem. Sem isto (o exemplo) nenhuma existe e remover descarta, como sempre.
   */
  visitasGravadas?: ReadonlySet<string>;
  /** A aba com que o painel abre (por omissão a Geral): o "A fazer" do levantamento abre na Visita (modo `registos`). */
  abaInicial?: AbaNovoNegocio;
  /** A secção da aba Visita com que abre (o id, por exemplo `visitas`); sem isto vale a das Medidas da área. */
  seccaoInicial?: string;
  /**
   * No modo `registos`, o botão que guarda o levantamento e as visitas e fecha o painel. `aoGuardar` recebe o rascunho (com a morada da
   * obra), a lista de visitas e o comercial escolhido, e devolve `false` quando não pôde guardar: então o painel fica aberto, com o que se
   * escreveu.
   */
  guardarLevantamento?: {
    texto: string;
    aoGuardar: (rascunho: RascunhoLevantamento, visitas: VisitaNegocio[], comercial: string) => boolean;
    /** Porque é que o último `aoGuardar` não guardou: aparece dentro do painel, como alerta (o toast e a região live ficam fora do modal). */
    motivo?: string | null;
    /** Cresce a cada recusa: o alerta remonta (e volta a ser lido, mesmo com o mesmo texto) e esconde-se quando o rascunho muda. */
    tentativa?: number;
  };
  /** O título do painel (por omissão "Novo negócio"): um passo do "A fazer" diz o que se faz, por exemplo "Levantamento de Ana". */
  titulo?: string;
  /** A descrição do painel (por omissão a de "Novo negócio"). */
  descricao?: string;
  /** O selo do cabeçalho (por omissão «Novo · por gravar», que é do exemplo); `null` tira-o (a ficha real grava mesmo). */
  selo?: string | null;
  /** Há uma gravação em curso: o X do cabeçalho fica aria-disabled e não fecha (quem monta também ignora o pedido de fechar). */
  aGuardar?: boolean;
  /**
   * O corpo do painel, no lugar dos formulários do exemplo (a ficha real monta o seu). Recebe `aoCriou` (o painel vai fechar por ter criado o negócio: o foco não volta ao botão que o abriu) e `aoSujar`, que avisa que há alterações por
   * gravar (um clique fora deixa de fechar). O campo com `data-foco-inicial` recebe o foco ao abrir.
   */
  corpo?: (contexto: { aoSujar: () => void; aoCriou: () => void }) => ReactNode;
  /**
   * Chamado ao fechar o painel (cancelando ou criando): devolve o foco a quem o abriu e diz se o fez. Sem isto, o foco volta
   * ao botão "Novo negócio" (se o painel o tiver); com ele a quem chama cabe decidir, porque o botão que abriu o painel
   * pode já não existir. `criou` diz se o painel fechou por ter criado o negócio (então o ponto de partida mudou).
   */
  aoDevolverFoco?: (criou: boolean) => boolean;
}

/** O cabeçalho do painel: migalhas "Negócio e metas › Novo negócio", título, selo "Novo · por gravar" e Fechar. */
function CabecalhoNovo({ titulo, descricao, selo, aGuardar }: Pick<NovoNegocioDialogoProps, "titulo" | "descricao" | "selo" | "aGuardar">) {
  const { t } = useTranslation();
  return (
    <SheetHeader className="space-y-2 border-b border-border p-6 text-left">
      <div className="flex items-start justify-between gap-3">
        <nav aria-label={t("businessGoals.breadcrumb.label")}>
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <li>{t("businessGoals.title")}</li>
            <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
            <li aria-current="page" className="font-medium text-foreground">{t("businessGoals.new.title")}</li>
          </ol>
        </nav>
        <SheetClose asChild>
          <Button
            type="button" variant="ghost" size="icon" aria-label={t("businessGoals.new.close")} aria-disabled={aGuardar || undefined}
            // A guardar não se fecha (quem monta ignora o pedido): o X diz que está ocupado, sem sair da ordem do teclado.
            onClick={(e) => { if (aGuardar) e.preventDefault(); }}
            className={cn("-mr-2 -mt-2 h-11 w-11", FOCO, PISTA_DESATIVADO)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </SheetClose>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SheetTitle className="text-lg">{titulo ?? t("businessGoals.new.title")}</SheetTitle>
        {selo !== null && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-primary px-1.5 py-0.5 text-xs font-semibold text-primary dark:text-violet-300">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {selo ?? t("businessGoals.new.badge")}
          </span>
        )}
      </div>
      <SheetDescription>{descricao ?? t("businessGoals.new.description")}</SheetDescription>
    </SheetHeader>
  );
}

/**
 * O botão "Novo negócio" (a única ação principal da página) e o painel lateral com o formulário, igual ao da ficha de
 * Pessoas (meio ecrã, todo em ecrã estreito). Ao abrir, o foco vai para o primeiro campo; Esc, Cancelar ou Fechar
 * fecham e devolvem o foco ao botão. Com alterações por gravar, um clique fora não fecha (para não perder o que se
 * escreveu); Esc e Cancelar fecham sem perguntar, como no Inventário. Ao criar, o foco não volta ao botão: quem cria
 * abre o painel do novo negócio e leva lá o foco. Só exemplo: nada é gravado.
 */
export function NovoNegocioDialogo({
  pessoas, modo = "negocio", aoCriar, aberto: abertoDeFora, aoMudarAberto, semBotao = false, pessoaInicialId, valoresIniciais, abaInicial, seccaoInicial,
  visitasGravadas, guardarLevantamento, aoDevolverFoco, titulo, descricao, selo, corpo, aGuardar,
}: NovoNegocioDialogoProps) {
  const { t } = useTranslation();
  const [abertoProprio, setAbertoProprio] = useState(false);
  const aberto = abertoDeFora ?? abertoProprio;
  const setAberto = (valor: boolean) => { setAbertoProprio(valor); aoMudarAberto?.(valor); };
  const botao = useRef<HTMLButtonElement>(null);
  const primeiroCampo = useRef<HTMLButtonElement>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  const criou = useRef(false);
  const sujo = useRef(false);

  const mudarAberto = (valor: boolean) => {
    if (valor) sujo.current = false;
    setAberto(valor);
  };

  const confirmar = (dados: DadosCriarNegocio) => {
    criou.current = true;
    setAberto(false);
    aoCriar?.(dados);
  };

  const guardar = guardarLevantamento && {
    texto: guardarLevantamento.texto,
    motivo: guardarLevantamento.motivo,
    tentativa: guardarLevantamento.tentativa,
    aoGuardar: (rascunho: RascunhoLevantamento, visitas: VisitaNegocio[], comercial: string) => {
      if (guardarLevantamento.aoGuardar(rascunho, visitas, comercial)) setAberto(false);
    },
  };

  // Ao abrir, o foco vai para o primeiro campo da aba Geral; noutra aba (a Visita, no "A fazer") vai para a aba escolhida.
  const focarAoAbrir = (e: Event) => {
    e.preventDefault();
    // O primeiro campo pode estar desativado (a pessoa que vem da ficha): então o foco vai para o separador escolhido.
    // Um passo que abre numa secção (as Visitas) leva o foco para o título dela.
    const campo = primeiroCampo.current;
    const seccao = seccaoInicial ? conteudo.current?.querySelector<HTMLElement>("[data-foco-seccao]") : null;
    const separador = conteudo.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    const inicial = corpo ? conteudo.current?.querySelector<HTMLElement>("[data-foco-inicial]") : null;
    (seccao ?? inicial ?? (campo && !campo.disabled ? campo : separador))?.focus();
  };
  const devolverFoco = (e: Event) => {
    e.preventDefault();
    const tratado = aoDevolverFoco?.(criou.current) === true;
    if (!tratado && !criou.current) botao.current?.focus();
    criou.current = false;
  };

  return (
    <>
      {!semBotao && (
        <Button ref={botao} type="button" onClick={() => mudarAberto(true)} className={`min-h-11 ${FOCO}`}>
          <Plus aria-hidden="true" />
          {t("businessGoals.new.open")}
        </Button>
      )}
      <Sheet open={aberto} onOpenChange={mudarAberto}>
        <SheetContent
          ref={conteudo} onOpenAutoFocus={focarAoAbrir}
          onInteractOutside={(e) => { if (sujo.current) e.preventDefault(); }}
          onCloseAutoFocus={devolverFoco}
          className="flex w-full flex-col gap-0 p-0 sm:w-1/2 sm:min-w-[640px] sm:max-w-none motion-reduce:!animate-none [&>button:last-child]:hidden"
        >
          <CabecalhoNovo titulo={titulo} descricao={descricao} selo={selo} aGuardar={aGuardar} />
          {corpo ? corpo({ aoSujar: () => { sujo.current = true; }, aoCriou: () => { criou.current = true; } }) : modo === "registos" && guardar ? (
            <FormularioRegistos
              pessoas={pessoas} hoje={HOJE_EXEMPLO} primeiroCampo={primeiroCampo} pessoaInicialId={pessoaInicialId} valoresIniciais={valoresIniciais}
              abaInicial={abaInicial} seccaoInicial={seccaoInicial} visitasGravadas={visitasGravadas} guardarLevantamento={guardar}
              aoSujar={() => { sujo.current = true; }}
            />
          ) : (
            <FormularioNovoNegocio
              pessoas={pessoas} primeiroCampo={primeiroCampo} pessoaInicialId={pessoaInicialId} valoresIniciais={valoresIniciais}
              aoSujar={() => { sujo.current = true; }} aoConfirmar={confirmar}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
