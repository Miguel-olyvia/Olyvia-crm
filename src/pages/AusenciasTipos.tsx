/**
 * O catalogo de tipos de ausencia -- o PRIMEIRO ecra do modulo.
 *
 * PORQUE E QUE E O PRIMEIRO
 * -------------------------
 * `hr_ausencias_tipos` nao tem seed. Uma organizacao sem tipos criados nao
 * consegue pedir absolutamente nada, e todos os outros ecras do modulo ficam
 * com um vazio que ninguem sabe resolver. Sem este, os outros nao servem.
 *
 * E a UNICA tabela do modulo com escrita directa: os interruptores gravam por
 * `update`, sem RPC. O DELETE esta bloqueado por politica -- desactivar e
 * `activo = false`, e e por isso que nao ha botao de apagar.
 *
 * O que cada interruptor faz esta escrito por baixo dele. "Conta para o minimo
 * legal", em particular, e o que liga a guarda dos 20 dias uteis no ajuste de
 * saldo, e ninguem adivinha isso pelo nome.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import { TipoEtiqueta } from "@/components/hr/ausencias/TipoEtiqueta";
import {
  CampoInterruptor,
  CampoSelect,
  CampoTexto,
  CamposTocadosProvider,
} from "@/components/hr/form/Campos";
import { useAusenciasTipos } from "@/hooks/useAusenciasTipos";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { Plus } from "lucide-react";
import type { AusenciaTipo, CategoriaAusencia } from "@/types/hrAusencias";

const CATEGORIAS: CategoriaAusencia[] = [
  "ferias",
  "doenca",
  "parentalidade",
  "sem_retribuicao",
  "falta_justificada",
  "falta_injustificada",
  "compensacao",
  "outro",
];

interface Rascunho {
  codigo: string;
  nome: string;
  categoria: CategoriaAusencia;
  cor: string;
  desconta_saldo: boolean;
  conta_minimo_legal: boolean;
  exige_aprovacao_chefia: boolean;
  exige_aprovacao_rh: boolean;
  exige_justificacao: boolean;
  permite_meio_dia: boolean;
  inclui_fim_de_semana: boolean;
  inclui_feriados: boolean;
  antecedencia_minima_dias: string;
  activo: boolean;
}

const RASCUNHO_NOVO: Rascunho = {
  codigo: "",
  nome: "",
  categoria: "ferias",
  cor: "#2563eb",
  desconta_saldo: true,
  conta_minimo_legal: false,
  exige_aprovacao_chefia: true,
  exige_aprovacao_rh: true,
  exige_justificacao: false,
  permite_meio_dia: true,
  inclui_fim_de_semana: false,
  inclui_feriados: false,
  antecedencia_minima_dias: "0",
  activo: true,
};

function rascunhoDe(tipo: AusenciaTipo): Rascunho {
  return {
    codigo: tipo.codigo,
    nome: tipo.nome,
    categoria: tipo.categoria,
    cor: tipo.cor ?? "#2563eb",
    desconta_saldo: tipo.desconta_saldo,
    conta_minimo_legal: tipo.conta_minimo_legal,
    exige_aprovacao_chefia: tipo.exige_aprovacao_chefia,
    exige_aprovacao_rh: tipo.exige_aprovacao_rh,
    exige_justificacao: tipo.exige_justificacao,
    permite_meio_dia: tipo.permite_meio_dia,
    inclui_fim_de_semana: tipo.inclui_fim_de_semana,
    inclui_feriados: tipo.inclui_feriados,
    antecedencia_minima_dias: String(tipo.antecedencia_minima_dias ?? 0),
    activo: tipo.activo,
  };
}

export default function AusenciasTipos() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const tipos = useAusenciasTipos();

  const podeEditar = hasPermission("hr.ausencias.tipos.edit");
  const [aEditar, setAEditar] = useState<AusenciaTipo | null>(null);
  const [aCriar, setACriar] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho>(RASCUNHO_NOVO);
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const [mostrarTodos, setMostrarTodos] = useState(false);

  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (!hasPermission("hr.ausencias.tipos.view")) return <SemAcessoCard className="m-6" />;

  const abrirNovo = () => {
    setRascunho(RASCUNHO_NOVO);
    setTocados(new Set());
    setMostrarTodos(false);
    setAEditar(null);
    setACriar(true);
  };

  const abrirEdicao = (tipo: AusenciaTipo) => {
    setRascunho(rascunhoDe(tipo));
    setTocados(new Set());
    setMostrarTodos(false);
    setAEditar(tipo);
    setACriar(true);
  };

  const tocar = (campoId: string) =>
    setTocados((anteriores) => {
      if (anteriores.has(campoId)) return anteriores;
      const proximos = new Set(anteriores);
      proximos.add(campoId);
      return proximos;
    });

  const erroDe = (campoId: string, invalido: boolean, chave: string) =>
    invalido && (mostrarTodos || tocados.has(campoId)) ? t(chave) : null;

  const gravar = async () => {
    setMostrarTodos(true);
    if (rascunho.codigo.trim() === "" || rascunho.nome.trim() === "") {
      toast.error(t("hr.ausencias.tipos.erroCamposObrigatorios"));
      return;
    }
    const patch = {
      codigo: rascunho.codigo.trim(),
      nome: rascunho.nome.trim(),
      categoria: rascunho.categoria,
      cor: rascunho.cor,
      desconta_saldo: rascunho.desconta_saldo,
      conta_minimo_legal: rascunho.conta_minimo_legal,
      exige_aprovacao_chefia: rascunho.exige_aprovacao_chefia,
      exige_aprovacao_rh: rascunho.exige_aprovacao_rh,
      exige_justificacao: rascunho.exige_justificacao,
      permite_meio_dia: rascunho.permite_meio_dia,
      inclui_fim_de_semana: rascunho.inclui_fim_de_semana,
      inclui_feriados: rascunho.inclui_feriados,
      antecedencia_minima_dias: Number(rascunho.antecedencia_minima_dias) || 0,
      activo: rascunho.activo,
    };
    const erro = aEditar
      ? await tipos.actualizarTipo(aEditar.id, patch)
      : await tipos.criarTipo(patch);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    setACriar(false);
  };

  const idPrefixo = "hr-tipo";

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t("hr.ausencias.tipos.titulo")}</h1>
          <p className="text-sm text-muted-foreground">{t("hr.ausencias.tipos.descricao")}</p>
        </div>
        {podeEditar && (
          <Button size="sm" onClick={abrirNovo}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("hr.ausencias.tipos.novo")}
          </Button>
        )}
      </div>

      {tipos.recusado ? (
        <SemAcessoCard />
      ) : tipos.loading ? (
        <OlyviaLoader />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("hr.ausencias.tipos.lista")}</CardTitle>
          </CardHeader>
          <CardContent>
            {tipos.vazio ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("hr.ausencias.tipos.semTipos")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("hr.ausencias.tipos.nome")}</TableHead>
                      <TableHead>{t("hr.ausencias.tipos.codigo")}</TableHead>
                      <TableHead>{t("hr.ausencias.tipos.categoria")}</TableHead>
                      <TableHead>{t("hr.ausencias.tipos.aprovacao")}</TableHead>
                      <TableHead>{t("hr.ausencias.tipos.estado")}</TableHead>
                      <TableHead className="w-0" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tipos.tipos.map((tipo) => (
                      <TableRow key={tipo.id}>
                        <TableCell>
                          <TipoEtiqueta tipo={tipo} />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{tipo.codigo}</TableCell>
                        <TableCell>{t(`hr.ausencias.categoria.${tipo.categoria}`)}</TableCell>
                        <TableCell className="text-xs">
                          {[
                            tipo.exige_aprovacao_chefia ? t("hr.ausencias.passo.chefia") : null,
                            tipo.exige_aprovacao_rh ? t("hr.ausencias.passo.rh") : null,
                          ]
                            .filter(Boolean)
                            .join(" → ") || t("hr.ausencias.tipos.semAprovacao")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={tipo.activo ? "default" : "outline"}>
                            {tipo.activo
                              ? t("hr.ausencias.tipos.activo")
                              : t("hr.ausencias.tipos.inactivo")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {podeEditar && (
                            <Button size="sm" variant="ghost" onClick={() => abrirEdicao(tipo)}>
                              {t("common.edit")}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Sheet open={aCriar} onOpenChange={(estado) => !estado && setACriar(false)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {aEditar ? t("hr.ausencias.tipos.editar") : t("hr.ausencias.tipos.novo")}
            </SheetTitle>
          </SheetHeader>

          <CamposTocadosProvider onTocar={tocar}>
            <div className="space-y-4 py-4">
              <CampoTexto
                id={`${idPrefixo}-nome`}
                label={t("hr.ausencias.tipos.nome")}
                valor={rascunho.nome}
                onChange={(valor) => setRascunho((r) => ({ ...r, nome: valor }))}
                erro={erroDe(
                  `${idPrefixo}-nome`,
                  rascunho.nome.trim() === "",
                  "hr.ausencias.tipos.erroCamposObrigatorios",
                )}
              />
              <CampoTexto
                id={`${idPrefixo}-codigo`}
                label={t("hr.ausencias.tipos.codigo")}
                valor={rascunho.codigo}
                onChange={(valor) => setRascunho((r) => ({ ...r, codigo: valor }))}
                ajuda={t("hr.ausencias.tipos.codigoAjuda")}
                erro={erroDe(
                  `${idPrefixo}-codigo`,
                  rascunho.codigo.trim() === "",
                  "hr.ausencias.tipos.erroCamposObrigatorios",
                )}
              />
              <CampoSelect
                id={`${idPrefixo}-categoria`}
                label={t("hr.ausencias.tipos.categoria")}
                valor={rascunho.categoria}
                onChange={(valor) =>
                  setRascunho((r) => ({ ...r, categoria: valor as CategoriaAusencia }))
                }
                opcoes={CATEGORIAS.map((categoria) => ({
                  value: categoria,
                  label: t(`hr.ausencias.categoria.${categoria}`),
                }))}
              />
              <CampoTexto
                id={`${idPrefixo}-cor`}
                label={t("hr.ausencias.tipos.cor")}
                valor={rascunho.cor}
                onChange={(valor) => setRascunho((r) => ({ ...r, cor: valor }))}
                ajuda={t("hr.ausencias.tipos.corAjuda")}
              />
              <CampoTexto
                id={`${idPrefixo}-antecedencia`}
                label={t("hr.ausencias.tipos.antecedencia")}
                tipo="number"
                min={0}
                valor={rascunho.antecedencia_minima_dias}
                onChange={(valor) =>
                  setRascunho((r) => ({ ...r, antecedencia_minima_dias: valor }))
                }
              />

              <CampoInterruptor
                id={`${idPrefixo}-desconta`}
                label={t("hr.ausencias.tipos.descontaSaldo")}
                descricao={t("hr.ausencias.tipos.descontaSaldoAjuda")}
                checked={rascunho.desconta_saldo}
                onChange={(valor) => setRascunho((r) => ({ ...r, desconta_saldo: valor }))}
              />
              <CampoInterruptor
                id={`${idPrefixo}-minimo`}
                label={t("hr.ausencias.tipos.contaMinimoLegal")}
                descricao={t("hr.ausencias.tipos.contaMinimoLegalAjuda")}
                checked={rascunho.conta_minimo_legal}
                onChange={(valor) => setRascunho((r) => ({ ...r, conta_minimo_legal: valor }))}
              />
              <CampoInterruptor
                id={`${idPrefixo}-chefia`}
                label={t("hr.ausencias.tipos.exigeChefia")}
                checked={rascunho.exige_aprovacao_chefia}
                onChange={(valor) =>
                  setRascunho((r) => ({ ...r, exige_aprovacao_chefia: valor }))
                }
              />
              <CampoInterruptor
                id={`${idPrefixo}-rh`}
                label={t("hr.ausencias.tipos.exigeRh")}
                checked={rascunho.exige_aprovacao_rh}
                onChange={(valor) => setRascunho((r) => ({ ...r, exige_aprovacao_rh: valor }))}
              />
              <CampoInterruptor
                id={`${idPrefixo}-justificacao`}
                label={t("hr.ausencias.tipos.exigeJustificacao")}
                checked={rascunho.exige_justificacao}
                onChange={(valor) => setRascunho((r) => ({ ...r, exige_justificacao: valor }))}
              />
              <CampoInterruptor
                id={`${idPrefixo}-meio-dia`}
                label={t("hr.ausencias.tipos.permiteMeioDia")}
                checked={rascunho.permite_meio_dia}
                onChange={(valor) => setRascunho((r) => ({ ...r, permite_meio_dia: valor }))}
              />
              <CampoInterruptor
                id={`${idPrefixo}-fds`}
                label={t("hr.ausencias.tipos.incluiFimDeSemana")}
                checked={rascunho.inclui_fim_de_semana}
                onChange={(valor) => setRascunho((r) => ({ ...r, inclui_fim_de_semana: valor }))}
              />
              <CampoInterruptor
                id={`${idPrefixo}-feriados`}
                label={t("hr.ausencias.tipos.incluiFeriados")}
                checked={rascunho.inclui_feriados}
                onChange={(valor) => setRascunho((r) => ({ ...r, inclui_feriados: valor }))}
              />
              <CampoInterruptor
                id={`${idPrefixo}-activo`}
                label={t("hr.ausencias.tipos.activo")}
                descricao={t("hr.ausencias.tipos.activoAjuda")}
                checked={rascunho.activo}
                onChange={(valor) => setRascunho((r) => ({ ...r, activo: valor }))}
              />

              <div className="flex gap-2">
                <Button onClick={gravar} disabled={tipos.saving}>
                  {t("employees.form.update")}
                </Button>
                <Button variant="ghost" onClick={() => setACriar(false)} disabled={tipos.saving}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          </CamposTocadosProvider>
        </SheetContent>
      </Sheet>
    </div>
  );
}
