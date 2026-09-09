/**
 * O editor de horario variavel: por DIA, com VARIOS intervalos, cada um com o
 * seu LOCAL.
 *
 * E o mesmo componente no passo 4 do assistente de criacao e no separador
 * Horario da ficha -- de proposito: duas maneiras de escrever a mesma coisa
 * dariam dois conjuntos de defeitos.
 *
 * O GESTO
 * -------
 * Sete linhas, segunda a domingo, todas vazias. "+ Intervalo" numa linha
 * acrescenta uma fila com Inicio, Fim e Local, e o foco vai para o Inicio.
 * Carregar outra vez na MESMA linha da uma segunda fila, com o local vazio de
 * proposito -- porque o caso normal de um segundo intervalo e ser noutro
 * sitio. E assim que se escreve "das 9 as 14 naquela empresa e das 15 as 19
 * naquilo".
 *
 * Nao ha grelha de horas nem arrastar: quem lanca horarios de limpeza esta a
 * ler um papel e a escrever numeros, muitas vezes num tablet.
 *
 * NAO HA PADRAO POR OMISSAO. Os dias que ficam vazios ficam vazios, e nada se
 * copia sem se pedir ("Copiar para..."). Uma semana sem padrao nenhum e o caso
 * normal deste editor, nao a excepcao.
 *
 * SOBREPOSICOES apanham-se aqui, ao escrever -- e o espelho do trigger
 * `hr_horario_planeado_sem_sobreposicao`: o utilizador nao chega a ver um erro
 * de servidor por isto.
 */
import { useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Copy, Plus, Scissors, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import {
  type DiaRascunho,
  type ExcepcaoRascunho,
  type HorarioRascunho,
  type IntervaloRascunho,
  atravessaMeiaNoite,
  chaveDoDia,
  chavesSobrepostas,
  diaSeguinte,
  formatarDuracao,
  intervaloVazio,
  novaChave,
  partirNaMeiaNoite,
  totaisPorLocal,
  totalDoDia,
  totalSemanal,
} from "@/lib/hr/horario";
import type { LocalTrabalho } from "@/types/hr";

/** O Radix nao aceita `value=""` num SelectItem. */
const SEM_LOCAL = "__sem_local__";

/** Cores estaveis por local, para se ver de relance quem esta onde. A cor
 * NUNCA e o unico canal: ao lado da bolinha esta sempre o nome. */
const CORES_LOCAL = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#4d7c0f",
  "#be185d",
];

export function corDoLocal(locais: LocalTrabalho[], localId: string | null): string {
  if (!localId) return "#94a3b8";
  const indice = locais.findIndex((local) => local.id === localId);
  if (indice < 0) return "#94a3b8";
  return CORES_LOCAL[indice % CORES_LOCAL.length];
}

interface HorarioEditorProps {
  valor: HorarioRascunho;
  onChange: (proximo: HorarioRascunho) => void;
  locais: LocalTrabalho[];
  locaisALoad?: boolean;
  podeEditar: boolean;
  /** Prefixo dos `id` dos campos, para dois editores na mesma pagina nao
   * colidirem nos `htmlFor`. */
  idPrefixo?: string;
}

