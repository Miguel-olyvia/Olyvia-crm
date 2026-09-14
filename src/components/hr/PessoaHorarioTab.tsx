/**
 * O separador Horario da ficha: Planeado, Realizado e Assiduidade.
 *
 * TRES ABAS, PORQUE SAO TRES COISAS
 * ---------------------------------
 * Planeado e o que se combinou; realizado e o que aconteceu. Sao tabelas
 * diferentes na base (`pessoas_horario_planeado` e
 * `pessoas_horario_realizado`), com permissoes diferentes, e nunca se misturam
 * na mesma vista -- misturados, ninguem sabe se esta a olhar para uma
 * intencao ou para um facto.
 *
 * O REALIZADO CONTINUA SO LEITURA AQUI, e isso agora e uma escolha e nao uma
 * falta: com as picagens ja existe `rpc_hr_realizado_validar`, mas validar e
 * corrigir sao gestos DE UM DIA, e vivem no painel do dia da aba Assiduidade,
 * ao lado das picagens que os originaram. Uma tabela do mes inteiro com
 * botoes de validar linha a linha convidava a validar sem olhar.
 *
 * A terceira aba, Assiduidade, e o dia a dia: picagens, faltas, desvios e
 * correccoes. Fica aqui e nao num separador novo da ficha porque "o tempo
 * desta pessoa" deve estar num sitio so.
 *
 * O editor e O MESMO componente do passo 4 do assistente.
 *
 * ALTERAR E CORRIGIR SAO DUAS COISAS, NO PLANEADO TAMBEM (20261130190000)
 * -------------------------------------------------------------------------
 * O editor (`HorarioEditor` + o botao "Guardar" desta aba) so mostra e so
 * grava linhas cuja janela AINDA NAO decorreu -- em vigor ou no futuro. Uma
 * janela ja decorrida nunca entra no rascunho: fica no bloco de Historico,
 * so leitura, com um botao "Corrigir" proprio, permissao propria
 * (`podeCorrigirPlaneado`) e um painel (`CorrigirPlaneadoSheet`) diferente do
 * editor -- de proposito. Se fosse o mesmo botao, corrigir o passado pareceria
 * mudar o futuro.
 */
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarClock, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { HorarioEditor, corDoLocal } from "@/components/hr/HorarioEditor";
import { CorrigirPlaneadoSheet } from "@/components/hr/CorrigirPlaneadoSheet";
import { HistoricoCorreccoes } from "@/components/hr/assiduidade/HistoricoCorreccoes";
import { PessoaAssiduidadeTab } from "@/components/hr/PessoaAssiduidadeTab";
import { cadeiaDeCorreccoes, emVigor, LEITOR_PLANEADO } from "@/lib/hr/assiduidade";
import {
  type HorarioRascunho,
  type LinhaPlaneadoParaGravar,
  formatarDuracao,
  linhaPlaneadaDecorrida,
  linhasParaGravar,
  problemasDoHorario,
  rascunhoDeLinhas,
} from "@/lib/hr/horario";
import type { HorarioPlaneado, HorarioRealizado, LocalTrabalho } from "@/types/hr";
import type { PermissoesAssiduidade } from "@/types/hrAssiduidade";

interface CorrigirPlaneadoArgs {
  horarioId: string;
  horaInicio: string | null;
  horaFim: string | null;
  localId: string | null;
  naoTrabalha: boolean;
  motivo: string;
}

interface PessoaHorarioTabProps {
  planeado: HorarioPlaneado[];
  realizado: HorarioRealizado[];
  locais: LocalTrabalho[];
  locaisALoad: boolean;
  podeVerPlaneado: boolean;
  podeEditarPlaneado: boolean;
  /** Corrigir uma janela JA DECORRIDA -- perigosa, permissao a parte do editor. */
  podeCorrigirPlaneado?: boolean;
  podeVerRealizado: boolean;
  saving: boolean;
  /** ALTERAR: substitui o horario planeado EM VIGOR/futuro pelas linhas dadas. */
  onGuardarPlaneado: (linhas: LinhaPlaneadoParaGravar[]) => Promise<string | null>;
  /** CORRIGIR: um lancamento novo sobre uma linha ja decorrida, com rasto. */
  onCorrigirPlaneado?: (args: CorrigirPlaneadoArgs) => Promise<string | null>;
  /** A aba Assiduidade. Sem isto o separador continua com duas abas. */
  pessoaId?: string;
  pessoaNome?: string;
  souAPessoa?: boolean;
  permissoesAssiduidade?: PermissoesAssiduidade;
  /**
   * As horas contratadas por semana, REAIS -- ja calculadas pelo chamador
   * com `horasContratadasSemanaisReais` (para "diaria", conta os dias uteis
   * do vinculo, nao o equivalente fixo do tecto de 80h). `null`/`undefined`
   * quando nao ha vinculo em vigor ou falta a informacao -- o editor so
   * mostra o aviso quando isto vem preenchido.
   */
  horasContratadasSemanais?: number | null;
}

