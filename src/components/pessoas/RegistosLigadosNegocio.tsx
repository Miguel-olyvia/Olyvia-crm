// "Registos ligados" de um negócio, dentro da ficha da pessoa: o que (contactos, visitas e levantamentos) já pertence a este negócio e o que
// ainda está por ligar, com o botão de ligar e o de desligar (só com o negócio aberto). Nada se copia: o registo continua a ser da pessoa e
// só aponta para o negócio. No exemplo liga-se nos stores em memória; na ficha real (com as mutações por contexto) liga-se na base, ver
// `RegistosLigadosReal`.
import { useTranslation } from "@/hooks/useTranslation";
import { useAnunciar } from "@/components/ficha-comum/anuncioFicha";
import { registosDoNegocio, registosPorLigar } from "@/components/negocio-metas/acoesRegistos";
import { useMutacoesDaFicha } from "@/components/negocio-metas/mutacoesNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { desligarRegisto, ligarRegisto, useRegistosPessoa } from "@/components/negocio-metas/registosPessoa";
import { itensDe, oQueDoRegisto, RegistosLigadosLista, type ItemRegisto } from "./RegistosLigadosLista";
import { RegistosLigadosReal } from "./RegistosLigadosReal";

const P = "pessoasPagina.linked.";

function RegistosLigadosExemplo({ negocio, aberto }: { negocio: NegocioMes; aberto: boolean }) {
  const { t } = useTranslation();
  const anunciar = useAnunciar();
  const estado = useRegistosPessoa();
  const ligados = itensDe(registosDoNegocio(estado, negocio.id));
  const porLigar = itensDe(registosPorLigar(estado, negocio.pessoaId ?? ""));
  const oQue = (i: ItemRegisto): string => oQueDoRegisto(t, i);
  return (
    <RegistosLigadosLista
      ligados={ligados} porLigar={porLigar} aberto={aberto} podeAgir desligaLevantamento oQue={oQue}
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
