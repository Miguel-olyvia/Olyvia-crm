/**
 * O formulário com que a pessoa justifica um dia com falta sugerida ou atraso: tipo, motivo (mínimo 3 caracteres, com
 * contador), hora real (opcional) e anexos reais (PDF, JPEG ou PNG, até 10 MB, no máximo 4). Cada erro aparece junto do seu
 * campo e liga-se a ele por `aria-describedby`. Quem decide é o RH; aqui só se envia.
 *
 * O ENVIO É EM DUAS FASES. 1) Regista-se a justificação (sem nomes de anexos: a coluna `anexos_nomes` já não se usa); 2) só
 * depois sobem os ficheiros, um a um, para a justificação que acabou de nascer. Se um ficheiro falhar, a justificação CONTINUA
 * gravada: o formulário fica aberto, os campos ficam bloqueados (já não se regista outra vez) e os que falharam mostram
 * «Tentar outra vez». Só fecha quando tudo foi enviado, ou quando a pessoa carrega em «Concluir».
 *
 * «Tentar outra vez» repete só o que falta (a confirmação, se o ficheiro já subiu; senão limpa a reserva antes de reservar de novo:
 * ver `enviarAnexo`). Quando os ficheiros acabam de subir avisa-se `avisarMudancaDeJustificacoes`, para a lista de anexos da
 * justificação (que já estava montada, vazia) se reler.
 */
