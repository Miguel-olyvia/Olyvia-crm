// "Registos ligados" de um negócio, dentro da ficha da pessoa: o que (contactos, visitas e levantamentos) já pertence a este negócio e o que
// ainda está por ligar, com o botão de ligar e o de desligar (só com o negócio aberto). Nada se copia: o registo continua a ser da pessoa e
// só aponta para o negócio. No exemplo liga-se nos stores em memória; na ficha real (com as mutações por contexto) liga-se na base, ver
// `RegistosLigadosReal`.
import { CalendarPlus } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAnunciar } from "@/components/ficha-comum/anuncioFicha";
import { registosDoNegocio, registosPorLigar } from "@/components/negocio-metas/acoesRegistos";
import { useMutacoesDaFicha } from "@/components/negocio-metas/mutacoesNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { FOCO } from "@/components/negocio-metas/estilos";
import { desligarRegisto, ligarRegisto, useRegistosPessoa } from "@/components/negocio-metas/registosPessoa";
import { itensDe, oQueDoRegisto, RegistosLigadosLista, type ItemRegisto } from "./RegistosLigadosLista";
import { useMarcarVisita } from "./marcarVisitaContexto";
import { moradaDaLead } from "./moradaVisita";
import { pessoasNovas } from "./pessoasNovas";
import { PESSOAS_EXEMPLO } from "./pessoasExemplo";
import { RegistosLigadosReal } from "./RegistosLigadosReal";

const P = "pessoasPagina.linked.";

/** A morada que a lead indicou (no exemplo a pessoa vive no exemplo ou nas leads criadas), como a que o passo «A fazer» oferece. */
const moradaDaLeadDe = (pessoaId: string) => {
  const pessoa = [...PESSOAS_EXEMPLO, ...pessoasNovas().pessoas].find((p) => p.id === pessoaId);
  return pessoa ? moradaDaLead(pessoa) : null;
};

function RegistosLigadosExemplo({ negocio, aberto }: { negocio: NegocioMes; aberto: boolean }) {
  const { t } = useTranslation();
  const anunciar = useAnunciar();
  const estado = useRegistosPessoa();
  // Só com o diálogo de marcar visita da página (o `ProcessoProvider`): sem ele o botão não existe.
  const marcarVisita = useMarcarVisita();
  const ligados = itensDe(registosDoNegocio(estado, negocio.id));
  const porLigar = itensDe(registosPorLigar(estado, negocio.pessoaId ?? ""));
  const oQue = (i: ItemRegisto): string => oQueDoRegisto(t, i);
  return (
    <RegistosLigadosLista
      ligados={ligados} porLigar={porLigar} aberto={aberto} podeAgir desligaLevantamento oQue={oQue}
      depois={aberto && marcarVisita && negocio.pessoaId ? (
        <Button
          type="button" variant="outline" className={cn("h-auto min-h-11 gap-2 whitespace-normal text-left", FOCO)}
          aria-label={t(`${P}markVisitLabel`, { deal: negocio.servico || negocio.pessoa })}
          onClick={() => marcarVisita.pedir({
            pessoaId: negocio.pessoaId ?? "", nome: negocio.pessoa, moradaLead: moradaDaLeadDe(negocio.pessoaId ?? ""), negocioId: negocio.id,
            aoMarcada: (ligada) => anunciar(t(`${P}live.${ligada ? "visitLinked" : "visitNotLinked"}`)),
          })}
        >
          <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t(`${P}markVisit`)}
        </Button>
      ) : null}
      aoDesligar={(i) => { if (desligarRegisto(i.ref, negocio.id, aberto)) anunciar(t(`${P}live.unlinked`, { what: oQue(i) })); }}
      aoLigar={(i) => { if (ligarRegisto(i.ref, negocio.id)) anunciar(t(`${P}live.linked`, { what: oQue(i) })); }}
    />
  );
}

export function RegistosLigadosNegocio({ negocio, aberto }: { negocio: NegocioMes; aberto: boolean }) {
  const mutacoes = useMutacoesDaFicha();
  return mutacoes
    ? <RegistosLigadosReal negocio={negocio} aberto={aberto} mutacoes={mutacoes} />
    : <RegistosLigadosExemplo negocio={negocio} aberto={aberto} />;
}
