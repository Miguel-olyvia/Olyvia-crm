// O bloco de fecho do detalhe de um negócio (fecho v4), no lugar do antigo «Dar como ganho»: num negócio aberto, «Fechar agora» (quando há um
// documento decisivo com prova); num ganho, a origem do ganho, «Converter em cliente» e «Reabrir negócio». «Manter perdido» e a origem da perda
// vivem em `PerdaDoNegocio`. Só com a bandeira ligada, na ficha real; sem nada para mostrar não desenha nada.
import { useTranslation } from "@/hooks/useTranslation";
import { useFechoV4 } from "@/components/negocio-metas/bandeiraFecho";
import { useDadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { useMutacoesDaFicha } from "@/components/negocio-metas/mutacoesNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { BotaoConverterEmCliente, BotaoFecharAgora, BotaoReabrirNegocio } from "./BotoesFecho";
import { textoDiaCompleto } from "./formatoPessoas";

const N = "pessoasPagina.neg.close.";

/** Quem decidiu o negócio, em texto: «Ganho por proposta P-1 em 15/10/2026», ou «Perdido automaticamente…» / «Perdido à mão.». Sem o dado, nada. */
export function OrigemDaDecisao({ negocio }: { negocio: NegocioMes }) {
  const { t } = useTranslation();
  const origem = negocio.origemDecisao;
  if (negocio.estadoReal === "ganho") {
    if (!origem?.tipo) return null;
    const kind = t(`${N}kind.${origem.tipo}`);
    const date = origem.em ? t(`${N}origin.date`, { date: textoDiaCompleto(origem.em) }) : "";
    return <p className="text-[15px] text-foreground">{origem.numero ? t(`${N}origin.won`, { kind, number: origem.numero, date }) : t(`${N}origin.wonNoNumber`, { kind, date })}</p>;
  }
  if (negocio.estadoReal !== "perdido" || negocio.perdaAutomatica === undefined) return null;
  if (!negocio.perdaAutomatica) return <p className="text-sm text-muted-foreground">{t(`${N}origin.lostManual`)}</p>;
  const texto = origem?.tipo && origem.numero ? t(`${N}origin.lostAuto`, { kind: t(`${N}kind.${origem.tipo}`), number: origem.numero }) : t(`${N}origin.lostAutoNoDoc`);
  return <p className="text-sm text-muted-foreground">{texto}</p>;
}

export function BlocoFechoNegocio({ negocio }: { negocio: NegocioMes }) {
  const { t } = useTranslation();
  const ligada = useFechoV4();
  const dados = useDadosNegocio();
  const mutacoes = useMutacoesDaFicha();
  if (!ligada || !dados || !mutacoes) return null;
  // Aberto sem nada decisivo: nada a mostrar (o grupo ficaria vazio). Perdido: só a origem; «Manter perdido» vem no aviso.
  if (negocio.estadoReal === "perdido") return <OrigemDaDecisao negocio={negocio} />;
  if (negocio.estadoReal === "aberto" && negocio.prontoAGanhar !== true) return null;
  // O aviso em aberto já traz a ação que o resolve: aqui não se repete (duas ações com o mesmo nome e estados de envio separados).
  const aviso = negocio.alerta?.codigo ?? null;
  const fecharNoAviso = aviso === "sem_prova" && negocio.estadoReal === "aberto";
  const converterNoAviso = aviso === "conversao_falhou" && negocio.estadoReal === "ganho";
  const reabrirNoAviso = aviso === "recusa_depois_aceite" && negocio.estadoReal === "ganho";
  if (fecharNoAviso) return null;
  return (
    <div role="group" aria-label={t(`${N}group`)} className="space-y-3">
      <OrigemDaDecisao negocio={negocio} />
      <div className="flex flex-wrap items-start gap-3">
        <BotaoFecharAgora negocio={negocio} />
        {!converterNoAviso && <BotaoConverterEmCliente negocio={negocio} />}
        {!reabrirNoAviso && <BotaoReabrirNegocio negocio={negocio} />}
      </div>
    </div>
  );
}
