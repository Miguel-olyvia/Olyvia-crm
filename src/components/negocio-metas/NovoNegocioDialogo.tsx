import { useRef, useState } from "react";
import { ChevronRight, Plus, Sparkles, X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FormularioNovoNegocio } from "./FormularioNovoNegocio";
import { FOCO } from "./estilos";
import { HOJE_EXEMPLO } from "./negocioMetasExemplo";
import type { DadosCriarNegocio, PessoaOpcao } from "./novoNegocio";

interface NovoNegocioDialogoProps {
  /** As pessoas a escolher; a página monta a lista (esta pasta não importa de Pessoas). */
  pessoas: readonly PessoaOpcao[];
  /** Chamado ao confirmar, já com o painel a fechar. */
  aoCriar: (dados: DadosCriarNegocio) => void;
  /** Controlo de fora (por exemplo a ficha de uma pessoa): sem isto o painel abre com o próprio botão. */
  aberto?: boolean;
  aoMudarAberto?: (aberto: boolean) => void;
  /** Não mostra o botão "Novo negócio" (o painel abre só por `aberto`). */
  semBotao?: boolean;
  /** A pessoa já escolhida ao abrir (a ficha de onde se veio); ainda se pode mudar. */
  pessoaInicialId?: string;
}

/** O cabeçalho do painel: migalhas "Negócio e metas › Novo negócio", título, selo "Novo · por gravar" e Fechar. */
function CabecalhoNovo() {
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
          <Button type="button" variant="ghost" size="icon" aria-label={t("businessGoals.new.close")} className={cn("-mr-2 -mt-2 h-11 w-11", FOCO)}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </SheetClose>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SheetTitle className="text-lg">{t("businessGoals.new.title")}</SheetTitle>
        <span className="inline-flex items-center gap-1 rounded-sm border border-primary px-1.5 py-0.5 text-xs font-semibold text-primary dark:text-violet-300">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {t("businessGoals.new.badge")}
        </span>
      </div>
      <SheetDescription>{t("businessGoals.new.description")}</SheetDescription>
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
  pessoas, aoCriar, aberto: abertoDeFora, aoMudarAberto, semBotao = false, pessoaInicialId,
}: NovoNegocioDialogoProps) {
  const { t } = useTranslation();
  const [abertoProprio, setAbertoProprio] = useState(false);
  const aberto = abertoDeFora ?? abertoProprio;
  const setAberto = (valor: boolean) => { setAbertoProprio(valor); aoMudarAberto?.(valor); };
  const botao = useRef<HTMLButtonElement>(null);
  const primeiroCampo = useRef<HTMLButtonElement>(null);
  const criou = useRef(false);
  const sujo = useRef(false);

  const mudarAberto = (valor: boolean) => {
    if (valor) sujo.current = false;
    setAberto(valor);
  };

  const confirmar = (dados: DadosCriarNegocio) => {
    criou.current = true;
    setAberto(false);
    aoCriar(dados);
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
          onOpenAutoFocus={(e) => { e.preventDefault(); primeiroCampo.current?.focus(); }}
          onInteractOutside={(e) => { if (sujo.current) e.preventDefault(); }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (!criou.current) botao.current?.focus();
            criou.current = false;
          }}
          className="flex w-full flex-col gap-0 p-0 sm:w-1/2 sm:min-w-[640px] sm:max-w-none motion-reduce:!animate-none [&>button:last-child]:hidden"
        >
          <CabecalhoNovo />
          <FormularioNovoNegocio
            pessoas={pessoas} hoje={HOJE_EXEMPLO} primeiroCampo={primeiroCampo} pessoaInicialId={pessoaInicialId}
            aoSujar={() => { sujo.current = true; }} aoConfirmar={confirmar}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
