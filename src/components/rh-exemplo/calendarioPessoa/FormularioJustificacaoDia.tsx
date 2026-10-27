/**
 * O formulário com que a pessoa justifica um dia com falta sugerida ou atraso: tipo, motivo (mínimo 3 caracteres, com
 * contador), hora real (opcional) e anexos simulados (só os nomes, no máximo 4: nada se envia). Cada erro aparece junto do
 * seu campo e liga-se a ele por `aria-describedby`. Quem decide é o RH; aqui só se envia.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAccoesJustificacaoDia } from "@/components/rh-exemplo/hooks/useJustificacoesDoDia";
import { MOTIVO_MINIMO_CARACTERES } from "@/components/rh-exemplo/lib/horarioTipos";
import {
  MAX_ANEXOS_JUSTIFICACAO,
  validarEnvio,
  type CampoEnvio,
  type ErrosEnvio,
  type EstadoDoDia,
  type TipoJustificacaoDia,
} from "@/components/rh-exemplo/lib/justificacaoDia";
import { useTranslation } from "@/hooks/useTranslation";
import { CampoAnexosSimulados } from "./CampoAnexosSimulados";
import { CampoHoraReal, CampoMotivo, CampoTipo } from "./CamposDaJustificacao";
import { MensagemDeErro } from "./MensagemDeErro";
import type { DesvioJustificavel } from "./desvioJustificavel";

interface Props {
  pessoaId: string;
  data: string;
  desvio: DesvioJustificavel;
  /** A situação do dia quando o formulário abriu (pode justificar, ou recusada ainda com prazo). */
  estado: EstadoDoDia;
  aoFechar: () => void;
}

export function FormularioJustificacaoDia({ pessoaId, data, desvio, estado, aoFechar }: Props) {
  const { t } = useTranslation();
  const { registar, aGravar } = useAccoesJustificacaoDia();
  const [tipo, setTipo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [horaReal, setHoraReal] = useState("");
  const [anexos, setAnexos] = useState<string[]>([]);
  const [erros, setErros] = useState<ErrosEnvio>({});
  const base = `rhjd-form-${data}`;
  const params = { min: String(MOTIVO_MINIMO_CARACTERES), max: String(MAX_ANEXOS_JUSTIFICACAO) };
  const ligar = (campo: CampoEnvio, extra = ""): string | undefined => [extra, erros[campo] ? `${base}-${campo}-erro` : ""].filter(Boolean).join(" ") || undefined;

  const escolherAnexos = (nomes: string[]) => {
    const livres = MAX_ANEXOS_JUSTIFICACAO - anexos.length;
    setAnexos([...anexos, ...nomes.slice(0, Math.max(0, livres))]);
    setErros((e) => ({ ...e, anexos: nomes.length > livres ? "rhJust.erro.anexosMax" : undefined }));
  };

  /**
   * Valida o que se vê no ecrã (um erro por campo) e só depois fala com a base. Os erros que a base levanta (prazo, falta já
   * marcada, justificação já enviada, migration por aplicar) aparecem como erro geral, sem fechar o formulário: o texto escrito
   * não se perde.
   */
  const enviar = async () => {
    const erros = validarEnvio({ tipo, motivo, horaReal, anexos }, estado);
    if (Object.keys(erros).length > 0) return setErros(erros);
    setErros({});
    const resultado = await registar({
      pessoaId,
      data,
      tipo: tipo as TipoJustificacaoDia,
      deAtraso: desvio.deAtraso,
      periodoInicio: desvio.periodoInicio,
      periodoFim: desvio.periodoFim,
      motivo: motivo.trim(),
      horaReal: horaReal.trim() === "" ? null : horaReal.trim(),
      anexosNomes: anexos,
    });
    if (resultado.erro) return setErros({ geral: resultado.erro });
    aoFechar();
  };

  return (
    <form
      className="grid gap-3 rounded-md border p-3"
      aria-label={t("rhJust.titulo")}
      data-testid="rhjd-form"
      onSubmit={(e) => { e.preventDefault(); void enviar(); }}
    >
      <CampoTipo base={base} valor={tipo} erro={erros.tipo} descritoPor={ligar("tipo")} aoMudar={setTipo} params={params} />
      <CampoMotivo base={base} valor={motivo} erro={erros.motivo} descritoPor={ligar("motivo", `${base}-contador`)} aoMudar={setMotivo} params={params} />
      <CampoHoraReal base={base} valor={horaReal} erro={erros.horaReal} descritoPor={ligar("horaReal", `${base}-hora-ajuda`)} aoMudar={setHoraReal} params={params} />
      <CampoAnexosSimulados
        base={base} anexos={anexos} erro={erros.anexos} descritoPor={ligar("anexos", `${base}-anexos-ajuda`)}
        aoEscolher={escolherAnexos} aoRemover={(i) => setAnexos(anexos.filter((_, j) => j !== i))}
      />
      <MensagemDeErro id={`${base}-geral-erro`} erro={erros.geral} params={params} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11" disabled={aGravar} aria-busy={aGravar}>{t("rhJust.form.enviar")}</Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar}>{t("rhJust.form.cancelar")}</Button>
      </div>
    </form>
  );
}
