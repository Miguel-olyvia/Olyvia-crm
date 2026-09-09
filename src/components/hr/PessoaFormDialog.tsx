/**
 * O assistente de criacao de pessoa: cinco seccoes, preenchiveis de uma vez.
 *
 * (1) Informacoes gerais, (2) Detalhes pessoais, (3) Informacoes laborais,
 * (4) Informacoes de contrato, (5) Configuracoes gerais.
 *
 * NAVEGACAO LIVRE, NAO SEQUENCIAL
 * -------------------------------
 * As cinco entradas da lista sao clicaveis desde o primeiro instante. Nada
 * fica trancado atras de nada, por duas razoes concretas: os passos nao tem
 * dependencias entre si (nenhum campo do passo 4 muda de significado por causa
 * do passo 2), e quem abre o assistente so para escrever o contrato tem de
 * chegar ao passo 4 num clique -- senao deixa de usar o assistente.
 *
 * O QUE E OBRIGATORIO: primeiro nome e apelido. Nada mais, em nenhum passo --
 * sao os unicos NOT NULL de conteudo em `pessoas`. "Criar ficha" fica activo a
 * partir do momento em que os dois estao preenchidos, esteja-se no passo que
 * se estiver. VAZIO NUNCA E ERRO; MALFORMADO E SEMPRE ERRO.
 *
 * A ENTIDADE LEGAL NAO SE ESCOLHE: e a da organizacao activa, e aparece como
 * texto fixo no cabecalho para nao parecer omissao. "Grupo de colaboradores"
 * nao existe.
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Check, CircleDot, Loader2, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useLocaisTrabalho } from "@/hooks/useLocaisTrabalho";
import { usePapeisDaOrganizacao } from "@/hooks/usePapeisDaOrganizacao";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { linhasParaGravar, problemasDoHorario } from "@/lib/hr/horario";
import {
  SECCOES,
  payloadDoRascunho,
  problemasDoRascunho,
  rascunhoInicial,
  seccaoPreenchida,
  type NovaPessoaPayload,
  type RascunhoPessoa,
  type SeccaoId,
} from "@/lib/hr/novaPessoa";
import { CamposTocadosProvider } from "@/components/hr/form/Campos";
import { SeccaoConfiguracoesGerais } from "@/components/hr/form/SeccaoConfiguracoesGerais";
import { SeccaoContrato } from "@/components/hr/form/SeccaoContrato";
import { SeccaoDetalhesPessoais } from "@/components/hr/form/SeccaoDetalhesPessoais";
import { SeccaoInformacoesGerais } from "@/components/hr/form/SeccaoInformacoesGerais";
import { SeccaoInformacoesLaborais } from "@/components/hr/form/SeccaoInformacoesLaborais";
import type { ResultadoCriacao } from "@/hooks/usePessoas";

interface PessoaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pessoas da organizacao activa, para o selector de chefia. */
  colegas: Array<{ id: string; nome_completo: string }>;
  onCriar: (payload: NovaPessoaPayload) => Promise<ResultadoCriacao>;
  onCriada?: (pessoaId: string) => void;
}

