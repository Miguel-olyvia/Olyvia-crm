// «Perder o negócio»: perde-se em qualquer fase, com motivo (um da lista do Workflow, ou «Outro» com texto livre). No exemplo muda o negócio
// EM MEMÓRIA (`negociosAlterados.ts`) e guarda a fase em que estava, para a perda se poder anular: nada é gravado. Na ficha real (com as
// mutações da ficha por contexto, `mutacoesNegocio.ts`) a perda vai para a base (neg_perder_negocio), com a fase na linguagem da base
// (`faseParaBase`: «ganho» nunca), espera por ela (aria-busy, «A guardar…») e traduz o erro pelo código dentro do diálogo. O aviso para o
// leitor de ecrã sai por `aoPerder`, depois de o diálogo fechar (quem o monta decide como o diz).
import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { CamposMotivoPerda } from "./CamposMotivoPerda";
import { DialogoDeEnvio, ErroDeEnvio } from "./DialogoDeEnvio";
import { faseParaBase } from "./faseBase";
import { FOCO, PISTA_DESATIVADO } from "./estilos";
import { useMutacoesDaFicha } from "./mutacoesNegocio";
import type { NegocioMes } from "./negocioMetas";
import { perderNegocio } from "./negociosAlterados";
import { erroDoMotivoPerda, motivoDaPerda } from "./perdaNegocio";
import { faseNaPerda } from "./percursoNegocio";
import { useRegistosPessoa } from "./registosPessoa";
import type { EnvioAssincrono } from "./useEnvioAssincrono";

const L = "businessGoals.lose.";

interface PerderNegocioDialogoProps {
  /** O negócio a perder; `null` = fechado. */
  negocio: NegocioMes | null;
  /** O dia de hoje (AAAA-MM-DD). */
  hoje: string;
  /** Os motivos da lista do Workflow (`ConfigWorkflow.motivosPerda`). */
  motivos: readonly string[];
  aoFechar: () => void;
  /** Depois de perder: o texto para o leitor de ecrã (o diálogo já pediu para fechar). */
  aoPerder?: (anuncio: string) => void;
}

type FormPerdaProps = Omit<PerderNegocioDialogoProps, "negocio"> & { negocio: NegocioMes; envio: EnvioAssincrono };

function FormPerda({ negocio, hoje, motivos, aoFechar, aoPerder, envio }: FormPerdaProps) {
  const { t } = useTranslation();
  const mutacoes = useMutacoesDaFicha();
  const registos = useRegistosPessoa();
  const [escolhido, setEscolhido] = useState("");
  const [outro, setOutro] = useState("");
  const [tentou, setTentou] = useState(false);
  const seletor = useRef<HTMLSelectElement>(null);
  const campoOutro = useRef<HTMLInputElement>(null);
  const erro = tentou ? erroDoMotivoPerda(escolhido, outro) : null;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (envio.aGuardar) return;
    setTentou(true);
    const falha = erroDoMotivoPerda(escolhido, outro);
    if (falha) { (falha === "outroVazio" ? campoOutro : seletor).current?.focus(); return; }
    const motivo = motivoDaPerda(escolhido, outro);
    if (motivo === null) return;
    const anuncio = t(`${L}done`, { name: negocio.pessoa, work: negocio.servico, reason: motivo });
    if (mutacoes) {
      const fase = faseParaBase(faseNaPerda(negocio, registos));
      envio.enviar(() => mutacoes.perder({ negocioId: negocio.id, fase, motivo }), () => { aoFechar(); aoPerder?.(anuncio); });
      return;
    }
    perderNegocio(negocio, motivo, hoje);
    aoFechar();
    aoPerder?.(anuncio);
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <CamposMotivoPerda
        motivos={motivos} escolhido={escolhido} outro={outro} erro={erro} seletorRef={seletor} outroRef={campoOutro}
        aoMudar={(p) => { if (p.escolhido !== undefined) setEscolhido(p.escolhido); if (p.outro !== undefined) setOutro(p.outro); }}
      />
      <ErroDeEnvio chave={envio.erro} />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button
          type="button" variant="outline" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined}
          onClick={() => { if (!envio.aGuardar) aoFechar(); }}
        >
          {t(`${L}cancel`)}
        </Button>
        <Button
          type="submit" variant="destructive" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined}
          aria-busy={envio.aGuardar || undefined}
        >
          {t(`${L}confirm`)}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function PerderNegocioDialogo({ negocio, hoje, motivos, aoFechar, aoPerder }: PerderNegocioDialogoProps) {
  const { t } = useTranslation();
  const registos = useRegistosPessoa();
  const ultimo = useRef<NegocioMes | null>(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  const fase = mostrado ? faseNaPerda(mostrado, registos) : "orcamento";
  return (
    <DialogoDeEnvio
      aberto={negocio !== null} aoFechar={aoFechar} titulo={t(`${L}title`)}
      descricao={t(`${L}description`, { name: mostrado?.pessoa ?? "", work: mostrado?.servico ?? "", phase: t(`${L}phase.${fase}`) })}
    >
      {(envio) => mostrado && <FormPerda key={mostrado.id} negocio={mostrado} hoje={hoje} motivos={motivos} aoFechar={aoFechar} aoPerder={aoPerder} envio={envio} />}
    </DialogoDeEnvio>
  );
}
