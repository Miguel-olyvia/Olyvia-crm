// Os botões do fecho v4 (só se montam com a bandeira ligada): «Fechar agora», «Converter em cliente», «Reabrir negócio» e «Manter perdido» /
// «Dispensar o aviso». A interface oferece; quem decide é a base (permissões e estados). Cada um espera pela base, ignora o duplo clique
// (`aria-busy`) e diz o erro traduzido em `role="alert"`. Sem a mutação que o serve, ou sem a permissão que o ecrã sabe, não desenha nada.
import { useId, useState } from "react";
import { CheckCircle2, ShieldCheck, UserCheck, Undo2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useDadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { ErroDeEnvio } from "@/components/negocio-metas/DialogoDeEnvio";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import { useMutacoesDaFicha, type ResultadoReavaliar } from "@/components/negocio-metas/mutacoesNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { useAvisarNegocio } from "@/components/negocio-metas/useAvisarNegocio";
import { useEnvioAssincrono } from "@/components/negocio-metas/useEnvioAssincrono";
import { ReabrirNegocioDialogo } from "./ReabrirNegocioDialogo";

const N = "pessoasPagina.neg.close.";
/** As provas que a base devolve e o ecrã sabe dizer por palavras; outra qualquer não se mostra (nunca um código em bruto). */
const PROVAS: readonly string[] = ["P1", "P2", "P3", "utilizador"];
const CLASSE = cn("min-h-11 gap-2", FOCO, PISTA_DESATIVADO);

interface BotaoProps {
  negocio: NegocioMes;
}

/** «A guardar…» para o leitor de ecrã: `aria-busy` num botão fora de um diálogo não se anuncia de forma fiável. Sempre montada, para se anunciar. */
function EstadoDeEnvio({ aGuardar }: { aGuardar: boolean }) {
  const { t } = useTranslation();
  return <span role="status" aria-live="polite" className="sr-only">{aGuardar ? t("pessoasPagina.neg.saving") : ""}</span>;
}

/** O texto do que «Fechar agora» fez, com a origem, a prova e a conversão que a base devolveu (só o que ela trouxe e o ecrã conhece). */
function ResumoDoFecho({ resultado }: { resultado: ResultadoReavaliar }) {
  const { t } = useTranslation();
  if (!resultado.mudou || resultado.estado !== "ganho") return <p>{t(`${N}now.stillOpen`)}</p>;
  const ganho = resultado.origemTipo ? t(`${N}now.won`, { kind: t(`${N}kind.${resultado.origemTipo}`) }) : t(`${N}now.wonNoKind`);
  const prova = resultado.prova !== null && PROVAS.includes(resultado.prova) ? t(`${N}proof.${resultado.prova}`) : null;
  return (
    <>
      <p className="font-medium">{ganho}</p>
      {prova && <p>{t(`${N}now.proof`, { proof: prova })}</p>}
      {resultado.conversao && <p>{t(`${N}conversion.${resultado.conversao}`)}</p>}
    </>
  );
}

/** «Fechar agora»: só num negócio aberto pronto a ganhar. `mostrarResultado`: o resumo do que a base fez, por baixo do botão. */
export function BotaoFecharAgora({ negocio, mostrarResultado = true }: BotaoProps & { mostrarResultado?: boolean }) {
  const { t } = useTranslation();
  const dados = useDadosNegocio();
  const mutacoes = useMutacoesDaFicha();
  const avisar = useAvisarNegocio();
  const envio = useEnvioAssincrono();
  const [resultado, setResultado] = useState<ResultadoReavaliar | null>(null);
  const idDica = useId();
  const reavaliar = mutacoes?.reavaliar;
  // Depois de fechar o negócio deixa de estar aberto (a ficha refaz-se), mas o resumo do que a base fez continua à vista.
  const oferece = dados?.podeEditar === true && negocio.estadoReal === "aberto" && negocio.prontoAGanhar === true;
  if (!dados || !reavaliar || (!resultado && !oferece)) return null;
  const clicar = () => {
    if (envio.aGuardar) return;
    const caixa: { obtido?: ResultadoReavaliar } = {};
    envio.enviar(
      async () => { caixa.obtido = await reavaliar(negocio.id); },
      () => {
        const obtido = caixa.obtido;
        if (!obtido) return;
        setResultado(obtido);
        avisar(t(obtido.mudou && obtido.estado === "ganho" ? `${N}now.done` : `${N}now.noChange`, { name: negocio.pessoa, work: negocio.servico }));
      },
    );
  };
  return (
    <div className="space-y-2">
      {oferece && (
        <>
          <Button type="button" variant="outline" className={CLASSE} aria-describedby={idDica} aria-disabled={envio.aGuardar || undefined} aria-busy={envio.aGuardar || undefined} onClick={clicar}>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {t(`${N}now.button`)}
          </Button>
          <span id={idDica} className="sr-only">{t(`${N}now.hint`)}</span>
        </>
      )}
      <ErroDeEnvio chave={envio.erro} />
      <EstadoDeEnvio aGuardar={envio.aGuardar} />
      {mostrarResultado && resultado && (
        <div role="status" aria-label={t(`${N}now.result`)} className="space-y-1 rounded-md border border-border bg-muted/40 p-3 text-[15px] text-foreground">
          <ResumoDoFecho resultado={resultado} />
        </div>
      )}
    </div>
  );
}

/** «Converter em cliente»: só num negócio ganho com a conversão por fazer, com pessoas.edit e (se o ecrã o sabe) leads.convert. A base decide (NG007). */
export function BotaoConverterEmCliente({ negocio }: BotaoProps) {
  const { t } = useTranslation();
  const dados = useDadosNegocio();
  const mutacoes = useMutacoesDaFicha();
  const avisar = useAvisarNegocio();
  const envio = useEnvioAssincrono();
  const pendente = negocio.conversaoPendente === true || negocio.alerta?.codigo === "conversao_falhou";
  if (!dados || !mutacoes || dados.podeEditar !== true || dados.podeConverter === false || negocio.estadoReal !== "ganho" || !pendente) return null;
  const converter = () => {
    if (envio.aGuardar) return;
    envio.enviar(() => mutacoes.ganhar(negocio.id, null), () => avisar(t(`${N}convert.done`, { name: negocio.pessoa })));
  };
  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" className={CLASSE} aria-disabled={envio.aGuardar || undefined} aria-busy={envio.aGuardar || undefined} onClick={converter}>
        <UserCheck className="h-4 w-4" aria-hidden="true" />
        {t(`${N}convert.button`)}
      </Button>
      <ErroDeEnvio chave={envio.erro} />
      <EstadoDeEnvio aGuardar={envio.aGuardar} />
    </div>
  );
}

