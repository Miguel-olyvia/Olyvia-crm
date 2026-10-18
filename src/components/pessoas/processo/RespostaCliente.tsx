// «Resposta do cliente»: o que o cliente respondeu à proposta. Aceitou (e, se o Workflow pergunta, criar o contrato ou fechar sem ele) ou
// recusou (o negócio perde-se, com motivo). Só exemplo. Montado uma vez, ao nível da página, pelo `ProcessoProvider`.
import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CamposMotivoPerda } from "@/components/negocio-metas/CamposMotivoPerda";
import { FOCO } from "@/components/negocio-metas/estilos";
import { erroDoMotivoPerda, motivoDaPerda } from "@/components/negocio-metas/perdaNegocio";
import { MensagemErro } from "../CamposDataHora";
import { useAvisoAlternado } from "./avisoAlternado";
import { GrupoOpcoesProcesso } from "./GrupoOpcoesProcesso";
import type { FaltaProcesso } from "./portoesProcesso";
import type { NegocioDoPasso } from "./tiposProcesso";
import type { DadosResposta, RespostaCliente as Resposta } from "./transicoesContrato";

const P = "pessoasPagina.reply.";

interface FormProps {
  /** Os motivos de perda da lista do Workflow. */
  motivos: readonly string[];
  /** As respostas possíveis ao aceitar, quando o Workflow pergunta (`criarContrato`, `fecharSemContrato`); vazio = não pergunta. */
  escolhas: readonly string[];
  aoRegistar: (dados: DadosResposta) => FaltaProcesso[];
  explicar: (faltas: FaltaProcesso[]) => string;
  aoFechar: () => void;
}

function Formulario({ motivos, escolhas, aoRegistar, explicar, aoFechar }: FormProps) {
  const { t } = useTranslation();
  const id = useId();
  const alternar = useAvisoAlternado();
  const [resposta, setResposta] = useState<Resposta | "">("");
  const [escolha, setEscolha] = useState("");
  const [motivo, setMotivo] = useState("");
  const [outro, setOutro] = useState("");
  const [tentou, setTentou] = useState(false);
  const [falta, setFalta] = useState<string | null>(null);
  const grupo = useRef<HTMLDivElement>(null);
  const grupoEscolha = useRef<HTMLDivElement>(null);
  const seletor = useRef<HTMLSelectElement>(null);
  const campoOutro = useRef<HTMLInputElement>(null);
  const semResposta = tentou && resposta === "";
  const semEscolha = tentou && resposta === "aceite" && escolhas.length > 0 && escolha === "";
  const erroMotivo = tentou && resposta === "recusada" ? erroDoMotivoPerda(motivo, outro) : null;

  const registar = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (resposta === "") { grupo.current?.querySelector<HTMLElement>('[role="radio"]')?.focus(); return; }
    if (resposta === "aceite" && escolhas.length > 0 && escolha === "") { grupoEscolha.current?.querySelector<HTMLElement>('[role="radio"]')?.focus(); return; }
    const falha = resposta === "recusada" ? erroDoMotivoPerda(motivo, outro) : null;
    if (falha) { (falha === "outroVazio" ? campoOutro : seletor).current?.focus(); return; }
    const faltas = aoRegistar({ resposta, escolha: resposta === "aceite" && escolhas.length > 0 ? escolha : undefined, motivo: motivoDaPerda(motivo, outro) ?? undefined });
    // O motivo diz-se DENTRO do diálogo (alerta): a região live da página fica fora do modal. Alterna um espaço inseparável para repetir.
    setFalta(faltas.length > 0 ? alternar(explicar(faltas)) : null);
  };

  return (
    <form onSubmit={registar} noValidate className="space-y-4">
      <GrupoOpcoesProcesso<Resposta>
        legenda={t(`${P}group`)} valor={resposta} grupoRef={grupo} obrigatorio erro={semResposta ? t(`${P}error`) : null} aoMudar={setResposta}
        opcoes={[{ valor: "aceite", rotulo: t(`${P}accepted`) }, { valor: "recusada", rotulo: t(`${P}refused`) }]}
      />
      {resposta === "aceite" && escolhas.length > 0 && (
        <GrupoOpcoesProcesso
          legenda={t(`${P}next`)} valor={escolha} grupoRef={grupoEscolha} obrigatorio erro={semEscolha ? t(`${P}nextError`) : null} aoMudar={setEscolha}
          opcoes={escolhas.map((valor) => ({ valor, rotulo: t(`${P}next.${valor}`) }))}
        />
      )}
      {resposta === "recusada" && (
        <CamposMotivoPerda
          motivos={motivos} escolhido={motivo} outro={outro} erro={erroMotivo} seletorRef={seletor} outroRef={campoOutro}
          aoMudar={(p) => { if (p.escolhido !== undefined) setMotivo(p.escolhido); if (p.outro !== undefined) setOutro(p.outro); }}
        />
      )}
      {falta !== null && <MensagemErro id={`${id}-falta`} texto={falta} />}
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t(`${P}cancel`)}</Button>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t(`${P}submit`)}</Button>
      </DialogFooter>
    </form>
  );
}

interface RespostaClienteProps extends FormProps {
  /** O negócio cuja proposta se responde; `null` com o diálogo fechado. */
  negocio: NegocioDoPasso | null;
  /** Devolve o foco ao botão certo e diz se o fez; se não, o diálogo devolve-o por si. */
  aoDevolverFoco: () => boolean;
}

export function RespostaCliente({ negocio, aoDevolverFoco, ...form }: RespostaClienteProps) {
  const { t } = useTranslation();
  const ultimo = useRef(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  return (
    <Dialog open={negocio !== null} onOpenChange={(aberto) => { if (!aberto) form.aoFechar(); }}>
      <DialogContent hideClose className="motion-reduce:!animate-none" onCloseAutoFocus={(e) => { if (aoDevolverFoco()) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{t(`${P}title`, { work: mostrado?.trabalho ?? "" })}</DialogTitle>
          <DialogDescription>{t(`${P}description`, { name: mostrado?.nome ?? "" })}</DialogDescription>
        </DialogHeader>
        {mostrado && <Formulario key={mostrado.id} {...form} />}
      </DialogContent>
    </Dialog>
  );
}
