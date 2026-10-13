// A barra de ações da ficha: Ligar, WhatsApp e Email são ligações em contorno (só existem se há telefone ou email),
// "Registar chamada" é o único botão cheio e "Mais" guarda o resto. Cada ação abre um painel em linha, não um popover.
import { useRef } from "react";
import { ArrowRight, Mail, MessageCircle, MoreHorizontal, Phone } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAnunciar } from "./anuncioFicha";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FOCO } from "@/components/negocio-metas/estilos";
import { ligacoes } from "./acoesPessoa";
import type { AcaoFicha } from "./PainelBase";
import type { ResumoPessoa } from "./pessoasTipos";

const BOTAO = cn("min-h-11 gap-2", FOCO);

interface BarraAcoesProps {
  resumo: ResumoPessoa;
  /** O painel aberto, se houver. */
  aberta: AcaoFicha | null;
  painelId: string;
  /** `origem` é o botão a que o foco regressa quando o painel fecha. */
  aoAbrir: (acao: AcaoFicha, origem: HTMLElement | null) => void;
  aoReativar: () => void;
}

/** Ligar, WhatsApp e Email: ligações em contorno, com ícone e texto, só para o contacto que existe. */
function Ligacoes({ resumo }: { resumo: ResumoPessoa }) {
  const { t } = useTranslation();
  const l = ligacoes(resumo.pessoa.contacto);
  return (
    <>
      {l.telefone && (
        <Button asChild variant="outline" className={BOTAO}>
          <a href={l.telefone}><Phone aria-hidden="true" />{t("pessoasPagina.bar.dial")}</a>
        </Button>
      )}
      {l.whatsapp && (
        <Button asChild variant="outline" className={BOTAO}>
          <a href={l.whatsapp} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden="true" />
            {t("pessoasPagina.bar.whatsapp")}
            <span className="sr-only">{t("pessoasPagina.bar.newTab")}</span>
          </a>
        </Button>
      )}
      {l.email && (
        <Button asChild variant="outline" className={BOTAO}>
          <a href={l.email}><Mail aria-hidden="true" />{t("pessoasPagina.bar.email")}</a>
        </Button>
      )}
    </>
  );
}

/**
 * "Mais": Nota, Adiar, Criar negócio e, no fim e separada, "Marcar como perdida" (uma lead, em qualquer passo antes de
 * cliente, mesmo com negócios abertos) ou, numa perdida, "Reativar lead". Um cliente não se perde.
 */
function MenuMais({ resumo, aoAbrir, aoReativar }: BarraAcoesProps) {
  const { t } = useTranslation();
  const anunciar = useAnunciar();
  const gatilho = useRef<HTMLButtonElement>(null);
  const escolhida = useRef(false);
  const { pessoa, papel } = resumo;
  const abrir = (acao: AcaoFicha) => {
    escolhida.current = true;
    aoAbrir(acao, gatilho.current);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={gatilho} type="button" variant="outline" className={BOTAO}>
          <MoreHorizontal aria-hidden="true" />
          {t("pessoasPagina.bar.more")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start" className="min-w-48"
        onCloseAutoFocus={(e) => { if (escolhida.current) { e.preventDefault(); escolhida.current = false; } }}
      >
        <DropdownMenuItem className="min-h-11" onSelect={() => abrir("nota")}>{t("pessoasPagina.bar.note")}</DropdownMenuItem>
        <DropdownMenuItem className="min-h-11" onSelect={() => abrir("adiar")}>{t("pessoasPagina.bar.snooze")}</DropdownMenuItem>
        <DropdownMenuItem className="min-h-11" onSelect={() => { const m = t("pessoasPagina.bar.createToast", { name: pessoa.nome }); toast.info(m); anunciar(m); }}>
          {t("pessoasPagina.bar.createDeal")}
        </DropdownMenuItem>
        {papel === "lead" && (
          <>
            <DropdownMenuSeparator />
            {pessoa.perdida ? (
              <DropdownMenuItem className="min-h-11" onSelect={aoReativar}>{t("pessoasPagina.bar.reactivate")}</DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="min-h-11 text-destructive focus:text-destructive" onSelect={() => abrir("perder")}>
                {t("pessoasPagina.bar.markLost")}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BarraAcoesFicha(p: BarraAcoesProps) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("pessoasPagina.actions.label")} className="flex flex-wrap gap-2 px-6 pb-4">
      <Ligacoes resumo={p.resumo} />
      <Button
        type="button" className={BOTAO} aria-expanded={p.aberta === "chamada"} aria-controls={p.aberta === "chamada" ? `${p.painelId}-chamada` : undefined}
        onClick={(e) => p.aoAbrir("chamada", e.currentTarget)}
      >
        {t("pessoasPagina.bar.call")}
        <ArrowRight aria-hidden="true" />
      </Button>
      <MenuMais {...p} />
    </div>
  );
}