export function PessoaHorarioTab({
  planeado,
  realizado,
  locais,
  locaisALoad,
  podeVerPlaneado,
  podeEditarPlaneado,
  podeCorrigirPlaneado = false,
  podeVerRealizado,
  saving,
  onGuardarPlaneado,
  onCorrigirPlaneado,
  pessoaId,
  pessoaNome,
  souAPessoa = false,
  permissoesAssiduidade,
  horasContratadasSemanais = null,
}: PessoaHorarioTabProps) {
  const { t } = useTranslation();

  // Duas fatias do MESMO array: o que ainda se ALTERA (em vigor ou futuro,
  // vai para o rascunho editavel) e o que so se CORRIGE (janela ja
  // decorrida, so leitura + botao proprio). `linhaPlaneadaDecorrida` e o
  // espelho exacto do que a base ja impoe (20261130190000).
  const editavel = useMemo(
    () => planeado.filter((linha) => !linhaPlaneadaDecorrida(linha)),
    [planeado],
  );
  const historico = useMemo(
    () => planeado.filter((linha) => linhaPlaneadaDecorrida(linha)),
    [planeado],
  );
  // Uma posicao do historico por linha "em vigor" dentro do historico: a
  // original quando nunca foi corrigida, ou a correccao mais recente quando
  // foi. `cadeiaDeCorreccoes` reconstroi, para cada uma, a volta completa
  // ate ao lancamento original -- e o painel so aparece quando ha mais do
  // que um passo.
  const historicoEmVigor = useMemo(
    () =>
      emVigor(historico, LEITOR_PLANEADO).sort((a, b) =>
        (b.data ?? b.valido_de ?? "").localeCompare(a.data ?? a.valido_de ?? ""),
      ),
    [historico],
  );

  const [rascunho, setRascunho] = useState<HorarioRascunho>(() => rascunhoDeLinhas(editavel));
  const [corrigirAlvo, setCorrigirAlvo] = useState<HorarioPlaneado | null>(null);

  useEffect(() => {
    setRascunho(rascunhoDeLinhas(editavel));
  }, [editavel]);

  const problemas = useMemo(() => problemasDoHorario(rascunho), [rascunho]);
  const nomePorLocal = useMemo(
    () => new Map(locais.map((local) => [local.id, local.nome])),
    [locais],
  );

  const gravar = async () => {
    if (problemas.length > 0) {
      toast.error(t("hr.horario.erroAntesDeGravar"));
      return;
    }
    const erro = await onGuardarPlaneado(linhasParaGravar(rascunho));
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
  };

  const descreverLinha = (linha: HorarioPlaneado): string => {
    if (linha.nao_trabalha) return t("hr.horario.naoTrabalha");
    const local = linha.local_id
      ? (nomePorLocal.get(linha.local_id) ?? linha.local_id)
      : t("hr.horario.localPredefinido");
    return `${linha.hora_inicio?.slice(0, 5) ?? "—"} — ${linha.hora_fim?.slice(0, 5) ?? "—"} · ${local}`;
  };

  const quandoDaLinha = (linha: HorarioPlaneado): string =>
    linha.data ?? linha.valido_de ?? "—";

  const podeVerAssiduidade =
    Boolean(pessoaId && permissoesAssiduidade) &&
    Boolean(
      permissoesAssiduidade?.view ||
        permissoesAssiduidade?.equipaView ||
        (souAPessoa && permissoesAssiduidade?.viewOwn),
    );

  if (!podeVerPlaneado && !podeVerRealizado && !podeVerAssiduidade) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("hr.semAcesso")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          {t("hr.horario.titulo")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={podeVerPlaneado ? "planeado" : "realizado"} className="space-y-4">
          <TabsList>
            <TabsTrigger value="planeado" disabled={!podeVerPlaneado}>
              {t("hr.horario.planeado")}
            </TabsTrigger>
            <TabsTrigger value="realizado" disabled={!podeVerRealizado}>
              {t("hr.horario.realizado")}
            </TabsTrigger>
            <TabsTrigger value="assiduidade" disabled={!podeVerAssiduidade}>
              {t("hr.horario.assiduidade")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="planeado" className="space-y-4">
            {podeVerPlaneado ? (
              <>
                <HorarioEditor
                  valor={rascunho}
                  onChange={setRascunho}
                  locais={locais}
                  locaisALoad={locaisALoad}
                  podeEditar={podeEditarPlaneado}
                  idPrefixo="hr-ficha-horario"
                  horasContratadasSemanais={horasContratadasSemanais}
                />
                {podeEditarPlaneado && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={gravar} disabled={saving}>
                      {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      {t("employees.form.update")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={saving}
                      onClick={() => setRascunho(rascunhoDeLinhas(editavel))}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                )}

                {historicoEmVigor.length > 0 && (
                  <div className="space-y-2 border-t pt-4">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      {t("hr.horario.historicoSeccaoTitulo")}
                    </h3>
                    <ul className="space-y-2">
                      {historicoEmVigor.map((linha) => {
                        const cadeia = cadeiaDeCorreccoes(linha, historico, LEITOR_PLANEADO);
                        return (
                          <li
                            key={linha.id}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2 text-sm opacity-80"
                          >
                            <span className="tabular-nums text-xs text-muted-foreground">
                              {quandoDaLinha(linha)}
                            </span>
                            <span>{descreverLinha(linha)}</span>

                            <HistoricoCorreccoes
                              titulo={t("hr.assiduidade.historico.planeadoTitulo")}
                              descricao={t("hr.assiduidade.historico.descricao")}
                              rotulo={t("hr.assiduidade.historico.rotulo", {
                                quantas: String(cadeia.length - 1),
                              })}
                              passos={cadeia.map((passo) => ({
                                id: passo.id,
                                valor: descreverLinha(passo),
                                autor: passo.corrigido_por_pessoa_id,
                                quando: null,
                                motivo: passo.correccao_motivo,
                              }))}
                            />

                            {podeCorrigirPlaneado && onCorrigirPlaneado && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="ml-auto h-7"
                                onClick={() => setCorrigirAlvo(linha)}
                              >
                                {t("hr.assiduidade.accao.corrigir")}
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="py-8 text-center text-muted-foreground">{t("hr.semAcesso")}</p>
            )}
          </TabsContent>

          <TabsContent value="realizado">
            {!podeVerRealizado ? (
              <p className="py-8 text-center text-muted-foreground">{t("hr.semAcesso")}</p>
            ) : realizado.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                {t("hr.horario.semRealizado")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("hr.horario.data")}</TableHead>
                      <TableHead>{t("hr.horario.inicio")}</TableHead>
                      <TableHead>{t("hr.horario.fim")}</TableHead>
                      <TableHead>{t("hr.horario.duracao")}</TableHead>
                      <TableHead>{t("hr.horario.local")}</TableHead>
                      <TableHead>{t("hr.horario.origem")}</TableHead>
                      <TableHead>{t("hr.horario.estado")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {realizado.map((linha) => (
                      <TableRow key={linha.id}>
                        <TableCell className="tabular-nums">{linha.data}</TableCell>
                        <TableCell className="tabular-nums">{linha.hora_inicio}</TableCell>
                        <TableCell className="tabular-nums">{linha.hora_fim}</TableCell>
                        <TableCell className="tabular-nums">
                          {formatarDuracao(linha.minutos ?? 0)}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: corDoLocal(locais, linha.local_id) }}
                            />
                            {linha.local_id
                              ? (nomePorLocal.get(linha.local_id) ?? linha.local_id)
                              : t("hr.horario.localPredefinido")}
                          </span>
                        </TableCell>
                        <TableCell>{t(`hr.horario.origens.${linha.origem}`)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {t(`hr.horario.estados.${linha.estado}`)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="assiduidade">
            {podeVerAssiduidade && pessoaId && permissoesAssiduidade ? (
              <PessoaAssiduidadeTab
                pessoaId={pessoaId}
                pessoaNome={pessoaNome ?? ""}
                souAPessoa={souAPessoa}
                permissoes={permissoesAssiduidade}
              />
            ) : (
              <p className="py-8 text-center text-muted-foreground">{t("hr.semAcesso")}</p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {corrigirAlvo && onCorrigirPlaneado && (
        <CorrigirPlaneadoSheet
          aberto={corrigirAlvo !== null}
          horarioId={corrigirAlvo.id}
          horaInicioActual={corrigirAlvo.hora_inicio}
          horaFimActual={corrigirAlvo.hora_fim}
          localActual={corrigirAlvo.local_id}
          naoTrabalhaActual={corrigirAlvo.nao_trabalha}
          locais={locais}
          aGravar={saving}
          onFechar={() => setCorrigirAlvo(null)}
          onCorrigir={onCorrigirPlaneado}
          idPrefixo="hr-ficha-horario-corrigir"
        />
      )}
    </Card>
  );
}
