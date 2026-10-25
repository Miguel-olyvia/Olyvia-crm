// O guia do passo seguinte de uma PESSOA em abordagem (por contactar, contactado, visita), no topo do Resumo da ficha. Cada passo faz-se no próprio
// ecrã, com o que a ficha já tem: registar a chamada abre o formulário da chamada, marcar a visita abre o diálogo de marcar visita, a visita
// feita abre o painel «Visita e levantamento» e criar o negócio abre «Novo negócio». Sem item de abordagem (a pessoa já tem negócio aberto, ou
// está perdida ou encerrada) não desenha nada. Nada se grava aqui: o guia só escolhe qual painel abrir.
import { useMemo, type MouseEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { GuiaDoPasso } from "./GuiaDoPasso";
import { acontecimentosDoGuia, clienteDoGuia, dadosDoGuia } from "./guiaDados";
import { useMarcarVisita } from "./marcarVisitaContexto";
import { moradaDaLead } from "./moradaVisita";
import type { CapacidadesFicha } from "./PainelBase";
import type { ItemAtividade, Pessoa, ResumoPessoa } from "./pessoasTipos";
import { calcularPassoGuiado, fasesDaPessoa } from "./processo/passoGuiado";
import { itensDaPessoa } from "./processo/itensProcesso";
import { useProcesso } from "./processo/processoContexto";
import { useExtrasProcesso } from "./processo/processoNegocios";
import type { PassoProcesso } from "./processo/tiposProcesso";

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
}

export function GuiaDaPessoa({ resumo, hoje, atividade, capacidades, aoRegistarChamada, aoCriarNegocio, aoEncerrar }: GuiaDaPessoaProps) {
  const { t } = useTranslation();
  const processo = useProcesso();
  const marcar = useMarcarVisita();
  const extras = useExtrasProcesso();
  const { pessoa } = resumo;
  const item = useMemo(() => itensDaPessoa(resumo, hoje, extras).find((i) => i.tipo === "pessoa"), [resumo, hoje, extras]);
  const acontecimentos = useMemo(() => acontecimentosDoGuia(t, atividade), [t, atividade]);
  if (!item) return null;
  // `comPainelVisita` diz se quem está na sessão pode escrever na pessoa (a ficha real); o exemplo não o diz, e então pode.
  const podeEscrever = processo?.comPainelVisita !== false;
  const ligados = new Set<PassoProcesso>();
  if (capacidades?.chamada !== false) ligados.add("registarChamada");
  if (marcar && podeEscrever && capacidades?.visita !== false) ligados.add("marcarVisita");
  if (processo && podeEscrever && capacidades?.visita !== false) ligados.add("marcarVisitaFeita");
  if (aoCriarNegocio) ligados.add("criarNegocio");
  const passo = calcularPassoGuiado(item, {
    dados: dadosDoGuia(pessoa, resumo.registos), fases: fasesDaPessoa(item.fase), podeEditar: podeEscrever,
    podeCriar: aoCriarNegocio !== undefined, pessoaFechada: false, ligados,
  });
  const aoAcao = (e: MouseEvent<HTMLElement>): void => {
    const origem = e.currentTarget;
    switch (passo.passo) {
      case "registarChamada": aoRegistarChamada(origem); break;
      case "marcarVisita": marcar?.pedir({ pessoaId: pessoa.id, nome: pessoa.nome, moradaLead: moradaDaLead(pessoa) }); break;
      case "marcarVisitaFeita": processo?.abrirVisitaLevantamento(pessoa.id, origem); break;
      case "criarNegocio": aoCriarNegocio?.(pessoa); break;
      default: break;
    }
  };
  const { cliente, local } = clienteDoGuia(pessoa, null);
  return (
    <GuiaDoPasso
      passo={passo} fases={fasesDaPessoa(item.fase)} aoAcao={aoAcao} acontecimentos={acontecimentos} cliente={cliente}
      cabecalho={{ nome: pessoa.nome, telefone: cliente.telefone, local }} tituloSecao={t("pessoasPagina.guia.regiao")}
      acaoPerder={aoEncerrar ? (
        <Button type="button" variant="ghost" className={cn("min-h-11", FOCO)} onClick={(e) => aoEncerrar(e.currentTarget)}>
          {t("pessoasPagina.guia.perder")}
        </Button>
      ) : undefined}
    />
  );
}