export function PessoaFormDialog({
  open,
  onOpenChange,
  colegas,
  onCriar,
  onCriada,
}: PessoaFormDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const { hasPermission } = usePermissions();
  const {
    locais,
    loading: locaisALoad,
    semPermissao: semPermissaoLocais,
    criarLocal,
  } = useLocaisTrabalho();
  const { papeis, loading: papeisALoad } = usePapeisDaOrganizacao();

  const [rascunho, setRascunho] = useState<RascunhoPessoa>(() => rascunhoInicial());
  const [seccao, setSeccao] = useState<SeccaoId>("geral");
  const [aCriar, setACriar] = useState(false);
  const [mostrarResumo, setMostrarResumo] = useState(false);
  /** Campos de que a pessoa ja saiu. Enquanto um campo nao esta aqui, o seu
   * erro de formato fica calado -- ninguem quer ver "tem de ter nove digitos"
   * ao terceiro digito do NIF. */
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const [aConfirmarDescarte, setAConfirmarDescarte] = useState(false);

  const tocar = useCallback((campoId: string) => {
    setTocados((anteriores) => {
      if (anteriores.has(campoId)) return anteriores;
      return new Set(anteriores).add(campoId);
    });
  }, []);

  const podeCriarLocal = hasPermission("hr.locais.edit") && !semPermissaoLocais;
  const podeVerPapeis = hasPermission("roles.view");

  const problemas = useMemo(() => problemasDoRascunho(rascunho), [rascunho]);
  const problemasHorario = useMemo(
    () =>
      rascunho.contrato.horario_variavel ? problemasDoHorario(rascunho.contrato.horario) : [],
    [rascunho.contrato.horario_variavel, rascunho.contrato.horario],
  );

  const temNomes =
    rascunho.geral.primeiro_nome.trim() !== "" && rascunho.geral.apelido.trim() !== "";

  /** Os erros de obrigatoriedade mostram-se so no resumo, para nao pintar o
   * formulario de vermelho antes de alguem escrever nada. Os de formato
   * mostram-se ao SAIR do campo -- ou no resumo, que mostra tudo. */
  const erroDe = (campoId: string): string | null => {
    const problema = problemas.find((p) => p.campoId === campoId);
    if (!problema) return null;
    if (mostrarResumo) return t(problema.mensagemKey);
    if (problema.mensagemKey === "hr.form.erroObrigatorio") return null;
    return tocados.has(campoId) ? t(problema.mensagemKey) : null;
  };

  const problemasDaSeccao = (id: SeccaoId) => {
    const doCampo = problemas.filter((p) => p.seccao === id).length;
    if (id === "contrato") return doCampo + problemasHorario.length;
    return doCampo;
  };

  const limpar = () => {
    setRascunho(rascunhoInicial());
    setSeccao("geral");
    setMostrarResumo(false);
    setTocados(new Set());
    setAConfirmarDescarte(false);
  };

  const temDados = SECCOES.some((id) => seccaoPreenchida(rascunho, id));

  /** Fechar com dados preenchidos pede confirmacao: um Escape distraido nao
   * pode apagar cinco seccoes em silencio. Vazio fecha logo. */
  const tentarFechar = () => {
    // A criar, nao ha nada a confirmar: o rascunho ja foi enviado.
    if (aCriar) {
      onOpenChange(false);
      return;
    }
    if (temDados) {
      setAConfirmarDescarte(true);
      return;
    }
    limpar();
    onOpenChange(false);
  };

  const descartar = () => {
    limpar();
    onOpenChange(false);
  };

  const criar = async () => {
    if (problemas.length > 0 || problemasHorario.length > 0) {
      setMostrarResumo(true);
      return;
    }
    setACriar(true);
    try {
      const payload = payloadDoRascunho(rascunho, linhasParaGravar);
      const { id, falhas } = await onCriar(payload);

      const pendenciaDeAcesso = falhas.find((falha) => falha.seccao === "acesso");
      const falhasReais = falhas.filter((falha) => falha.seccao !== "acesso");

      if (falhasReais.length === 0) {
        toast.success(t("hr.sucesso.criada"));
      } else {
        // Nao ha falha silenciosa: diz-se quais as seccoes que nao ficaram
        // gravadas, e a ficha fica criada e editavel.
        toast.error(
          `${t("hr.form.criadaComFalhas")} ${falhasReais
            .map((falha) => t(`hr.form.seccoes.${falha.seccao}`))
            .join(", ")}`,
        );
      }
      if (pendenciaDeAcesso) {
        toast.warning(t("hr.acesso.convitePendente"));
      }

      limpar();
      onOpenChange(false);
      onCriada?.(id);
    } catch (e) {
      toast.error(await getFriendlyErrorMessage(e, t("hr.erros.guardar")));
    } finally {
      setACriar(false);
    }
  };

  const indice = SECCOES.indexOf(seccao);

  const iconeDoEstado = (id: SeccaoId) => {
    if (problemasDaSeccao(id) > 0 && (mostrarResumo || id !== "geral")) {
      return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
    }
    if (seccaoPreenchida(rascunho, id)) return <Check className="h-3.5 w-3.5 text-primary" />;
    if (id === seccao) return <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const estadoTextoDaSeccao = (id: SeccaoId) => {
    const avisos = problemasDaSeccao(id);
    if (avisos > 0) return t("hr.form.estado.comAvisos").replace("{n}", String(avisos));
    if (seccaoPreenchida(rascunho, id)) return t("hr.form.estado.preenchida");
    return t("hr.form.estado.vazia");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(proximo) => {
        if (!proximo) {
          tentarFechar();
          return;
        }
        onOpenChange(proximo);
      }}
    >
      <DialogContent className="max-h-[92vh] gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="space-y-1 border-b p-5">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{t("hr.pessoas.new")}</DialogTitle>
            {/* A entidade legal e SEMPRE esta. Aparece como texto para nao
                parecer omissao -- nao ha selector nenhum. */}
            {activeCompany && (
              <Badge variant="outline" className="font-normal">
                {t("hr.detalhes.entidadeLegal")}: {activeCompany.name}
              </Badge>
            )}
          </div>
          <DialogDescription>{t("hr.form.assistenteDescricao")}</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[70vh] grid-cols-1 sm:grid-cols-[15rem_1fr]">
          {/* A lista de passos e a navegacao. Cada entrada anuncia o seu estado
              em TEXTO: o ponto de aviso nao pode ser so cor. */}
          <div
            role="tablist"
            aria-label={t("hr.form.listaPassos")}
            aria-orientation="vertical"
            className="hidden border-r p-3 sm:block"
          >
            {SECCOES.map((id, i) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={id === seccao}
                aria-controls={`hr-novo-painel-${id}`}
                id={`hr-novo-passo-${id}`}
                onClick={() => setSeccao(id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
                  id === seccao ? "bg-muted font-medium" : "hover:bg-muted/60",
                )}
              >
                {iconeDoEstado(id)}
                <span className="flex-1">
                  {i + 1}. {t(`hr.form.seccoes.${id}`)}
                </span>
                <span className="sr-only">{estadoTextoDaSeccao(id)}</span>
              </button>
            ))}
          </div>

          <ScrollArea className="max-h-[70vh]">
            <CamposTocadosProvider onTocar={tocar}>
              <div
                role="tabpanel"
                id={`hr-novo-painel-${seccao}`}
                aria-labelledby={`hr-novo-passo-${seccao}`}
                className="space-y-4 p-5"
              >
                <div aria-live="polite" className="sr-only">
                  {t("hr.form.a11yPasso")
                    .replace("{n}", String(indice + 1))
                    .replace("{total}", String(SECCOES.length))
                    .replace("{nome}", t(`hr.form.seccoes.${seccao}`))}
                </div>

                {mostrarResumo && (problemas.length > 0 || problemasHorario.length > 0) && (
                  <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                    <p className="text-sm font-medium text-destructive">
                      {t("hr.form.resumoProblemas").replace(
                        "{n}",
                        String(problemas.length + problemasHorario.length),
                      )}
                    </p>
                    <ul className="space-y-1">
                      {problemas.map((problema) => (
                        <li key={`${problema.seccao}-${problema.campoId}`}>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs"
                            onClick={() => {
                              setSeccao(problema.seccao);
                              requestAnimationFrame(() =>
                                document.getElementById(problema.campoId)?.focus(),
                              );
                            }}
                          >
                            {t(`hr.form.seccoes.${problema.seccao}`)} → {t(problema.rotuloKey)}
                          </Button>
                        </li>
                      ))}
                      {problemasHorario.length > 0 && (
                        <li className="text-xs text-destructive">
                          {t("hr.form.seccoes.contrato")} → {t("hr.horario.titulo")} (
                          {problemasHorario.length})
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {seccao === "geral" && (
                  <SeccaoInformacoesGerais
                    valor={rascunho.geral}
                    erroDe={erroDe}
                    onPatch={(patch) =>
                      setRascunho((anterior) => ({
                        ...anterior,
                        geral: { ...anterior.geral, ...patch },
                      }))
                    }
                  />
                )}

                {seccao === "pessoais" && (
                  <SeccaoDetalhesPessoais
                    valor={rascunho.pessoais}
                    erroDe={erroDe}
                    onPatch={(patch) =>
                      setRascunho((anterior) => ({
                        ...anterior,
                        pessoais: { ...anterior.pessoais, ...patch },
                      }))
                    }
                  />
                )}

                {seccao === "laborais" && (
                  <SeccaoInformacoesLaborais
                    valor={rascunho.laborais}
                    erroDe={erroDe}
                    locais={locais}
                    locaisALoad={locaisALoad}
                    podeCriarLocal={podeCriarLocal}
                    onCriarLocal={criarLocal}
                    colegas={colegas}
                    onPatch={(patch) =>
                      setRascunho((anterior) => ({
                        ...anterior,
                        laborais: { ...anterior.laborais, ...patch },
                      }))
                    }
                  />
                )}

                {seccao === "contrato" && (
                  <SeccaoContrato
                    valor={rascunho.contrato}
                    erroDe={erroDe}
                    dataAdmissao={rascunho.laborais.data_admissao}
                    locais={locais}
                    locaisALoad={locaisALoad}
                    onPatch={(patch) =>
                      setRascunho((anterior) => ({
                        ...anterior,
                        contrato: { ...anterior.contrato, ...patch },
                      }))
                    }
                  />
                )}

                {seccao === "acesso" && (
                  <SeccaoConfiguracoesGerais
                    valor={rascunho.acesso}
                    erroDe={erroDe}
                    papeis={papeis}
                    papeisALoad={papeisALoad}
                    podeVerPapeis={podeVerPapeis}
                    emailTrabalho={rascunho.geral.email_trabalho}
                    onAbrirPapeis={() => {
                      onOpenChange(false);
                      navigate("/roles");
                    }}
                    onPatch={(patch) =>
                      setRascunho((anterior) => ({
                        ...anterior,
                        acesso: { ...anterior.acesso, ...patch },
                      }))
                    }
                  />
                )}
              </div>
            </CamposTocadosProvider>
          </ScrollArea>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t p-4">
          <Button
            variant="ghost"
            onClick={tentarFechar}
            disabled={aCriar}
            className="mr-auto"
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="outline"
            disabled={indice === 0 || aCriar}
            onClick={() => setSeccao(SECCOES[Math.max(0, indice - 1)])}
          >
            {t("common.previous")}
          </Button>
          <Button
            variant="outline"
            disabled={indice === SECCOES.length - 1 || aCriar}
            onClick={() => setSeccao(SECCOES[Math.min(SECCOES.length - 1, indice + 1)])}
          >
            {t("common.next")}
          </Button>
          {/* Activo a partir dos dois nomes, em QUALQUER passo: quem tem uma
              admissao as pressas nunca ve um bloqueio. */}
          <Button onClick={criar} disabled={aCriar || !temNomes}>
            {aCriar && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {t("hr.form.criarFicha")}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={aConfirmarDescarte} onOpenChange={setAConfirmarDescarte}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hr.form.descartar.titulo")}</AlertDialogTitle>
            <AlertDialogDescription>{t("hr.form.descartar.descricao")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("hr.form.descartar.continuar")}</AlertDialogCancel>
            <AlertDialogAction onClick={descartar}>
              {t("hr.form.descartar.confirmar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
