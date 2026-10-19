// A barra de ações da ficha: Ligar, WhatsApp e Email são ligações em contorno (só existem se há telefone ou email),
// "Registar chamada" é o único botão cheio e "Mais" guarda o resto. Cada ação abre um painel em linha, não um popover.
import { useId, useRef } from "react";
import { ArrowRight, Mail, MessageCircle, MoreHorizontal, Phone } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FOCO } from "@/components/negocio-metas/estilos";
import { ligacoes } from "./acoesPessoa";
import type { AcaoFicha, CapacidadesFicha } from "./PainelBase";
import type { ResumoPessoa } from "./pessoasTipos";
import { useProcesso } from "./processo/processoContexto";

const BOTAO = cn("min-h-11 gap-2", FOCO);

interface BarraAcoesProps {
  resumo: ResumoPessoa;
  /** O painel aberto, se houver. */
  aberta: AcaoFicha | null;
  painelId: string;
  /** `origem` é o botão a que o foco regressa quando o painel fecha. */
  aoAbrir: (acao: AcaoFicha, origem: HTMLElement | null) => void;
  aoReativar: () => void;
  /** "Criar negócio" (uma lead) ou "Novo negócio" (um cliente): a página abre o painel "Novo negócio" com esta pessoa já escolhida. Sem isto (a ficha real, até ao P3) o item não existe. */
  aoCriarNegocio?: () => void;
  /** O que a versão em curso liga; sem isto (o exemplo) está tudo ligado. */
  capacidades?: CapacidadesFicha;
  /** Há uma ação do menu (reativar) à espera da base: o gatilho fica `aria-busy`. */
  aGuardar?: boolean;
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
 * "Mais": Nota, Adiar, Visita e levantamento (o painel dos registos da pessoa), o negócio e, no fim e separada, "Encerrar abordagem"
 * (uma lead sem negócio aberto: sem interesse, ou obra inviável, e não se cria negócio) ou, numa abordagem encerrada (ou numa lead perdida
 * do exemplo antigo), "Reativar abordagem". Um cliente não encerra a abordagem. O negócio cria-se à mão, para leads e clientes e em
 * qualquer fase, e liga registos existentes da pessoa: a lead tem "Criar negócio" e o cliente "Novo negócio". A visita e o levantamento
 * são opcionais.
 */
function MenuMais({ resumo, aoAbrir, aoReativar, aoCriarNegocio, capacidades, aGuardar }: BarraAcoesProps) {
  const { t } = useTranslation();
  const idExplicacao = useId();
  const processo = useProcesso();
  const gatilho = useRef<HTMLButtonElement>(null);
  const escolhida = useRef(false);
  const { pessoa, papel } = resumo;
  const adiarSemEfeito = resumo.proximoDeVisita;
  const fechada = !!pessoa.encerrada || !!pessoa.perdida;
  const encerrarLigado = capacidades?.encerrar !== false;
  const podeEncerrar = encerrarLigado && papel === "lead" && !fechada && resumo.abertos.length === 0;
  const podeReativar = encerrarLigado && fechada;
  const comNota = capacidades?.nota !== false;
  const comAdiar = capacidades?.adiar !== false;
  const comVisita = !!processo && !fechada && capacidades?.visita !== false;
  // Sem nenhum item (um cliente na ficha real) não há menu: um botão «Mais» vazio não faz nada.
  if (!comNota && !comAdiar && !comVisita && !aoCriarNegocio && !podeEncerrar && !podeReativar) return null;
  const criarNegocio = () => {
    escolhida.current = true;
    aoCriarNegocio?.();
  };
  const visitaELevantamento = () => {
    escolhida.current = true;
    processo?.abrirVisitaLevantamento(pessoa.id, gatilho.current);
  };
  const abrir = (acao: AcaoFicha) => {
    escolhida.current = true;
    aoAbrir(acao, gatilho.current);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={gatilho} type="button" variant="outline" className={BOTAO} data-ficha-mais aria-busy={aGuardar || undefined}>
          <MoreHorizontal aria-hidden="true" />
          {t("pessoasPagina.bar.more")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start" className="min-w-48"
        onCloseAutoFocus={(e) => { if (escolhida.current) { e.preventDefault(); escolhida.current = false; } }}
      >
        {comNota && <DropdownMenuItem className="min-h-11" onSelect={() => abrir("nota")}>{t("pessoasPagina.bar.note")}</DropdownMenuItem>}
        {/* Com o próximo contacto numa visita não há chamada a adiar: o item fica desativado e a explicação é texto, não só a cor. */}
        {comAdiar && (
          <>
            <DropdownMenuItem
              className="min-h-11" disabled={adiarSemEfeito} aria-describedby={adiarSemEfeito ? idExplicacao : undefined}
              onSelect={() => abrir("adiar")}
            >
              {t("pessoasPagina.bar.snooze")}
            </DropdownMenuItem>
            {/* A explicação fica FORA do item (o nome do item não a leva) e liga-se a ele por aria-describedby: é texto, não só a cor. */}
            {adiarSemEfeito && <p id={idExplicacao} className="px-2 pb-1.5 text-xs text-muted-foreground">{t("pessoasPagina.bar.snoozeVisit")}</p>}
          </>
        )}
        {comVisita && (
          <DropdownMenuItem className="min-h-11" onSelect={visitaELevantamento}>{t("pessoasPagina.bar.visitSurvey")}</DropdownMenuItem>
        )}
        {aoCriarNegocio && (
          <DropdownMenuItem className="min-h-11" onSelect={criarNegocio}>
            {t(papel === "cliente" ? "pessoasPagina.bar.newDeal" : "pessoasPagina.bar.createDeal")}
          </DropdownMenuItem>
        )}
        {(podeReativar || podeEncerrar) && (
          <>
            <DropdownMenuSeparator />
            {fechada ? (
              <DropdownMenuItem className="min-h-11" onSelect={aoReativar}>{t("pessoasPagina.close.bar.reopen")}</DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="min-h-11 text-destructive focus:text-destructive" onSelect={() => abrir("encerrar")}>
                {t("pessoasPagina.close.bar.close")}
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
      {p.capacidades?.chamada !== false && (
        <Button
          type="button" className={BOTAO} aria-expanded={p.aberta === "chamada"} aria-controls={p.aberta === "chamada" ? `${p.painelId}-chamada` : undefined}
          onClick={(e) => p.aoAbrir("chamada", e.currentTarget)}
        >
          {t("pessoasPagina.bar.call")}
          <ArrowRight aria-hidden="true" />
        </Button>
      )}
      <MenuMais {...p} />
    </div>
  );
}
