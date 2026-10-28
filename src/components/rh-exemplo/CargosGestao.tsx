/**
 * Cargos de RH -- lista, cria, edita e activa/desactiva `hr_cargos`
 * (20261202070000), diz quantas pessoas tem cada um, e e o sitio onde se muda o
 * salario de um cargo (fluxo 2). Vive no separador Funcoes de Pessoas: e o UNICO
 * sitio onde os cargos se gerem.
 *
 * AS CONTAGENS SAO POR `pessoas.cargo_id`
 * ---------------------------------------
 * "Pessoas" e "Em curso" contam as pessoas da lista recebida por `cargo_id`.
 * O texto livre antigo (`pessoas.cargo`) NAO conta: uma pessoa sem `cargo_id`
 * cai na linha "Sem cargo", ao fim, mesmo que o texto livre diga "Comercial".
 * A coluna "Em curso" so se mostra a quem tem `hr.pessoas.vinculos.view`.
 *
 * O SALARIO DO CARGO MUDA-SE POR "ALTERAR SALARIO", NAO AO EDITAR
 * -----------------------------------------------------------------
 * Toda a gente com o mesmo cargo ganha o mesmo -- por lei. O salario do cargo
 * vive em periodos (`hr_cargos_periodos`) e a coluna mostra o valor EM VIGOR
 * hoje, com "sobe para X a D" quando ha uma subida agendada. Editar o cargo muda
 * so o nome e as horas (o salario aparece em leitura); "Alterar salario"
 * (`hr.cargos.salario.alterar`, permissao perigosa) abre `CargoSalarioDialog`,
 * que avisa quantas pessoas afecta. Criar um cargo continua a pedir o salario
 * inicial (sem a permissao o cargo nasce com salario 0, que o ecra mostra como
 * "por definir"). Cada linha expande para mostrar os periodos.
 *
 * FICHAS SEM CARGO
 * ------------------
 * Toda a pessoa tem cargo, mas as fichas antigas podem nao ter. O cartao "Fichas
 * sem cargo" lista-as com ligacao ao separador Detalhes laborais da ficha, onde
 * se atribui o cargo.
 *
 * AS DIVERGENCIAS NAO MUDAM NADA SOZINHAS
 * -----------------------------------------
 * Dois relatorios so de leitura: o das retribuicoes em vigor que nao batem com o
 * cargo (`hr_cargos_retribuicoes_divergentes`, deve dar zero; so com
 * `hr.pessoas.retribuicao.view`, senao "zero" seria falso) e o antigo, de texto
 * legado (`pessoas.cargo`) com mais do que um salario. Nao ha nenhum botao para
 * "corrigir tudo".
 *
 * CARGO TECNICO DE OBRA (20261231998000)
 * -----------------------------------------
 * A coluna "Tecnico de obra / Oficios" mostra a marca e os oficios do cargo. No
 * dialogo de criar/editar, o interruptor "Tecnico de obra" e, so com ele ligado,
 * as caixas dos oficios do Catalogo (`useOficiosObra`). Grava-se depois de
 * criar ou editar o cargo, por `rh_guardar_cargo_tecnico` (so se mudou). As
 * pessoas com o cargo herdam os oficios (ficha › Detalhes laborais).
 *
 * NUNCA SE APAGA -- SO SE (DES)ACTIVA
 * -------------------------------------
 * A RLS bloqueia DELETE por politica RESTRICTIVE; este componente nem mostra
 * a opcao. "Desactivar" e "Reactivar" sao o UPDATE de `activo`.
 *
 * Permissoes: ver = `hr.pessoas.laborais.view`; criar/editar/activar =
 * `hr.pessoas.laborais.edit`; alterar salario = `hr.cargos.salario.alterar`.
 */
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SemAcessoCard } from "@/components/rh-exemplo/SemAcessoCard";
import { CargoPeriodosLista } from "@/components/rh-exemplo/CargoPeriodosLista";
import { CargoSalarioDialog } from "@/components/rh-exemplo/CargoSalarioDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { useCargos, type HrCargo, type NovoCargoRH } from "@/components/rh-exemplo/hooks/useCargos";
import { useOficiosObra } from "@/components/rh-exemplo/hooks/useOficiosObra";
import { useCargosSalariosDivergentes } from "@/components/rh-exemplo/hooks/useCargosSalariosDivergentes";
import { useCargosRetribuicoesDivergentes } from "@/components/rh-exemplo/hooks/useCargosRetribuicoesDivergentes";
import { dataDeHojeISO } from "@/components/rh-exemplo/lib/afectacoes";
import {
  formatarSalario,
  periodoDoCargoEm,
  proximoPeriodoAgendado,
} from "@/components/rh-exemplo/lib/cargosPeriodos";
import type { PessoaListItem, Periodicidade } from "@/components/rh-exemplo/tipos";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { mensagemDeErroCargo } from "@/components/rh-exemplo/lib/errosCargo";
import { cargoComMesmoNome } from "@/components/rh-exemplo/lib/cargosNome";
import {
  AlertTriangle,
  Banknote,
  Ban,
  Briefcase,
  ChevronDown,
  HardHat,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
} from "lucide-react";

