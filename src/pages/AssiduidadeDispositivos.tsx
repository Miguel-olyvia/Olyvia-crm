/**
 * O catalogo de dispositivos de picagem.
 *
 * A EXCEPCAO DO MODULO
 * --------------------
 * E o unico ecra da assiduidade que escreve DIRECTAMENTE na tabela, sem RPC:
 * `hr_picagens_dispositivos` tem GRANT de INSERT e UPDATE a `authenticated`, e
 * a RLS pede `hr.assiduidade.dispositivos.edit`. Nas outras tres tabelas do
 * modulo um insert directo e recusado. Esta escrito aqui e no hook para nao se
 * procurar uma RPC que nao existe -- nem se tentar o contrario nas outras.
 *
 * A CHAVE DE REGISTO NUNCA APARECE
 * --------------------------------
 * A tabela guarda o hash, e nem o hash se le. O formulario nao mostra, nao
 * pede e nao escreve chave nenhuma: mostra-se apenas a data em que foi rodada.
 * Rodar a chave e um gesto que ainda nao existe -- exige uma Edge Function que
 * a gere e a entregue uma unica vez, e essa nao esta feita.
 *
 * DESACTIVAR NAO E APAGAR: o DELETE esta bloqueado por politica. Um
 * dispositivo com picagens agarradas nunca deve desaparecer.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus } from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import {
  CampoInterruptor,
  CampoSelect,
  CampoTexto,
  CamposTocadosProvider,
} from "@/components/hr/form/Campos";
import { toast } from "@/lib/toast";
import { useCompany } from "@/contexts/CompanyContext";
import { useDispositivosPicagem } from "@/hooks/useDispositivosPicagem";
import { useLocaisTrabalho } from "@/hooks/useLocaisTrabalho";
import { usePermissoesAssiduidade } from "@/hooks/usePermissoesAssiduidade";
import { useTranslation } from "@/hooks/useTranslation";
import { TIPOS_DISPOSITIVO, type Dispositivo, type TipoDispositivo } from "@/types/hrAssiduidade";

interface Rascunho {
  id?: string;
  codigo: string;
  nome: string;
  tipo: TipoDispositivo;
  localId: string;
  refExterna: string;
  fabricante: string;
  modelo: string;
  notas: string;
  activo: boolean;
}

const RASCUNHO_VAZIO: Rascunho = {
  codigo: "",
  nome: "",
  tipo: "quiosque",
  localId: "",
  refExterna: "",
  fabricante: "",
  modelo: "",
  notas: "",
  activo: true,
};

function rascunhoDe(dispositivo: Dispositivo): Rascunho {
  return {
    id: dispositivo.id,
    codigo: dispositivo.codigo,
    nome: dispositivo.nome,
    tipo: dispositivo.tipo,
    localId: dispositivo.local_id ?? "",
    refExterna: dispositivo.ref_externa ?? "",
    fabricante: dispositivo.fabricante ?? "",
    modelo: dispositivo.modelo ?? "",
    notas: dispositivo.notas ?? "",
    activo: dispositivo.activo,
  };
}

export default function AssiduidadeDispositivos() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { permissoes, loading: permissoesALoad } = usePermissoesAssiduidade();
  const { dispositivos, recusado, loading, saving, guardar } = useDispositivosPicagem();
  const { locais } = useLocaisTrabalho();

  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const [mostrarTodos, setMostrarTodos] = useState(false);

  if (companyLoading || permissoesALoad || loading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;

  const tocar = (campoId: string) =>
    setTocados((anteriores) =>
      anteriores.has(campoId) ? anteriores : new Set(anteriores).add(campoId),
    );

  const abrir = (valores: Rascunho) => {
    setRascunho(valores);
    setTocados(new Set());
    setMostrarTodos(false);
  };

  const gravar = async () => {
    if (!rascunho) return;
    if (!rascunho.codigo.trim() || !rascunho.nome.trim()) {
      setMostrarTodos(true);
      toast.error(t("hr.assiduidade.dispositivos.erroCamposObrigatorios"));
      return;
    }
    const erro = await guardar({
      id: rascunho.id,
      codigo: rascunho.codigo,
      nome: rascunho.nome,
      tipo: rascunho.tipo,
      localId: rascunho.localId || null,
      refExterna: rascunho.refExterna.trim() || null,
      fabricante: rascunho.fabricante.trim() || null,
      modelo: rascunho.modelo.trim() || null,
      notas: rascunho.notas.trim() || null,
      activo: rascunho.activo,
    });
    if (erro) {
      toast.error(t(erro));
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    setRascunho(null);
  };

  const erroDe = (campo: "codigo" | "nome", id: string) => {
    if (!rascunho) return null;
    const vazio = campo === "codigo" ? !rascunho.codigo.trim() : !rascunho.nome.trim();
    if (!vazio) return null;
    if (!mostrarTodos && !tocados.has(id)) return null;
    return t("hr.assiduidade.dispositivos.erroCampoObrigatorio");
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t("hr.assiduidade.dispositivos.titulo")}</h1>
        {permissoes.dispositivosEdit && (
          <Button size="sm" className="ml-auto" onClick={() => abrir(RASCUNHO_VAZIO)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("hr.assiduidade.dispositivos.criar")}
          </Button>
        )}
      </div>

      {recusado || !permissoes.dispositivosView ? (
        <SemAcessoCard />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t("hr.assiduidade.dispositivos.lista")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dispositivos.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {permissoes.dispositivosEdit
                  ? t("hr.assiduidade.dispositivos.vazioPodeCriar")
                  : t("hr.assiduidade.dispositivos.vazio")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("hr.assiduidade.dispositivos.codigo")}</TableHead>
                      <TableHead>{t("hr.assiduidade.dispositivos.nome")}</TableHead>
                      <TableHead>{t("hr.assiduidade.dispositivos.tipo")}</TableHead>
                      <TableHead>{t("hr.assiduidade.campo.local")}</TableHead>
                      <TableHead>{t("hr.assiduidade.dispositivos.ultimaPicagem")}</TableHead>
                      <TableHead>{t("hr.assiduidade.dispositivos.chaveRodadaEm")}</TableHead>
                      <TableHead>{t("hr.assiduidade.dispositivos.estado")}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dispositivos.map((dispositivo) => (
                      <TableRow key={dispositivo.id}>
                        <TableCell className="font-mono text-xs">{dispositivo.codigo}</TableCell>
                        <TableCell>{dispositivo.nome}</TableCell>
                        <TableCell>
                          {t(`hr.assiduidade.dispositivos.tipos.${dispositivo.tipo}`)}
                        </TableCell>
                        <TableCell>
                          {locais.find((local) => local.id === dispositivo.local_id)?.nome ??
                            t("hr.assiduidade.semLocal")}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {dispositivo.ultima_picagem_em?.slice(0, 16).replace("T", " ") ?? "—"}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {dispositivo.chave_rodada_em?.slice(0, 10) ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={dispositivo.activo ? "secondary" : "outline"}
                            className="font-normal"
                          >
                            {t(
                              dispositivo.activo
                                ? "hr.assiduidade.dispositivos.activo"
                                : "hr.assiduidade.dispositivos.inactivo",
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {permissoes.dispositivosEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => abrir(rascunhoDe(dispositivo))}
                            >
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

      <Sheet open={rascunho !== null} onOpenChange={(estado) => !estado && setRascunho(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {t(
                rascunho?.id
                  ? "hr.assiduidade.dispositivos.editarTitulo"
                  : "hr.assiduidade.dispositivos.criarTitulo",
              )}
            </SheetTitle>
            <SheetDescription>
              {t("hr.assiduidade.dispositivos.semChaveEmClaro")}
            </SheetDescription>
          </SheetHeader>

          {rascunho && (
            <CamposTocadosProvider onTocar={tocar}>
              <div className="mt-6 space-y-4">
                <CampoTexto
                  id="hr-dispositivo-codigo"
                  label={t("hr.assiduidade.dispositivos.codigo")}
                  valor={rascunho.codigo}
                  erro={erroDe("codigo", "hr-dispositivo-codigo")}
                  onChange={(valor) => setRascunho({ ...rascunho, codigo: valor })}
                />
                <CampoTexto
                  id="hr-dispositivo-nome"
                  label={t("hr.assiduidade.dispositivos.nome")}
                  valor={rascunho.nome}
                  erro={erroDe("nome", "hr-dispositivo-nome")}
                  onChange={(valor) => setRascunho({ ...rascunho, nome: valor })}
                />
                <CampoSelect
                  id="hr-dispositivo-tipo"
                  label={t("hr.assiduidade.dispositivos.tipo")}
                  valor={rascunho.tipo}
                  onChange={(valor) =>
                    setRascunho({ ...rascunho, tipo: valor as TipoDispositivo })
                  }
                  opcoes={TIPOS_DISPOSITIVO.map((tipo) => ({
                    value: tipo,
                    label: t(`hr.assiduidade.dispositivos.tipos.${tipo}`),
                  }))}
                />
                <CampoSelect
                  id="hr-dispositivo-local"
                  label={t("hr.assiduidade.campo.local")}
                  valor={rascunho.localId}
                  vazioLabel={t("hr.assiduidade.semLocal")}
                  onChange={(valor) => setRascunho({ ...rascunho, localId: valor })}
                  opcoes={locais.map((local) => ({ value: local.id, label: local.nome }))}
                />
                <CampoTexto
                  id="hr-dispositivo-ref"
                  label={t("hr.assiduidade.dispositivos.refExterna")}
                  ajuda={t("hr.assiduidade.dispositivos.refExternaAjuda")}
                  valor={rascunho.refExterna}
                  onChange={(valor) => setRascunho({ ...rascunho, refExterna: valor })}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoTexto
                    id="hr-dispositivo-fabricante"
                    label={t("hr.assiduidade.dispositivos.fabricante")}
                    valor={rascunho.fabricante}
                    onChange={(valor) => setRascunho({ ...rascunho, fabricante: valor })}
                  />
                  <CampoTexto
                    id="hr-dispositivo-modelo"
                    label={t("hr.assiduidade.dispositivos.modelo")}
                    valor={rascunho.modelo}
                    onChange={(valor) => setRascunho({ ...rascunho, modelo: valor })}
                  />
                </div>
                <CampoTexto
                  id="hr-dispositivo-notas"
                  label={t("hr.assiduidade.dispositivos.notas")}
                  valor={rascunho.notas}
                  onChange={(valor) => setRascunho({ ...rascunho, notas: valor })}
                />
                <CampoInterruptor
                  id="hr-dispositivo-activo"
                  label={t("hr.assiduidade.dispositivos.activo")}
                  descricao={t("hr.assiduidade.dispositivos.desactivarNaoEApagar")}
                  checked={rascunho.activo}
                  onChange={(valor) => setRascunho({ ...rascunho, activo: valor })}
                />
              </div>
            </CamposTocadosProvider>
          )}

          <SheetFooter className="mt-6 gap-2">
            <Button variant="ghost" disabled={saving} onClick={() => setRascunho(null)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={saving} onClick={() => void gravar()}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t("employees.form.update")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
