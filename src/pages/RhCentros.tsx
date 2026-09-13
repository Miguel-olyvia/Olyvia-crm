/**
 * Gestao de centros -- o ecra que faltava a `hr_locais_trabalho`.
 *
 * ATE AQUI so havia um atalho: dentro do assistente de nova pessoa
 * (`SeccaoInformacoesLaborais`) criava-se um centro com nome e tipo, e mais
 * nada. Nao havia pagina que os listasse, nem forma de editar ou desactivar.
 * Este ecra e essa gestao: listar, criar, editar, desactivar -- nunca apagar
 * (a base ja bloqueia o DELETE, `hr_locais_trabalho_block_delete`,
 * 20261120130000).
 *
 * MORADA + CONTACTO, E NAO SO NOME
 * ---------------------------------
 * O motivo e concreto: quando alguem falta, o RH precisa de telefonar para o
 * centro onde ela devia estar. Sem contacto, essa chamada nao tem para quem
 * ligar.
 *
 * O AVISO DE NOME PARECIDO, SO AO CRIAR
 * ---------------------------------------
 * "Worten" e "Worten Colombo" podem ser mesmo dois sitios -- por isso
 * `encontrarNomeParecido` (src/lib/hr/centrosSimilaridade.ts) AVISA, nunca
 * recusa nem funde. So corre na criacao: editar um centro ja existente nao
 * repete o aviso contra si proprio nem contra os outros a cada guardar.
 *
 * A FILIAL SO OFERECE O QUE A BASE ACEITARIA
 * ---------------------------------------------
 * `useFiliaisDaArvore` resolve a mesma arvore (organizacao activa +
 * descendentes) que o trigger `hr_no_pertence_a_arvore_da_org`
 * (20261130080000) exige -- por isso o selector nunca oferece um no que a
 * base fosse recusar. Se mesmo assim escapar (corrida entre dois separadores,
 * hierarquia mudada por outra pessoa), o erro do trigger chega traduzido via
 * `friendlyError.ts` (`organograma_no_fora_da_arvore`).
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, MapPin, Pencil, Plus, Search } from "lucide-react";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useLocaisTrabalho, type DadosLocalTrabalho } from "@/hooks/useLocaisTrabalho";
import { useFiliaisDaArvore } from "@/hooks/useFiliaisDaArvore";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { encontrarNomeParecido } from "@/lib/hr/centrosSimilaridade";
import { TIPOS_LOCAL, type LocalTrabalho, type TipoLocal } from "@/types/hr";

const FORM_VAZIO: DadosLocalTrabalho = {
  nome: "",
  tipo: "escritorio",
  codigo: "",
  organograma_node_id: "",
  morada: "",
  cidade: "",
  codigo_postal: "",
  pais: "PT",
  contacto_nome: "",
  contacto_telefone: "",
  notas: "",
};

function localParaForm(local: LocalTrabalho): DadosLocalTrabalho {
  return {
    nome: local.nome,
    tipo: local.tipo,
    codigo: local.codigo ?? "",
    organograma_node_id: local.organograma_node_id ?? "",
    morada: local.morada ?? "",
    cidade: local.cidade ?? "",
    codigo_postal: local.codigo_postal ?? "",
    pais: local.pais ?? "",
    contacto_nome: local.contacto_nome ?? "",
    contacto_telefone: local.contacto_telefone ?? "",
    notas: local.notas ?? "",
  };
}

export default function RhCentros() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const podeEditar = hasPermission("hr.locais.edit");

  const {
    locais,
    loading: locaisLoading,
    semPermissao,
    criarLocal,
    atualizarLocal,
    definirActivo,
  } = useLocaisTrabalho({ apenasAtivos: false });
  const { filiais, loading: filiaisLoading } = useFiliaisDaArvore();

  const [procura, setProcura] = useState("");
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [editando, setEditando] = useState<LocalTrabalho | null>(null);
  const [form, setForm] = useState<DadosLocalTrabalho>(FORM_VAZIO);
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [avisoParecido, setAvisoParecido] = useState<{ id: string; nome: string } | null>(null);
  const [alvoDesactivar, setAlvoDesactivar] = useState<LocalTrabalho | null>(null);
  const [alvoReactivar, setAlvoReactivar] = useState<LocalTrabalho | null>(null);
  const [aAlterarEstado, setAAlterarEstado] = useState(false);

  const filtrados = useMemo(() => {
    const termo = procura.trim().toLowerCase();
    if (termo === "") return locais;
    return locais.filter((local) =>
      [local.nome, local.codigo, local.cidade]
        .filter(Boolean)
        .some((campo) => (campo as string).toLowerCase().includes(termo)),
    );
  }, [procura, locais]);

  const nomeDaFilial = (id: string | null) =>
    id ? (filiais.find((filial) => filial.id === id)?.name ?? null) : null;

  const abrirNovo = () => {
    setEditando(null);
    setForm(FORM_VAZIO);
    setErroNome(null);
    setDialogoAberto(true);
  };

  const abrirEditar = (local: LocalTrabalho) => {
    setEditando(local);
    setForm(localParaForm(local));
    setErroNome(null);
    setDialogoAberto(true);
  };

  const gravar = async (ignorarAvisoDeNomeParecido = false) => {
    if (form.nome.trim() === "") {
      setErroNome(t("hr.locais.erroNomeVazio"));
      return;
    }
    setErroNome(null);

    // O aviso so corre a CRIAR, e so quando ainda nao foi confirmado.
    if (!editando && !ignorarAvisoDeNomeParecido) {
      const parecido = encontrarNomeParecido(form.nome, locais);
      if (parecido) {
        setAvisoParecido(parecido);
        return;
      }
    }

    setSalvando(true);
    try {
      if (editando) {
        await atualizarLocal(editando.id, form);
        toast.success(t("hr.locais.actualizado"));
      } else {
        await criarLocal(form);
        toast.success(t("hr.locais.criado"));
      }
      setDialogoAberto(false);
      setAvisoParecido(null);
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    } finally {
      setSalvando(false);
    }
  };

  const confirmarDesactivar = async () => {
    if (!alvoDesactivar) return;
    setAAlterarEstado(true);
    try {
      await definirActivo(alvoDesactivar.id, false);
      toast.success(t("hr.locais.desactivado"));
      setAlvoDesactivar(null);
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    } finally {
      setAAlterarEstado(false);
    }
  };

  const confirmarReactivar = async () => {
    if (!alvoReactivar) return;
    setAAlterarEstado(true);
    try {
      await definirActivo(alvoReactivar.id, true);
      toast.success(t("hr.locais.reactivado"));
      setAlvoReactivar(null);
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    } finally {
      setAAlterarEstado(false);
    }
  };

  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  // A rota ja exige `hr.locais.view` (App.tsx), mas `semPermissao` cobre
  // tambem o caso em que a RLS recusa a leitura mesmo com a permissao
  // aparentemente presente -- a mesma distincao de AusenciasOrganizacao.
  if (!hasPermission("hr.locais.view") || semPermissao) return <SemAcessoCard className="m-6" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("hr.locais.gestaoTitulo")}</h1>
          <p className="text-muted-foreground">{t("hr.locais.gestaoSubtitulo")}</p>
        </div>
        {podeEditar && (
          <Button onClick={abrirNovo} className="gap-2">
            <Plus className="h-4 w-4" />
            {t("hr.locais.novoCentro")}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
              placeholder={t("hr.locais.pesquisar")}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {locaisLoading ? (
            <div className="flex justify-center py-12">
              <OlyviaLoader size={32} />
            </div>
          ) : filtrados.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              {locais.length === 0 ? t("hr.locais.semLocais") : t("hr.locais.semResultados")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("hr.locais.nome")}</TableHead>
                  <TableHead>{t("hr.locais.tipo")}</TableHead>
                  <TableHead>{t("hr.locais.colunaFilial")}</TableHead>
                  <TableHead>{t("hr.locais.colunaContacto")}</TableHead>
                  <TableHead>{t("hr.locais.colunaEstado")}</TableHead>
                  {podeEditar && (
                    <TableHead className="text-right">{t("hr.locais.colunaAcoes")}</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((local) => (
                  <TableRow key={local.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{local.nome}</div>
                          {local.codigo && (
                            <div className="text-xs text-muted-foreground">{local.codigo}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{t(`hr.locais.tipos.${local.tipo}`)}</TableCell>
                    <TableCell>{nomeDaFilial(local.organograma_node_id) ?? "-"}</TableCell>
                    <TableCell>
                      {local.contacto_nome || local.contacto_telefone ? (
                        <div className="text-sm">
                          {local.contacto_nome && <div>{local.contacto_nome}</div>}
                          {local.contacto_telefone && (
                            <div className="text-muted-foreground">{local.contacto_telefone}</div>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={local.activo ? "default" : "outline"} className="font-normal">
                        {t(local.activo ? "hr.locais.activo" : "hr.locais.inactivo")}
                      </Badge>
                    </TableCell>
                    {podeEditar && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => abrirEditar(local)}
                            aria-label={t("hr.locais.editarCentroAria", { nome: local.nome })}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {local.activo ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAlvoDesactivar(local)}
                            >
                              {t("hr.locais.desactivar")}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAlvoReactivar(local)}
                            >
                              {t("hr.locais.reactivar")}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Criar / editar */}
      <Dialog open={dialogoAberto} onOpenChange={(aberto) => !salvando && setDialogoAberto(aberto)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? t("hr.locais.editarCentro") : t("hr.locais.novoCentro")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto
              id="centro-nome"
              label={t("hr.locais.nome")}
              obrigatorio
              erro={erroNome}
              valor={form.nome}
              onChange={(v) => setForm((f) => ({ ...f, nome: v }))}
              className="sm:col-span-2"
            />
            <CampoSelect
              id="centro-tipo"
              label={t("hr.locais.tipo")}
              valor={form.tipo}
              opcoes={TIPOS_LOCAL.map((tipo) => ({ value: tipo, label: t(`hr.locais.tipos.${tipo}`) }))}
              onChange={(v) => setForm((f) => ({ ...f, tipo: v as TipoLocal }))}
            />
            <CampoTexto
              id="centro-codigo"
              label={t("hr.locais.codigo")}
              valor={form.codigo ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, codigo: v }))}
            />
            <CampoSelect
              id="centro-filial"
              label={t("hr.locais.filial")}
              ajuda={t("hr.locais.filialAjuda")}
              valor={form.organograma_node_id ?? ""}
              vazioLabel={t("hr.locais.semFilial")}
              disabled={filiaisLoading}
              opcoes={filiais.map((filial) => ({ value: filial.id, label: filial.name }))}
              onChange={(v) => setForm((f) => ({ ...f, organograma_node_id: v }))}
              className="sm:col-span-2"
            />
            <CampoTexto
              id="centro-contacto-nome"
              label={t("hr.locais.contactoNome")}
              valor={form.contacto_nome ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, contacto_nome: v }))}
            />
            <CampoTexto
              id="centro-contacto-telefone"
              label={t("hr.locais.contactoTelefone")}
              tipo="tel"
              valor={form.contacto_telefone ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, contacto_telefone: v }))}
            />
            <CampoTexto
              id="centro-morada"
              label={t("hr.locais.morada")}
              valor={form.morada ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, morada: v }))}
              className="sm:col-span-2"
            />
            <CampoTexto
              id="centro-cidade"
              label={t("hr.locais.cidade")}
              valor={form.cidade ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, cidade: v }))}
            />
            <CampoTexto
              id="centro-codigo-postal"
              label={t("hr.locais.codigoPostal")}
              valor={form.codigo_postal ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, codigo_postal: v }))}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoAberto(false)} disabled={salvando}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void gravar(false)} disabled={salvando}>
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("hr.locais.guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aviso de nome parecido -- SO na criacao. Avisa, nao funde nem impede. */}
      <AlertDialog open={avisoParecido !== null} onOpenChange={(aberto) => !aberto && setAvisoParecido(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hr.locais.nomeParecidoTitulo")}</AlertDialogTitle>
            <AlertDialogDescription>
              {avisoParecido &&
                t("hr.locais.nomeParecidoTexto", { novo: form.nome, existente: avisoParecido.nome })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>{t("hr.locais.nomeParecidoRever")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void gravar(true)} disabled={salvando}>
              {t("hr.locais.nomeParecidoContinuar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Desactivar -- nunca apaga. O historico fica intacto. */}
      <AlertDialog open={alvoDesactivar !== null} onOpenChange={(aberto) => !aberto && setAlvoDesactivar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {alvoDesactivar && t("hr.locais.confirmarDesactivarTitulo", { nome: alvoDesactivar.nome })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("hr.locais.confirmarDesactivarTexto")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aAlterarEstado}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmarDesactivar()} disabled={aAlterarEstado}>
              {t("hr.locais.desactivar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={alvoReactivar !== null} onOpenChange={(aberto) => !aberto && setAlvoReactivar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {alvoReactivar && t("hr.locais.confirmarReactivarTitulo", { nome: alvoReactivar.nome })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("hr.locais.confirmarReactivarTexto")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aAlterarEstado}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmarReactivar()} disabled={aAlterarEstado}>
              {t("hr.locais.reactivar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
