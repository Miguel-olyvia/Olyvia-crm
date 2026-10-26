// O guia do passo seguinte de uma PESSOA, no topo da ficha. É o ÚNICO cabeçalho da ficha (nome, estado, contactos, Email e Mais, paginador e «Marcar como
// perdido»), a única barra de fases e o único cartão do cliente. Cada passo faz-se no próprio ecrã, com o que a ficha já tem: registar a chamada abre
// o formulário da chamada, marcar a visita abre o diálogo de marcar visita e criar o negócio abre «Novo negócio»; a visita e o levantamento fazem-se no assistente de
// passos (nunca no painel «Visita e levantamento»). Sem item de abordagem (a pessoa já tem negócio aberto, ou é cliente, ou está perdida ou encerrada) o guia fica sem passo: o
// cabeçalho, a barra de fases e o cartão do cliente. Nada se grava aqui: o guia só escolhe qual painel abrir.
import { useMemo, type MouseEvent, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useLevantamentoDoNegocio } from "@/components/pessoas-processo/LevantamentoDoNegocioReal";
import { ContactoDoGuia } from "./assistente/ContactoDoGuia";
import { VisitaDoGuia } from "./assistente/VisitaDoGuia";
import { passoDaPerdida, passoAtual } from "./etapaPessoa";
import type { PecasCabecalhoFicha } from "./CabecalhoGuiaFicha";
import { GuiaDoPasso } from "./GuiaDoPasso";
import { acontecimentosDoGuia, clienteDoGuia, dadosDoGuia } from "./guiaDados";
import { useMarcarVisita, type AberturaVisita } from "./marcarVisitaContexto";
import { moradaDaLead } from "./moradaVisita";
import type { CapacidadesFicha } from "./PainelBase";
import type { ItemAtividade, Pessoa, ResumoPessoa } from "./pessoasTipos";
import { calcularPassoGuiado, fasesDaPessoa, fasesDaPessoaSemPasso, type FaseGuia } from "./processo/passoGuiado";
import { itensDaPessoa } from "./processo/itensProcesso";
import { useProcesso } from "./processo/processoContexto";
import { useExtrasProcesso } from "./processo/processoNegocios";
import type { PassoProcesso } from "./processo/tiposProcesso";
import { Prazo } from "./SeccoesResumo";

/** As fases da abordagem em que o guia é o assistente de passos: Por contactar e Contactado (fase Contacto) e Visita. */
const FASES_COM_ASSISTENTE: readonly string[] = ["porContactar", "contactado", "visita"];

interface GuiaDaPessoaProps {
  resumo: ResumoPessoa;
  hoje: string;
  atividade: readonly ItemAtividade[];
  capacidades?: CapacidadesFicha;
  /** Abre o formulário «Registar chamada» da ficha; `origem` é o botão a que o foco volta. */
  aoRegistarChamada: (origem: HTMLElement | null) => void;
  /** Abre «Novo negócio» para esta pessoa; ausente sem permissão para criar. */
  aoCriarNegocio?: (pessoa: Pessoa) => void;
  /** Abre «Encerrar a abordagem» (o «Marcar como perdido» de uma lead); ausente quando não se pode encerrar. */
  aoEncerrar?: (origem: HTMLElement | null) => void;
  /** Abre «Adiar» (o painel que define o prazo): o «Alterar prazo» do passo. Ausente: o prazo só se lê. */
  aoAdiar?: (origem: HTMLElement | null) => void;
  /** O cabeçalho único da ficha (título, selos, paginador, Email e Mais); sem isto (o guia sozinho) o guia desenha o seu nome. */
  cabecalhoFicha?: PecasCabecalhoFicha;
}

/** As fases de uma pessoa sem passo: onde ficou uma perdida ou encerrada (a vermelho), um cliente (todas feitas) ou quem já tem negócio (a fase Negócio). */
function fasesSemPasso(resumo: ResumoPessoa): FaseGuia[] {
  const { pessoa, papel } = resumo;
  if (pessoa.perdida) return fasesDaPessoaSemPasso(passoDaPerdida(resumo), "perdida");
  if (pessoa.encerrada) return fasesDaPessoaSemPasso(passoAtual(resumo), "perdida");
  if (papel === "cliente") return fasesDaPessoaSemPasso(3, "concluida");
  return fasesDaPessoaSemPasso(3, "atual");
}

