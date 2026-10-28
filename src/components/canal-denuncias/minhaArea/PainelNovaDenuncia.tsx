// O painel lateral «Nova denúncia»: o MESMO assistente do formulário público, montado dentro de um Sheet de metade do ecrã
// (em estreito, largura total). Cabeçalho com migalhas, corpo que rola e rodapé fixo (Cancelar e o botão do passo).
import { useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTranslation } from "@/hooks/useTranslation";
import { FormularioDenuncia } from "../formulario/FormularioDenuncia";
import type { PessoaLigada } from "../lib/pessoaLigada";

interface PainelNovaDenunciaProps {
  aberto: boolean;
  onFechar: () => void;
  /** Depois de enviar, «Acompanhar esta denúncia»: a página muda de aba e fecha o painel. */
  onAcompanhar: (anonima: boolean) => void;
  organizacaoId: string;
  pessoa: PessoaLigada;
  /** Devolve o foco ao botão «Nova denúncia» que abriu o painel. */
  devolverFoco: () => void;
}

export function PainelNovaDenuncia({ aberto, onFechar, onAcompanhar, organizacaoId, pessoa, devolverFoco }: PainelNovaDenunciaProps) {
  const { t } = useTranslation();
  const conteudo = useRef<HTMLDivElement>(null);
  // Enquanto o envio está pendente, e numa anónima enviada até a pessoa confirmar que guardou o código e o PIN, o painel
  // não se fecha (Esc, clique fora, X): fechar desmontava o formulário e o código e o PIN perdiam-se sem rasto.
  const [bloqueado, setBloqueado] = useState(false);
  const travar = (e: Event): void => {
    if (bloqueado) e.preventDefault();
  };
  return (
    <Sheet open={aberto} onOpenChange={(a) => { if (!a && !bloqueado) onFechar(); }}>
      <SheetContent
        ref={conteudo}
        onOpenAutoFocus={(e) => { e.preventDefault(); conteudo.current?.querySelector<HTMLElement>("form h2")?.focus(); }}
        onCloseAutoFocus={(e) => { e.preventDefault(); devolverFoco(); }}
        onEscapeKeyDown={travar}
        onInteractOutside={travar}
        className="flex w-full flex-col gap-0 p-0 sm:w-1/2 sm:min-w-[560px] sm:max-w-none motion-reduce:!animate-none motion-reduce:!duration-0"
      >
        <SheetHeader className="space-y-2 border-b border-border p-6 pr-14 text-left">
          <nav aria-label={t("cd.migalhas")}>
            <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <li>{t("cdm.minhas.titulo")}</li>
              <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
              <li aria-current="page" className="font-medium text-foreground">{t("cdm.denunciar.botao")}</li>
            </ol>
          </nav>
          <SheetTitle className="text-lg">{t("cdm.denunciar.botao")}</SheetTitle>
          <SheetDescription>{t("cdm.denunciar.subtitulo")}</SheetDescription>
        </SheetHeader>
        <FormularioDenuncia
          organizacaoId={organizacaoId}
          pessoa={pessoa}
          painel={{ onCancelar: onFechar, onAcompanhar, onBloquear: setBloqueado }}
        />
      </SheetContent>
    </Sheet>
  );
}
