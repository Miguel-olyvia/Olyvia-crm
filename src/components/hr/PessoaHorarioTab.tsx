/**
 * O separador Horario da ficha: Planeado (editavel) e Realizado (leitura).
 *
 * DUAS ABAS, PORQUE SAO DUAS COISAS
 * ---------------------------------
 * Planeado e o que se combinou; realizado e o que aconteceu. Sao tabelas
 * diferentes na base (`pessoas_horario_planeado` e
 * `pessoas_horario_realizado`), com permissoes diferentes, e nunca se misturam
 * na mesma vista -- misturados, ninguem sabe se esta a olhar para uma
 * intencao ou para um facto.
 *
 * O REALIZADO E SO LEITURA NESTA RONDA: nao ha picagens nem RPC de validacao.
 * A permissao `hr.pessoas.horario_realizado.validar` existe no catalogo mas
 * hoje nao e verificada por nada -- e por isso que nao ha botao de validar
 * aqui: um botao que nao valida nada e pior do que a sua ausencia.
 *
 * O editor e O MESMO componente do passo 4 do assistente.
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
import {
  type HorarioRascunho,
  type LinhaPlaneadoParaGravar,
  formatarDuracao,
  linhasParaGravar,
  problemasDoHorario,
  rascunhoDeLinhas,
} from "@/lib/hr/horario";
import type { HorarioPlaneado, HorarioRealizado, LocalTrabalho } from "@/types/hr";

interface PessoaHorarioTabProps {
  planeado: HorarioPlaneado[];
  realizado: HorarioRealizado[];
  locais: LocalTrabalho[];
  locaisALoad: boolean;
  podeVerPlaneado: boolean;
  podeEditarPlaneado: boolean;
  podeVerRealizado: boolean;
  saving: boolean;
  /** Substitui o horario planeado da pessoa pelas linhas dadas. */
  onGuardarPlaneado: (linhas: LinhaPlaneadoParaGravar[]) => Promise<string | null>;
}

export function PessoaHorarioTab({
  planeado,
  realizado,
  locais,
  locaisALoad,
  podeVerPlaneado,
  podeEditarPlaneado,
  podeVerRealizado,
  saving,
  onGuardarPlaneado,
}: PessoaHorarioTabProps) {
  const { t } = useTranslation();
  const [rascunho, setRascunho] = useState<HorarioRascunho>(() => rascunhoDeLinhas(planeado));

  useEffect(() => {
    setRascunho(rascunhoDeLinhas(planeado));
  }, [planeado]);

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

  if (!podeVerPlaneado && !podeVerRealizado) {
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
                      onClick={() => setRascunho(rascunhoDeLinhas(planeado))}
                    >
                      {t("common.cancel")}
                    </Button>
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
        </Tabs>
      </CardContent>
    </Card>
  );
}