export function HorarioEditor({
  valor,
  onChange,
  locais,
  locaisALoad = false,
  podeEditar,
  idPrefixo = "hr-horario",
}: HorarioEditorProps) {
  const { t } = useTranslation();
  const anuncio = useRef<HTMLDivElement>(null);

  const nomePorLocal = useMemo(
    () => new Map(locais.map((local) => [local.id, local.nome])),
    [locais],
  );

  const anunciar = (mensagem: string) => {
    if (anuncio.current) anuncio.current.textContent = mensagem;
  };

  const substituirDia = (diaSemana: number, alterar: (dia: DiaRascunho) => DiaRascunho) =>
    onChange({
      ...valor,
      dias: valor.dias.map((dia) => (dia.dia_semana === diaSemana ? alterar(dia) : dia)),
    });

  const substituirExcepcao = (
    chave: string,
    alterar: (excepcao: ExcepcaoRascunho) => ExcepcaoRascunho,
  ) =>
    onChange({
      ...valor,
      excepcoes: valor.excepcoes.map((excepcao) =>
        excepcao.chave === chave ? alterar(excepcao) : excepcao,
      ),
    });

  const acrescentarIntervaloAoDia = (diaSemana: number) => {
    const novo = intervaloVazio();
    substituirDia(diaSemana, (dia) => ({
      ...dia,
      nao_trabalha: false,
      intervalos: [...dia.intervalos, novo],
    }));
    anunciar(
      t("hr.horario.a11y.intervaloAcrescentado")
        .replace("{dia}", t(`hr.dias.${chaveDoDia(diaSemana)}`))
        .replace("{n}", String(getDia(diaSemana).intervalos.length + 1)),
    );
    // O foco vai para o Inicio da fila nova, depois de ela existir no DOM.
    requestAnimationFrame(() => {
      document.getElementById(`${idPrefixo}-${novo.chave}-inicio`)?.focus();
    });
  };

  const getDia = (diaSemana: number): DiaRascunho =>
    valor.dias.find((dia) => dia.dia_semana === diaSemana) ?? {
      dia_semana: diaSemana,
      nao_trabalha: false,
      intervalos: [],
    };

  const removerIntervaloDoDia = (diaSemana: number, chave: string) => {
    substituirDia(diaSemana, (dia) => ({
      ...dia,
      intervalos: dia.intervalos.filter((intervalo) => intervalo.chave !== chave),
    }));
    anunciar(t("hr.horario.a11y.intervaloRemovido"));
    requestAnimationFrame(() => {
      document.getElementById(`${idPrefixo}-dia-${diaSemana}-acrescentar`)?.focus();
    });
  };

  const definirIntervaloNoDia = (
    diaSemana: number,
    chave: string,
    patch: Partial<IntervaloRascunho>,
  ) =>
    substituirDia(diaSemana, (dia) => ({
      ...dia,
      intervalos: dia.intervalos.map((intervalo) =>
        intervalo.chave === chave ? { ...intervalo, ...patch } : intervalo,
      ),
    }));

  const partirIntervalo = (diaSemana: number, intervalo: IntervaloRascunho) => {
    const partido = partirNaMeiaNoite(intervalo);
    if (!partido) return;
    const seguinte = diaSeguinte(diaSemana);
    onChange({
      ...valor,
      dias: valor.dias.map((dia) => {
        if (dia.dia_semana === diaSemana) {
          return {
            ...dia,
            intervalos: dia.intervalos.map((i) =>
              i.chave === intervalo.chave ? partido.hoje : i,
            ),
          };
        }
        if (dia.dia_semana === seguinte) {
          return { ...dia, nao_trabalha: false, intervalos: [...dia.intervalos, partido.amanha] };
        }
        return dia;
      }),
    });
    anunciar(t("hr.horario.a11y.intervaloPartido"));
  };

  const copiarPara = (origem: number, destinos: number[]) => {
    const dia = getDia(origem);
    onChange({
      ...valor,
      dias: valor.dias.map((outro) => {
        if (!destinos.includes(outro.dia_semana)) return outro;
        return {
          ...outro,
          nao_trabalha: dia.nao_trabalha,
          intervalos: dia.intervalos.map((intervalo) => ({
            ...intervalo,
            chave: novaChave(),
            id: undefined,
          })),
        };
      }),
    });
    anunciar(t("hr.horario.a11y.copiado"));
  };

  const acrescentarExcepcao = () =>
    onChange({
      ...valor,
      excepcoes: [
        ...valor.excepcoes,
        { chave: novaChave("exc"), data: "", nao_trabalha: false, intervalos: [intervaloVazio()] },
      ],
    });

  const totais = useMemo(() => totaisPorLocal(valor), [valor]);
  const semanal = useMemo(() => totalSemanal(valor), [valor]);

  const filaDeIntervalo = (
    intervalo: IntervaloRascunho,
    opcoes: {
      sobreposto: boolean;
      onPatch: (patch: Partial<IntervaloRascunho>) => void;
      onRemover: () => void;
      onPartir?: () => void;
    },
  ) => {
    const nocturno = atravessaMeiaNoite(intervalo);
    const idInicio = `${idPrefixo}-${intervalo.chave}-inicio`;
    const idFim = `${idPrefixo}-${intervalo.chave}-fim`;
    const idLocal = `${idPrefixo}-${intervalo.chave}-local`;
    const idErro = `${idPrefixo}-${intervalo.chave}-erro`;
    const invalido = opcoes.sobreposto || nocturno;

    return (
      <div key={intervalo.chave} className="space-y-1">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={idInicio} className="text-xs text-muted-foreground">
              {t("hr.horario.inicio")}
            </Label>
            <Input
              id={idInicio}
              type="time"
              className={cn("h-9 w-28", invalido && "border-destructive")}
              value={intervalo.hora_inicio}
              disabled={!podeEditar}
              aria-invalid={invalido}
              aria-describedby={invalido ? idErro : undefined}
              onChange={(e) => opcoes.onPatch({ hora_inicio: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={idFim} className="text-xs text-muted-foreground">
              {t("hr.horario.fim")}
            </Label>
            <Input
              id={idFim}
              type="time"
              className={cn("h-9 w-28", invalido && "border-destructive")}
              value={intervalo.hora_fim}
              disabled={!podeEditar}
              aria-invalid={invalido}
              aria-describedby={invalido ? idErro : undefined}
              onChange={(e) => opcoes.onPatch({ hora_fim: e.target.value })}
            />
          </div>
          <div className="min-w-[12rem] flex-1 space-y-1">
            <Label htmlFor={idLocal} className="text-xs text-muted-foreground">
              {t("hr.horario.local")}
            </Label>
            <Select
              value={intervalo.local_id ?? SEM_LOCAL}
              disabled={!podeEditar || locaisALoad}
              onValueChange={(v) => opcoes.onPatch({ local_id: v === SEM_LOCAL ? null : v })}
            >
              <SelectTrigger id={idLocal} className="h-9">
                <SelectValue
                  placeholder={locaisALoad ? t("common.loading") : t("hr.horario.localPredefinido")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_LOCAL}>{t("hr.horario.localPredefinido")}</SelectItem>
                {locais.map((local) => (
                  <SelectItem key={local.id} value={local.id}>
                    {local.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span
            className="inline-flex items-center gap-1.5 pb-2 text-xs text-muted-foreground"
            aria-hidden="true"
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: corDoLocal(locais, intervalo.local_id) }}
            />
            {formatarDuracao(nocturno ? 0 : totalDoDia([intervalo]))}
          </span>
          {podeEditar && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mb-0.5 h-9 w-9"
              onClick={opcoes.onRemover}
              aria-label={t("hr.horario.removerIntervalo")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {invalido && (
          <p id={idErro} className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            {opcoes.sobreposto ? t("hr.horario.erroSobreposicao") : t("hr.horario.erroMeiaNoite")}
            {nocturno && !opcoes.sobreposto && podeEditar && opcoes.onPartir && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={opcoes.onPartir}
              >
                <Scissors className="mr-1 h-3 w-3" />
                {t("hr.horario.partirEmDois")}
              </Button>
            )}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div ref={anuncio} aria-live="polite" className="sr-only" />

      <div className="divide-y rounded-md border">
        {valor.dias.map((dia) => {
          const sobrepostas = chavesSobrepostas(dia.intervalos);
          const nomeDia = t(`hr.dias.${chaveDoDia(dia.dia_semana)}`);
          const total = totalDoDia(dia.intervalos);
          return (
            <section
              key={dia.dia_semana}
              aria-label={`${nomeDia}, ${dia.intervalos.length} ${t("hr.horario.intervalos")}`}
              className="space-y-2 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-28 text-sm font-medium">{nomeDia}</span>
                  {dia.nao_trabalha ? (
                    <Badge variant="outline" className="font-normal">
                      {t("hr.horario.naoTrabalha")}
                    </Badge>
                  ) : dia.intervalos.length === 0 ? (
                    <span className="text-sm text-muted-foreground">
                      {t("hr.horario.semHorario")}
                    </span>
                  ) : (
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {formatarDuracao(total)}
                    </span>
                  )}
                </div>

                {podeEditar && (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      id={`${idPrefixo}-dia-${dia.dia_semana}-acrescentar`}
                      variant="outline"
                      size="sm"
                      className="h-9"
                      disabled={dia.nao_trabalha}
                      onClick={() => acrescentarIntervaloAoDia(dia.dia_semana)}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      {t("hr.horario.acrescentarIntervalo")}
                    </Button>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-9"
                          disabled={dia.intervalos.length === 0 && !dia.nao_trabalha}
                        >
                          <Copy className="mr-1 h-4 w-4" />
                          {t("hr.horario.copiarPara")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 space-y-2">
                        <p className="text-sm font-medium">{t("hr.horario.copiarPara")}</p>
                        {valor.dias
                          .filter((outro) => outro.dia_semana !== dia.dia_semana)
                          .map((outro) => {
                            const idCaixa = `${idPrefixo}-copiar-${dia.dia_semana}-${outro.dia_semana}`;
                            return (
                              <div key={outro.dia_semana} className="flex items-center gap-2">
                                <Checkbox
                                  id={idCaixa}
                                  onCheckedChange={(marcado) => {
                                    if (marcado === true) copiarPara(dia.dia_semana, [outro.dia_semana]);
                                  }}
                                />
                                <Label htmlFor={idCaixa} className="text-sm font-normal">
                                  {t(`hr.dias.${chaveDoDia(outro.dia_semana)}`)}
                                </Label>
                              </div>
                            );
                          })}
                      </PopoverContent>
                    </Popover>

                    <div className="flex items-center gap-1.5 pl-2">
                      <Checkbox
                        id={`${idPrefixo}-dia-${dia.dia_semana}-folga`}
                        checked={dia.nao_trabalha}
                        onCheckedChange={(marcado) =>
                          substituirDia(dia.dia_semana, (anterior) => ({
                            ...anterior,
                            nao_trabalha: marcado === true,
                            intervalos: marcado === true ? [] : anterior.intervalos,
                          }))
                        }
                      />
                      <Label
                        htmlFor={`${idPrefixo}-dia-${dia.dia_semana}-folga`}
                        className="text-xs font-normal text-muted-foreground"
                      >
                        {t("hr.horario.marcarNaoLaboravel")}
                      </Label>
                    </div>
                  </div>
                )}
              </div>

              {dia.intervalos.length > 0 && (
                <div className="space-y-2 pl-1">
                  {dia.intervalos.map((intervalo) =>
                    filaDeIntervalo(intervalo, {
                      sobreposto: sobrepostas.has(intervalo.chave),
                      onPatch: (patch) => definirIntervaloNoDia(dia.dia_semana, intervalo.chave, patch),
                      onRemover: () => removerIntervaloDoDia(dia.dia_semana, intervalo.chave),
                      onPartir: () => partirIntervalo(dia.dia_semana, intervalo),
                    }),
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Excepcoes por data. A precedencia diz-se aqui, uma vez, em texto. */}
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("hr.horario.excepcoes")}</p>
          {podeEditar && (
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={acrescentarExcepcao}>
              <Plus className="mr-1 h-4 w-4" />
              {t("hr.horario.acrescentarExcepcao")}
            </Button>
          )}
        </div>

        {valor.excepcoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hr.horario.semExcepcoes")}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{t("hr.horario.precedencia")}</p>
            {valor.excepcoes.map((excepcao) => {
              const sobrepostas = chavesSobrepostas(excepcao.intervalos);
              const idData = `${idPrefixo}-${excepcao.chave}-data`;
              return (
                <section
                  key={excepcao.chave}
                  aria-label={`${t("hr.horario.excepcao")} ${excepcao.data || ""}`}
                  className="space-y-2 border-t pt-2"
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label htmlFor={idData} className="text-xs text-muted-foreground">
                        {t("hr.horario.data")}
                      </Label>
                      <Input
                        id={idData}
                        type="date"
                        className="h-9 w-40"
                        value={excepcao.data}
                        disabled={!podeEditar}
                        onChange={(e) =>
                          substituirExcepcao(excepcao.chave, (anterior) => ({
                            ...anterior,
                            data: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="flex items-center gap-1.5 pb-2">
                      <Checkbox
                        id={`${idPrefixo}-${excepcao.chave}-folga`}
                        checked={excepcao.nao_trabalha}
                        disabled={!podeEditar}
                        onCheckedChange={(marcado) =>
                          substituirExcepcao(excepcao.chave, (anterior) => ({
                            ...anterior,
                            nao_trabalha: marcado === true,
                            intervalos: marcado === true ? [] : anterior.intervalos,
                          }))
                        }
                      />
                      <Label
                        htmlFor={`${idPrefixo}-${excepcao.chave}-folga`}
                        className="text-xs font-normal text-muted-foreground"
                      >
                        {t("hr.horario.marcarNaoLaboravel")}
                      </Label>
                    </div>
                    {podeEditar && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mb-0.5 h-9"
                          disabled={excepcao.nao_trabalha}
                          onClick={() =>
                            substituirExcepcao(excepcao.chave, (anterior) => ({
                              ...anterior,
                              intervalos: [...anterior.intervalos, intervaloVazio()],
                            }))
                          }
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          {t("hr.horario.acrescentarIntervalo")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="mb-0.5 h-9 w-9"
                          aria-label={t("hr.horario.removerExcepcao")}
                          onClick={() =>
                            onChange({
                              ...valor,
                              excepcoes: valor.excepcoes.filter((o) => o.chave !== excepcao.chave),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>

                  <div className="space-y-2 pl-1">
                    {excepcao.intervalos.map((intervalo) =>
                      filaDeIntervalo(intervalo, {
                        sobreposto: sobrepostas.has(intervalo.chave),
                        onPatch: (patch) =>
                          substituirExcepcao(excepcao.chave, (anterior) => ({
                            ...anterior,
                            intervalos: anterior.intervalos.map((i) =>
                              i.chave === intervalo.chave ? { ...i, ...patch } : i,
                            ),
                          })),
                        onRemover: () =>
                          substituirExcepcao(excepcao.chave, (anterior) => ({
                            ...anterior,
                            intervalos: anterior.intervalos.filter(
                              (i) => i.chave !== intervalo.chave,
                            ),
                          })),
                      }),
                    )}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>

      {/* Os totais: por semana e por local. E o resumo por LOCAL que da sentido
          ao resto -- e onde se ve de relance quem esta onde. */}
      <div aria-live="polite" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="font-medium">
          {t("hr.horario.totalSemanal")}: <span className="tabular-nums">{formatarDuracao(semanal)}</span>
        </span>
        {[...totais.entries()].map(([localId, minutos]) => (
          <span key={localId ?? "sem-local"} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: corDoLocal(locais, localId) }}
            />
            {localId ? (nomePorLocal.get(localId) ?? localId) : t("hr.horario.localPredefinido")}{" "}
            <span className="tabular-nums text-muted-foreground">{formatarDuracao(minutos)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