/** «Reabrir negócio»: só com `pessoas.reopen` (Super Admin). Sem a permissão o botão nem existe, em vez de ficar desativado sem explicação. */
export function BotaoReabrirNegocio({ negocio }: BotaoProps) {
  const { t } = useTranslation();
  const dados = useDadosNegocio();
  const mutacoes = useMutacoesDaFicha();
  const avisar = useAvisarNegocio();
  const [aberto, setAberto] = useState(false);
  if (!dados || !mutacoes?.reabrirGanho || dados.podeReabrir !== true || negocio.estadoReal !== "ganho") return null;
  return (
    <>
      <Button type="button" variant="outline" className={CLASSE} onClick={() => setAberto(true)}>
        <Undo2 className="h-4 w-4" aria-hidden="true" />
        {t(`${N}reopen.button`)}
      </Button>
      <ReabrirNegocioDialogo negocio={aberto ? negocio : null} aoFechar={() => setAberto(false)} aoReaberto={avisar} />
    </>
  );
}

/** «Manter perdido» (num negócio perdido) ou «Dispensar o aviso» (nos outros): limpa o alerta em aberto e a base regista o acompanhamento. */
export function BotaoDispensarAlerta({ negocio, variante }: BotaoProps & { variante: "keep" | "dismiss" }) {
  const { t } = useTranslation();
  const dados = useDadosNegocio();
  const mutacoes = useMutacoesDaFicha();
  const avisar = useAvisarNegocio();
  const envio = useEnvioAssincrono();
  const dispensar = mutacoes?.dispensarAlerta;
  if (!dados || !dispensar || dados.podeEditar !== true || !negocio.alerta) return null;
  const clicar = () => {
    if (envio.aGuardar) return;
    envio.enviar(() => dispensar(negocio.id), () => avisar(t(`${N}${variante}.done`, { name: negocio.pessoa, work: negocio.servico })));
  };
  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" className={CLASSE} aria-disabled={envio.aGuardar || undefined} aria-busy={envio.aGuardar || undefined} onClick={clicar}>
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        {t(`${N}${variante}.button`)}
      </Button>
      <ErroDeEnvio chave={envio.erro} />
      <EstadoDeEnvio aGuardar={envio.aGuardar} />
    </div>
  );
}