const FORM_VAZIO: NovoCargoRH = {
  nome: "",
  salario_base: 0,
  periodicidade: "mensal",
  horas_referencia: null,
};

interface Contagem {
  total: number;
  emCurso: number;
}

interface CargosGestaoProps {
  pessoas: PessoaListItem[];
  loading: boolean;
}

export function CargosGestao({ pessoas, loading }: CargosGestaoProps) {
  const { t } = useTranslation();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const podeVer = hasPermission("hr.pessoas.laborais.view");
  const podeEditar = hasPermission("hr.pessoas.laborais.edit");
  const podeVerVinculos = hasPermission("hr.pessoas.vinculos.view");
  const podeAlterarSalario = hasPermission("hr.cargos.salario.alterar");
  const podeVerRetribuicao = hasPermission("hr.pessoas.retribuicao.view");

  const { cargos, periodos, oficios, isLoading, isSaving, criar, editar, definirActivo, definirSalario, definirTecnico } =
    useCargos();
  const { divergencias, isLoading: divergenciasALoad } = useCargosSalariosDivergentes();
  const { divergencias: divergenciasPeriodo, isLoading: divergenciasPeriodoALoad } =
    useCargosRetribuicoesDivergentes();

  const hoje = dataDeHojeISO();
  const traduzir = (chave: string) => t(chave);

  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [cargoAEditar, setCargoAEditar] = useState<string | null>(null);
  const [form, setForm] = useState<NovoCargoRH>(FORM_VAZIO);
  const [cargoSalario, setCargoSalario] = useState<HrCargo | null>(null);
  const [expandidos, setExpandidos] = useState<ReadonlySet<string>>(() => new Set());
  // A marca de tecnico de obra e os oficios escolhidos no dialogo (gravam-se a parte: rh_guardar_cargo_tecnico).
  const [tecnico, setTecnico] = useState(false);
  const [skills, setSkills] = useState<ReadonlySet<string>>(() => new Set());
  const { oficios: oficiosObra, semAcesso: semAcessoOficios } = useOficiosObra(dialogoAberto || oficios.length > 0);

  /** Os nomes dos oficios de cada cargo (os que o Catalogo nao devolver ficam de fora). */
  const oficiosDoCargo = useMemo(() => {
    const nomes = new Map(oficiosObra.map((o) => [o.id, o.nome]));
    const mapa = new Map<string, string[]>();
    for (const o of oficios) {
      const nome = nomes.get(o.skill_id);
      if (!nome) continue;
      mapa.set(o.cargo_id, [...(mapa.get(o.cargo_id) ?? []), nome]);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.localeCompare(b, "pt"));
    return mapa;
  }, [oficios, oficiosObra]);
  const skillsDoCargo = (id: string) => new Set(oficios.filter((o) => o.cargo_id === id).map((o) => o.skill_id));

  const { porCargo, semCargo, fichasSemCargo } = useMemo(() => {
    const mapa = new Map<string, Contagem>();
    const sem: Contagem = { total: 0, emCurso: 0 };
    const fichas: PessoaListItem[] = [];
    for (const pessoa of pessoas) {
      const alvo = pessoa.cargo_id
        ? (mapa.get(pessoa.cargo_id) ?? { total: 0, emCurso: 0 })
        : sem;
      alvo.total += 1;
      if (pessoa.estado_contrato_derivado === "em_curso") alvo.emCurso += 1;
      if (pessoa.cargo_id) mapa.set(pessoa.cargo_id, alvo);
      else fichas.push(pessoa);
    }
    return { porCargo: mapa, semCargo: sem, fichasSemCargo: fichas };
  }, [pessoas]);

  // O outro cargo (activo ou nao) com o mesmo nome: a base recusa-o (HRC14), aqui avisa-se antes.
  const nomeRepetido = useMemo(
    () => (dialogoAberto ? cargoComMesmoNome(cargos, form.nome, cargoAEditar) : null),
    [dialogoAberto, cargos, form.nome, cargoAEditar],
  );

  const cargosVisiveis = mostrarInactivos ? cargos : cargos.filter((c) => c.activo);
  const mostrarSemCargo = !loading && semCargo.total > 0;
  const vazio = cargosVisiveis.length === 0 && !mostrarSemCargo;

  /** O salario em vigor hoje e o proximo agendado de um cargo, ja formatados. */
  const salarioDoCargo = (cargo: HrCargo) => {
    // Sem hr.pessoas.retribuicao.view os periodos vem vazios: o cargo sem valores.
    if (!podeVerRetribuicao) return { vigente: null, agendado: null };
    const vigente = periodoDoCargoEm(periodos, cargo.id, hoje);
    const agendado = proximoPeriodoAgendado(periodos, cargo.id, hoje);
    return {
      // Salario 0 e o que a base grava a um cargo criado sem hr.cargos.salario.alterar.
      vigente: vigente
        ? vigente.salario_base === 0
          ? t("hr.cargos.salarioPorDefinir")
          : formatarSalario(
              { salarioBase: vigente.salario_base, periodicidade: vigente.periodicidade },
              traduzir,
            )
        : null,
      agendado: agendado
        ? t("hr.cargos.sobeEm", {
            valor: formatarSalario(
              { salarioBase: agendado.salario_base, periodicidade: agendado.periodicidade },
              traduzir,
            ),
            data: agendado.valido_de,
          })
        : null,
    };
  };

  const alternarExpandido = (id: string) =>
    setExpandidos((anterior) => {
      const proximo = new Set(anterior);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });

  const abrirNovo = () => {
    setCargoAEditar(null);
    setForm(FORM_VAZIO);
    setTecnico(false);
    setSkills(new Set());
    setDialogoAberto(true);
  };

  const abrirEdicao = (cargo: HrCargo) => {
    setCargoAEditar(cargo.id);
    setForm({
      nome: cargo.nome,
      salario_base: 0,
      periodicidade: "mensal",
      horas_referencia: cargo.horas_referencia,
    });
    setTecnico(!!cargo.tecnico_obra);
    setSkills(skillsDoCargo(cargo.id));
    setDialogoAberto(true);
  };

  const fecharDialogo = () => {
    setDialogoAberto(false);
    setCargoAEditar(null);
    setForm(FORM_VAZIO);
    setTecnico(false);
    setSkills(new Set());
  };

  const alternarSkill = (id: string, marcado: boolean) =>
    setSkills((anterior) => {
      const proximo = new Set(anterior);
      if (marcado) proximo.add(id);
      else proximo.delete(id);
      return proximo;
    });

  /** A marca ou os oficios mudaram em relacao ao que o cargo tem (num cargo novo: so se for tecnico). */
  const tecnicoMudou = (cargo: HrCargo | undefined) => {
    if (!cargo) return tecnico;
    if (!!cargo.tecnico_obra !== tecnico) return true;
    if (!tecnico) return false;
    const antes = skillsDoCargo(cargo.id);
    return antes.size !== skills.size || [...skills].some((id) => !antes.has(id));
  };

  const submeter = async () => {
    if (!form.nome.trim() || nomeRepetido) return;
    if (!cargoAEditar && form.salario_base < 0) return;
    let cargoId: string | null = null;
    const mudouTecnico = tecnicoMudou(cargoAEditar ? cargos.find((c) => c.id === cargoAEditar) : undefined);
    try {
      if (cargoAEditar) {
        // So nome e horas: o salario muda por "Alterar salario".
        await editar({ id: cargoAEditar, nome: form.nome, horas_referencia: form.horas_referencia });
        cargoId = cargoAEditar;
      } else {
        cargoId = await criar(form);
      }
    } catch (erro) {
      toast.error(await mensagemDeErroCargo(erro, "hr-cargo-definir-salario"));
      return;
    }
    // A marca de tecnico de obra e os oficios, depois do cargo (so se mudaram).
    if (mudouTecnico && cargoId) {
      try {
        await definirTecnico(cargoId, tecnico, tecnico ? [...skills] : []);
      } catch (erro) {
        const e = erro as { code?: string; message?: string } | null;
        const motivo = e?.code?.startsWith("CT") && e.message ? e.message : await getFriendlyErrorMessage(erro);
        toast.error(`${t("hr.cargos.tecnico.erroGravar")} ${motivo}`);
        fecharDialogo();
        return;
      }
    }
    toast.success(cargoAEditar ? t("hr.cargos.actualizarSucesso") : t("hr.cargos.criarSucesso"));
    fecharDialogo();
  };

  const alternarActivo = async (cargo: HrCargo) => {
    try {
      await definirActivo(cargo.id, !cargo.activo);
      toast.success(cargo.activo ? t("hr.cargos.desactivarSucesso") : t("hr.cargos.reactivarSucesso"));
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    }
  };

  if (permissionsLoading) return <OlyviaLoader />;
  if (!podeVer) return <SemAcessoCard />;

  const mostrarColunaAccoes = podeEditar || podeAlterarSalario;
  const nColunas = 4 + (podeVerVinculos ? 1 : 0) + (mostrarColunaAccoes ? 1 : 0);
  const cargoEmEdicao = cargoAEditar ? cargos.find((c) => c.id === cargoAEditar) : undefined;

  return (
    <div className="space-y-4">
      {!loading && fichasSemCargo.length > 0 && (
        <Card className="border-amber-400/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              {t("hr.cargos.semCargoTitulo", { n: fichasSemCargo.length })}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t("hr.cargos.semCargoAjuda")}</p>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {fichasSemCargo.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/rh-exemplo/pessoas/${p.id}?tab=laborais`}
                    title={t("hr.cargos.semCargoAbrir")}
                    className="inline-block rounded-md border px-2 py-1 text-sm underline-offset-2 hover:bg-muted hover:underline"
                  >
                    {p.nome_completo}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {podeVerRetribuicao && !divergenciasPeriodoALoad && (
        <Card className={divergenciasPeriodo.length > 0 ? "border-amber-400/50" : undefined}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {divergenciasPeriodo.length > 0 && <AlertTriangle className="h-4 w-4 text-amber-600" />}
              {t("hr.cargos.divergenciasPeriodoTitulo")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t("hr.cargos.divergenciasPeriodoAjuda")}</p>
          </CardHeader>
          <CardContent>
            {divergenciasPeriodo.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("hr.cargos.divergenciasPeriodoZero")}</p>
            ) : (
              <Table>
                <TableCaption className="sr-only">{t("hr.cargos.divergenciasPeriodoTitulo")}</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("hr.cargos.coluna.pessoa")}</TableHead>
                    <TableHead>{t("hr.cargos.coluna.cargo")}</TableHead>
                    <TableHead>{t("hr.cargos.coluna.actual")}</TableHead>
                    <TableHead>{t("hr.cargos.coluna.esperado")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {divergenciasPeriodo.map((d) => (
                    <TableRow key={d.retribuicao_id}>
                      <TableCell>{d.pessoa_nome}</TableCell>
                      <TableCell className="font-medium">{d.cargo_nome}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatarSalario(
                          { salarioBase: d.valor_base, periodicidade: d.periodicidade },
                          traduzir,
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatarSalario(
                          {
                            salarioBase: d.esperado_valor_base,
                            periodicidade: d.esperado_periodicidade,
                          },
                          traduzir,
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {!divergenciasALoad && divergencias.length > 0 && (
        <Card className="border-amber-400/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              {t("hr.cargos.divergenciasTitulo")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t("hr.cargos.divergenciasAjuda")}</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption className="sr-only">{t("hr.cargos.divergenciasTitulo")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("hr.cargos.coluna.cargo")}</TableHead>
                  <TableHead>{t("hr.cargos.coluna.pessoa")}</TableHead>
                  <TableHead>{t("hr.cargos.coluna.salario")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {divergencias.map((d) => (
                  <TableRow key={`${d.cargo}-${d.pessoa_id}`}>
                    <TableCell className="font-medium">{d.cargo}</TableCell>
                    <TableCell>{d.pessoa_nome}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {d.valor_base} ({t(`hr.periodicidade.${d.periodicidade}`)})
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              {t("hr.cargos.tituloPagina")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("hr.cargos.subtitulo")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("rhA.cargos.nuncaApaga")}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <Label htmlFor="mostrar-inactivos" className="text-sm font-normal">
                {t("hr.cargos.mostrarInactivos")}
              </Label>
              <input
                id="mostrar-inactivos"
                type="checkbox"
                checked={mostrarInactivos}
                onChange={(e) => setMostrarInactivos(e.target.checked)}
                className="h-4 w-4"
              />
            </div>
            {podeEditar && (
              <Button size="sm" onClick={abrirNovo}>
                <Plus className="h-4 w-4 mr-2" /> {t("hr.cargos.novoCargo")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading || loading ? (
            <div className="flex justify-center py-12">
              <OlyviaLoader size={32} />
            </div>
          ) : vazio ? (
            <div className="text-center py-12 text-muted-foreground">
              <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>{t("hr.cargos.semCargos")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableCaption className="sr-only">{t("hr.cargos.tituloPagina")}</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("hr.columns.cargo")}</TableHead>
                    <TableHead>{t("hr.cargos.coluna.salario")}</TableHead>
                    <TableHead>{t("hr.cargos.tecnico.coluna")}</TableHead>
                    <TableHead className="w-28">{t("hr.funcoes.pessoas")}</TableHead>
                    {podeVerVinculos && (
                      <TableHead className="w-28">{t("hr.estadoContrato.em_curso")}</TableHead>
                    )}
                    {mostrarColunaAccoes && <TableHead className="w-32" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cargosVisiveis.map((cargo) => {
                    const contagem = porCargo.get(cargo.id) ?? { total: 0, emCurso: 0 };
                    const salario = salarioDoCargo(cargo);
                    const expandido = expandidos.has(cargo.id);
                    return (
                      <Fragment key={cargo.id}>
                        <TableRow>
                          <TableCell>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => alternarExpandido(cargo.id)}
                                title={t("hr.cargos.periodos.titulo")}
                                aria-label={t("hr.cargos.periodos.titulo")}
                                aria-expanded={expandido}
                                aria-controls={expandido ? `cargo-periodos-${cargo.id}` : undefined}
                              >
                                {expandido ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                              <span className="font-medium">{cargo.nome}</span>
                              <Badge
                                variant={cargo.activo ? "default" : "secondary"}
                                className="text-[10px]"
                              >
                                {cargo.activo ? t("hr.cargos.activo") : t("hr.cargos.inactivo")}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            <div>{salario.vigente ?? "—"}</div>
                            {salario.agendado && (
                              <div className="text-xs text-muted-foreground">{salario.agendado}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {cargo.tecnico_obra ? (
                              <div className="space-y-1">
                                <Badge variant="outline" className="gap-1 text-[10px]">
                                  <HardHat className="h-3 w-3" aria-hidden="true" />
                                  {t("hr.cargos.tecnico.marca")}
                                </Badge>
                                <div className="text-xs text-muted-foreground">
                                  {(oficiosDoCargo.get(cargo.id) ?? []).join(", ") || t("hr.cargos.tecnico.nenhumOficio")}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="tabular-nums">{contagem.total}</TableCell>
                          {podeVerVinculos && (
                            <TableCell className="tabular-nums">{contagem.emCurso}</TableCell>
                          )}
                          {mostrarColunaAccoes && (
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                {podeAlterarSalario && podeVerRetribuicao && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setCargoSalario(cargo)}
                                    title={t("hr.cargos.alterarSalario")}
                                    aria-label={t("hr.cargos.alterarSalario")}
                                  >
                                    <Banknote className="h-4 w-4" />
                                  </Button>
                                )}
                                {podeEditar && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => abrirEdicao(cargo)}
                                      title={t("hr.cargos.editarCargo")}
                                      aria-label={t("hr.cargos.editarCargo")}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => alternarActivo(cargo)}
                                      title={
                                        cargo.activo ? t("hr.cargos.desactivar") : t("hr.cargos.reactivar")
                                      }
                                      aria-label={
                                        cargo.activo ? t("hr.cargos.desactivar") : t("hr.cargos.reactivar")
                                      }
                                    >
                                      {cargo.activo ? (
                                        <Ban className="h-4 w-4 text-destructive" />
                                      ) : (
                                        <RotateCcw className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                        {expandido && (
                          <TableRow id={`cargo-periodos-${cargo.id}`}>
                            <TableCell colSpan={nColunas} className="bg-muted/30">
                              <CargoPeriodosLista
                                periodos={periodos.filter((p) => p.cargo_id === cargo.id)}
                                hoje={hoje}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                  {mostrarSemCargo && (
                    <TableRow>
                      <TableCell>
                        <span className="text-muted-foreground">{t("hr.funcoes.semCargo")}</span>
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className="tabular-nums">{semCargo.total}</TableCell>
                      {podeVerVinculos && (
                        <TableCell className="tabular-nums">{semCargo.emCurso}</TableCell>
                      )}
                      {mostrarColunaAccoes && <TableCell />}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {cargoSalario && (
        <CargoSalarioDialog
          key={cargoSalario.id}
          cargo={cargoSalario}
          periodos={periodos}
          nPessoas={porCargo.get(cargoSalario.id)?.total ?? 0}
          isSaving={isSaving}
          onClose={() => setCargoSalario(null)}
          onConfirmar={({ salarioBase, periodicidade, validoDe, motivo }) =>
            definirSalario(cargoSalario.id, salarioBase, periodicidade, validoDe, motivo)
          }
        />
      )}

      <Dialog open={dialogoAberto} onOpenChange={(open) => !open && fecharDialogo()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {cargoAEditar ? t("hr.cargos.editarCargo") : t("hr.cargos.novoCargo")}
            </DialogTitle>
            <DialogDescription>{t("hr.cargos.subtitulo")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cargo-nome">{t("hr.cargos.coluna.cargo")}</Label>
              <Input
                id="cargo-nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                aria-invalid={nomeRepetido !== null}
                aria-describedby={nomeRepetido ? "cargo-nome-repetido" : undefined}
              />
              {nomeRepetido && (
                <p id="cargo-nome-repetido" role="alert" className="text-xs text-destructive">
                  {t(nomeRepetido.activo ? "hr.cargos.nomeDuplicado" : "hr.cargos.nomeDuplicadoDesactivado", {
                    nome: nomeRepetido.nome,
                  })}
                </p>
              )}
            </div>

            {cargoAEditar ? (
              // Editar: o salario so se le (e so com retribuicao.view). Muda-se por "Alterar salario".
              cargoEmEdicao &&
              salarioDoCargo(cargoEmEdicao).vigente !== null && (
                <p className="text-sm text-muted-foreground">
                  {t("hr.cargos.salarioSoLeitura", { valor: salarioDoCargo(cargoEmEdicao).vigente ?? "" })}
                </p>
              )
            ) : podeAlterarSalario ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cargo-salario">{t("hr.cargos.salarioBase")}</Label>
                  <Input
                    id="cargo-salario"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.salario_base}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, salario_base: Number(e.target.value) }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cargo-periodicidade">{t("hr.contrato.periodicidade")}</Label>
                  <Select
                    value={form.periodicidade}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, periodicidade: v as Periodicidade }))
                    }
                  >
                    <SelectTrigger id="cargo-periodicidade">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mensal">{t("hr.periodicidade.mensal")}</SelectItem>
                      <SelectItem value="anual">{t("hr.periodicidade.anual")}</SelectItem>
                      <SelectItem value="hora">{t("hr.periodicidade.hora")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              // Sem hr.cargos.salario.alterar o cargo cria-se com salario 0 (a base recusa outro, 42501).
              <p className="text-xs text-amber-700 dark:text-amber-500" role="status">
                {t("hr.cargos.avisoSalarioPorDefinir")}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="cargo-horas">{t("hr.cargos.horasReferencia")}</Label>
              <Input
                id="cargo-horas"
                type="number"
                min={0}
                step="0.5"
                value={form.horas_referencia ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    horas_referencia: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">{t("hr.cargos.horasReferenciaAjuda")}</p>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="cargo-tecnico">{t("hr.cargos.tecnico.marca")}</Label>
                  <p className="text-xs text-muted-foreground">{t("hr.cargos.tecnico.ajuda")}</p>
                </div>
                <Switch id="cargo-tecnico" checked={tecnico} onCheckedChange={setTecnico} />
              </div>
              {tecnico && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">{t("hr.cargos.tecnico.oficios")}</legend>
                  {semAcessoOficios ? (
                    <p className="text-xs text-muted-foreground">{t("hr.cargos.tecnico.semAcesso")}</p>
                  ) : oficiosObra.filter((o) => o.ativo || skills.has(o.id)).length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("hr.oficiosObra.semOficios")}</p>
                  ) : (
                    <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                      {oficiosObra
                        .filter((o) => o.ativo || skills.has(o.id))
                        .map((o) => {
                          const id = `cargo-oficio-${o.id}`;
                          return (
                            <label key={o.id} htmlFor={id} className="flex items-center gap-2 text-sm">
                              <Checkbox id={id} checked={skills.has(o.id)} onCheckedChange={(v) => alternarSkill(o.id, v === true)} />
                              {o.nome}
                            </label>
                          );
                        })}
                    </div>
                  )}
                </fieldset>
              )}
            </div>

            <p className="text-xs text-muted-foreground">{t("hr.cargos.avisoSalarioObrigatorio")}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={fecharDialogo}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={submeter}
              disabled={
                isSaving || !form.nome.trim() || nomeRepetido !== null || (!cargoAEditar && form.salario_base < 0)
              }
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {cargoAEditar ? t("common.save") : t("hr.cargos.novoCargo")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