export function GuiaDaPessoa({ resumo, hoje, atividade, capacidades, aoRegistarChamada, aoCriarNegocio, aoEncerrar, aoAdiar, cabecalhoFicha }: GuiaDaPessoaProps) {
  const { t } = useTranslation();
  const processo = useProcesso();
  const marcar = useMarcarVisita();
  const levantamento = useLevantamentoDoNegocio();
  const extras = useExtrasProcesso();
  const { pessoa } = resumo;
  const item = useMemo(() => itensDaPessoa(resumo, hoje, extras).find((i) => i.tipo === "pessoa"), [resumo, hoje, extras]);
  const acontecimentos = useMemo(() => acontecimentosDoGuia(t, atividade), [t, atividade]);
  // `comPainelVisita` diz se quem está na sessão pode escrever na pessoa (a ficha real); o exemplo não o diz, e então pode.
  const podeEscrever = processo?.comPainelVisita !== false;
  const ligados = new Set<PassoProcesso>();
  if (capacidades?.chamada !== false) ligados.add("registarChamada");
  if (marcar && podeEscrever && capacidades?.visita !== false) ligados.add("marcarVisita");
  if (aoCriarNegocio) ligados.add("criarNegocio");
  const fases = item ? fasesDaPessoa(item.fase) : fasesSemPasso(resumo);
  const passo = item
    ? calcularPassoGuiado(item, {
      dados: dadosDoGuia(pessoa, resumo.registos, t), fases, podeEditar: podeEscrever,
      podeCriar: aoCriarNegocio !== undefined, pessoaFechada: false, ligados,
    })
    : null;
  const aoAcao = (e: MouseEvent<HTMLElement>): void => {
    const origem = e.currentTarget;
    switch (passo?.passo) {
      case "registarChamada": aoRegistarChamada(origem); break;
      case "marcarVisita": marcar?.pedir({ pessoaId: pessoa.id, nome: pessoa.nome, moradaLead: moradaDaLead(pessoa) }); break;
      case "criarNegocio": aoCriarNegocio?.(pessoa); break;
      default: break;
    }
  };
  const { cliente, local } = clienteDoGuia(pessoa, null);
  // O assistente de passos (Contacto e Visita): no lugar do «passo seguinte» único. Sem negócio, os passos que gravam nele mostram a razão e «Criar o negócio».
  const ficha = levantamento?.ficha ?? null;
  const criarNegocio = aoCriarNegocio ? () => aoCriarNegocio(pessoa) : undefined;
  const marcarVisita = marcar && podeEscrever && capacidades?.visita !== false
    ? (preparar?: AberturaVisita["preparar"]) => marcar.pedir({ pessoaId: pessoa.id, nome: pessoa.nome, moradaLead: moradaDaLead(pessoa), ...(preparar ? { preparar } : {}) })
    : undefined;
  const nivel = cabecalhoFicha?.nomeEl !== undefined ? "h3" : "h2";
  const assistente = passo && item && FASES_COM_ASSISTENTE.includes(item.fase)
    ? ({ aoVerFase, extra: extraDoGuia }: { aoVerFase: (id: string) => void; extra?: ReactNode }) => (item.fase === "visita" ? (
      <VisitaDoGuia
        pessoa={pessoa} negocio={null} visitas={resumo.registos.visitas} levantamentoGuardado={false} ficha={ficha} podeEditar={podeEscrever}
        aoCriarNegocio={criarNegocio} aoMarcarOutra={marcarVisita ? () => marcarVisita() : undefined}
        faseRotuloChave={passo.faseRotuloChave} feitas={passo.feitas} aoVerFase={aoVerFase} nivel={nivel} extra={extraDoGuia}
      />
    ) : (
      <ContactoDoGuia
        pessoa={pessoa} negocio={null} chamadas={resumo.registos.contactos.length} visitaMarcada={resumo.registos.visitas.some((v) => v.estado !== "cancelada")}
        ultimoResultado={dadosDoGuia(pessoa, resumo.registos).ultimoResultado}
        podeEditar={podeEscrever} podeRegistarChamada={capacidades?.chamada !== false} aoRegistarChamada={(origem) => aoRegistarChamada(origem)}
        aoCriarNegocio={criarNegocio} aoMarcarVisita={marcarVisita ? (preparar) => marcarVisita(preparar) : undefined}
        faseRotuloChave={passo.faseRotuloChave} feitas={passo.feitas} aoVerFase={aoVerFase} nivel={nivel} extra={extraDoGuia}
      />
    ))
    : undefined;
  // O prazo do passo (o que antes vivia no «Próximo passo e prazo»), com a hora quando o prazo é o próximo contacto.
  const prazo = resumo.proximo.prazo;
  const podeAdiar = aoAdiar !== undefined && capacidades?.adiar !== false && !resumo.proximoDeVisita;
  // Outra chamada ou tentativa regista-se sempre, em qualquer fase da abordagem; no passo de registar a chamada o botao principal ja o faz.
  const podeOutraChamada = passo !== null && passo.passo !== "registarChamada" && capacidades?.chamada !== false;
  const extra: ReactNode = passo ? (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Prazo prazo={prazo} hoje={hoje} hora={prazo !== null && prazo === resumo.proximoContacto ? resumo.proximoHora : undefined} />
      {podeOutraChamada && (
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={(e) => aoRegistarChamada(e.currentTarget)}>
          {t("pessoasPagina.guia.outraChamada")}
        </Button>
      )}
      {podeAdiar && (
        <Button type="button" variant="ghost" className={cn("min-h-11", FOCO)} onClick={(e) => aoAdiar?.(e.currentTarget)}>
          {t("pessoasPagina.guia.alterarPrazo")}
        </Button>
      )}
    </div>
  ) : undefined;
  return (
    <GuiaDoPasso
      passo={passo} fases={fases} aoAcao={aoAcao} acontecimentos={acontecimentos} cliente={cliente} extra={extra} assistente={assistente}
      cabecalho={{ nome: pessoa.nome, telefone: cliente.telefone, local }} tituloSecao={t("pessoasPagina.guia.regiao")}
      {...cabecalhoFicha}
      acaoPerder={aoEncerrar ? (
        <Button type="button" variant="ghost" className={cn("min-h-11", FOCO)} onClick={(e) => aoEncerrar(e.currentTarget)}>
          {t("pessoasPagina.guia.perder")}
        </Button>
      ) : undefined}
    />
  );
}