import { useRef, useState } from "react";
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
import { enviarAnexos, type ResultadoDeUmFicheiro } from "@/hooks/useAnexarJustificacao";
import { avisarMudancaDeJustificacoes } from "@/hooks/useJustificacoesDoDia";
import { chaveDoErroDeAnexo, escolherAnexos } from "@/lib/hr/justificacaoAnexos";
import { useTranslation } from "@/hooks/useTranslation";
import { CampoAnexosJustificacao, type AnexoLocal } from "./CampoAnexosJustificacao";
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
  const [anexos, setAnexos] = useState<AnexoLocal[]>([]);
  const [erros, setErros] = useState<ErrosEnvio>({});
  /** O id da justificação já gravada: a partir daqui só se sobem ficheiros. */
  const [registadaId, setRegistadaId] = useState<string | null>(null);
  const [aSubir, setASubir] = useState(false);
  const [falhados, setFalhados] = useState(0);
  const anexosRef = useRef<AnexoLocal[]>([]);
  const proximo = useRef(1);
  /** Guarda SÍNCRONA contra o duplo envio: o `disabled` do botão só chega no render seguinte. */
  const aEnviarAgora = useRef(false);
  const base = `rhjd-form-${data}`;
  const params = { min: String(MOTIVO_MINIMO_CARACTERES), max: String(MAX_ANEXOS_JUSTIFICACAO) };
  const ligar = (campo: CampoEnvio, extra = ""): string | undefined => [extra, erros[campo] ? `${base}-${campo}-erro` : ""].filter(Boolean).join(" ") || undefined;

  const guardar = (proximos: AnexoLocal[]) => {
    anexosRef.current = proximos;
    setAnexos(proximos);
  };
  const actualizar = (id: string, parcial: Partial<AnexoLocal>) => guardar(anexosRef.current.map((a) => (a.id === id ? { ...a, ...parcial } : a)));

  /** Sobe os ficheiros dados à justificação `justificacaoId`, marcando cada um; devolve quantos falharam. */
  const subir = async (justificacaoId: string, lista: readonly AnexoLocal[]): Promise<number> => {
    setASubir(true);
    // Os que já falharam levam o resultado anterior (reserva e se o upload correu), para repetir só o que falta.
    const anteriores = lista.some((a) => a.anterior) ? lista.map((a) => a.anterior ?? null) : undefined;
    lista.forEach((a) => actualizar(a.id, { fase: "a_enviar", codigoErro: null }));
    const marcar = (r: ResultadoDeUmFicheiro, i: number) =>
      actualizar(lista[i].id, { fase: r.ok ? "enviado" : "falhou", codigoErro: r.codigo, anterior: r.ok ? null : r });
    const resultados = await enviarAnexos({ justificacaoDiaId: justificacaoId }, lista.map((a) => a.ficheiro), marcar, anteriores);
    setASubir(false);
    // A lista de anexos da justificação já estava montada (vazia, desde a fase 1): diz-se-lhe que os ficheiros subiram.
    avisarMudancaDeJustificacoes();
    return resultados.filter((r) => !r.ok).length;
  };

  /** O foco volta ao campo de ficheiros (depois de remover ou de repetir um envio), depois de o render o reactivar. */
  const focarCampoDeFicheiros = () => requestAnimationFrame(() => document.getElementById(`${base}-anexos`)?.focus());

  const removerAnexo = (id: string) => {
    guardar(anexosRef.current.filter((a) => a.id !== id));
    // O aviso «N ficheiro(s) não foram enviados» conta os que ainda falharam: recalcula-se.
    if (registadaId !== null) setFalhados(anexosRef.current.filter((a) => a.fase === "falhou").length);
    focarCampoDeFicheiros();
  };

  const escolherFicheiros = (ficheiros: File[]) => {
    const { aceites, erro } = escolherAnexos(anexosRef.current.length, ficheiros);
    const novos: AnexoLocal[] = aceites.map((ficheiro) => ({ id: `anexo-${proximo.current++}`, ficheiro, fase: "por_enviar", codigoErro: null }));
    guardar([...anexosRef.current, ...novos]);
    const chave = erro === null ? undefined : erro === "anexo_maximo_ficheiros" ? "rhJust.erro.anexosMax" : chaveDoErroDeAnexo(erro);
    setErros((e) => ({ ...e, anexos: chave }));
    // Depois de a justificação estar gravada, o que se escolhe sobe logo.
    if (registadaId && novos.length > 0) void subir(registadaId, novos).then((n) => setFalhados((f) => f + n));
  };

  const tentarOutraVez = async (id: string) => {
    const alvo = anexosRef.current.find((a) => a.id === id);
    if (!alvo || !registadaId) return;
    const falhou = await subir(registadaId, [alvo]);
    setFalhados(anexosRef.current.filter((a) => a.fase === "falhou").length);
    if (falhou === 0 && anexosRef.current.every((a) => a.fase === "enviado")) return aoFechar();
    if (falhou === 0) focarCampoDeFicheiros();
  };

  /**
   * Valida o que se vê no ecrã (um erro por campo) e só depois fala com a base. Os erros que a base levanta (prazo, falta já
   * marcada, justificação já enviada, migration por aplicar) aparecem como erro geral, sem fechar o formulário: o texto escrito
   * não se perde.
   */
  const enviar = async () => {
    if (aEnviarAgora.current) return;
    aEnviarAgora.current = true;
    try {
      await enviarSemGuarda();
    } finally {
      aEnviarAgora.current = false;
    }
  };

  const enviarSemGuarda = async () => {
    const erros = validarEnvio({ tipo, motivo, horaReal, anexos: anexos.map((a) => a.ficheiro.name) }, estado);
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
      // Fase 1: nunca se mandam nomes (a coluna anexos_nomes já não se lê); os ficheiros sobem na fase 2.
      anexosNomes: [],
    });
    if (resultado.erro) return setErros({ geral: resultado.erro });
    if (anexosRef.current.length === 0) return aoFechar();
    if (!resultado.id) {
      // Gravada mas sem id para ligar os ficheiros: não se regista outra vez (duplicava), diz-se.
      setRegistadaId("");
      return setErros({ geral: "rhJust.anexo.erro.erro_inesperado" });
    }
    setRegistadaId(resultado.id);
    const n = await subir(resultado.id, anexosRef.current);
    setFalhados(n);
    if (n === 0) aoFechar();
  };

  const registada = registadaId !== null;
  const ocupado = aGravar || aSubir;

  return (
    <form
      className="grid gap-3 rounded-md border p-3"
      aria-label={t("rhJust.titulo")}
      data-testid="rhjd-form"
      onSubmit={(e) => { e.preventDefault(); if (!registada) void enviar(); }}
    >
      <fieldset disabled={registada} className="m-0 grid min-w-0 gap-3 border-0 p-0">
        <CampoTipo base={base} valor={tipo} erro={erros.tipo} descritoPor={ligar("tipo")} aoMudar={setTipo} params={params} />
        <CampoMotivo base={base} valor={motivo} erro={erros.motivo} descritoPor={ligar("motivo", `${base}-contador`)} aoMudar={setMotivo} params={params} />
        <CampoHoraReal base={base} valor={horaReal} erro={erros.horaReal} descritoPor={ligar("horaReal", `${base}-hora-ajuda`)} aoMudar={setHoraReal} params={params} />
      </fieldset>
      <CampoAnexosJustificacao
        base={base} anexos={anexos} erro={erros.anexos} descritoPor={ligar("anexos", `${base}-anexos-ajuda`)} desactivado={ocupado}
        aoEscolher={escolherFicheiros} aoRemover={removerAnexo}
        aoTentarOutraVez={registada ? (id) => void tentarOutraVez(id) : undefined}
      />
      {registada && falhados > 0 && (
        <p role="alert" className="text-sm font-medium text-destructive" data-testid="rhjd-anexos-aviso">{t("rhJust.anexo.avisoFalhas", { n: String(falhados) })}</p>
      )}
      <MensagemDeErro id={`${base}-geral-erro`} erro={erros.geral} params={params} />
      <div className="flex flex-wrap gap-2">
        {registada ? (
          <Button type="button" className="min-h-11" disabled={aSubir} onClick={aoFechar}>{t("rhJust.anexo.concluir")}</Button>
        ) : (
          <>
            <Button type="submit" className="min-h-11" disabled={ocupado} aria-busy={ocupado}>{t("rhJust.form.enviar")}</Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={ocupado} onClick={aoFechar}>{t("rhJust.form.cancelar")}</Button>
          </>
        )}
      </div>
    </form>
  );
}
