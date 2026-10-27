// O que vai dentro do painel da ficha de RH: o cabeçalho com as ações, as abas fixas e, na parte que rola, o convite, o que
// falta da admissão e o conteúdo da aba. Cada pessoa monta isto de raiz (a chave é o id). Os dados vêm da ficha real (usePessoa).
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SheetClose, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { FaixaProgressoAdmissaoDaFicha } from "@/components/rh-exemplo/hooks/FaixaProgressoAdmissaoDaFicha";
import { CriarAcessoDialog } from "@/components/rh-exemplo/CriarAcessoDialog";
import { EnviarConviteDialog } from "@/components/rh-exemplo/EnviarConviteDialog";
import { PessoaAdmissaoPendencias } from "@/components/rh-exemplo/PessoaAdmissaoPendencias";
import { PessoaConviteAdmissaoEstado } from "@/components/rh-exemplo/PessoaConviteAdmissaoEstado";
import { useConviteAdmissaoResumo, type ResumoConvite } from "@/components/rh-exemplo/hooks/useConviteAdmissaoResumo";
import { useFiliaisDaArvore } from "@/components/rh-exemplo/hooks/useFiliaisDaArvore";
import { usePessoa } from "@/components/rh-exemplo/hooks/usePessoa";
import { usePessoaFotografia } from "@/components/rh-exemplo/hooks/usePessoaFotografia";
import { podeEnviarNovoConvite } from "@/components/rh-exemplo/modoEnvioConvite";
import type { Pessoa } from "@/components/rh-exemplo/tipos";
import { useTranslation } from "@/hooks/useTranslation";
import { AbaCusto } from "@/components/rh-exemplo/custo/AbaCusto";
import { AbaAusencias, AbaContratos, AbaDocumentos, AbaPlaneamento } from "./AbasTempo";
import { AbaLaborais, AbaPessoais, AbaVisaoGeral, type AbaProps } from "./AbasPessoa";
import { AcoesFicha } from "./AcoesFicha";
import { CabecalhoFichaRh } from "./CabecalhoFichaRh";
import { contadoresDaFicha } from "./contadores";
import { ehAbaFicha, type AbaFicha } from "./abas";
import { ListaAbasFicha } from "./ListaAbasFicha";
import type { TeclaNavegacao, Vizinhas } from "./navegacao";
import { useContextoFicha, type ContextoFicha } from "./useContextoFicha";

export interface ConteudoFichaRhProps {
  id: string;
  vizinhas: Vizinhas;
  aoIr: (id: string, qual: TeclaNavegacao) => void;
  aba: string;
  aoMudarAba: (aba: string) => void;
  /** O painel deixou de carregar (ficha, «não encontrada» ou erro): é a altura de devolver o foco ao título ou ao botão. */
  aoPronta?: () => void;
}

/** Chama `aoPronta` uma vez, quando o ramo que a usa aparece (depois de o DOM existir). */
function useAvisarPronta(aoPronta: (() => void) | undefined): void {
  const ultima = useRef(aoPronta);
  ultima.current = aoPronta;
  useEffect(() => {
    ultima.current?.();
  }, []);
}

function ACarregar() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      {/* O painel é um diálogo: precisa de um título mesmo a carregar. O loader é a região de estado. */}
      <SheetTitle className="sr-only">{t("rhForm.ficha.aCarregar")}</SheetTitle>
      <OlyviaLoader text={t("rhForm.ficha.aCarregar")} />
    </div>
  );
}

function NaoEncontrada({ aoPronta }: { aoPronta?: () => void }) {
  const { t } = useTranslation();
  useAvisarPronta(aoPronta);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <SheetTitle tabIndex={-1} data-titulo-ficha="" className="outline-none">{t("hr.pessoa.notFound")}</SheetTitle>
      <SheetDescription>{t("rhForm.ficha.naoEncontrada")}</SheetDescription>
      <SheetClose asChild>
        <Button type="button" variant="outline" className="min-h-11">{t("rhForm.ficha.fecharAviso")}</Button>
      </SheetClose>
    </div>
  );
}

/** A leitura falhou (rede, base): não é «não encontrada». Diz-se, em português, e deixa tentar de novo. */
function ErroDeLeitura({ aoTentar, aoPronta }: { aoTentar: () => void; aoPronta?: () => void }) {
  const { t } = useTranslation();
  useAvisarPronta(aoPronta);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <SheetTitle tabIndex={-1} data-titulo-ficha="" className="outline-none">{t("rhForm.ficha.erroTitulo")}</SheetTitle>
      <SheetDescription>{t("rhForm.ficha.erroCarregar")}</SheetDescription>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" className="min-h-11" onClick={aoTentar}>{t("rhForm.ficha.tentarDeNovo")}</Button>
        <SheetClose asChild>
          <Button type="button" variant="outline" className="min-h-11">{t("rhForm.ficha.fecharAviso")}</Button>
        </SheetClose>
      </div>
    </div>
  );
}

export function ConteudoFichaRh(props: ConteudoFichaRhProps) {
  const ficha = usePessoa(props.id);
  // Só é «a carregar» enquanto ainda não há pessoa: depois de gravar a ficha recarrega e o painel fica montado.
  if (ficha.loading && !ficha.pessoa) return <ACarregar />;
  // Sem pessoa e com erro: a leitura falhou (não é «não encontrada»).
  if (!ficha.pessoa && ficha.error && !ficha.notFound) return <ErroDeLeitura aoTentar={() => void ficha.refresh()} aoPronta={props.aoPronta} />;
  if (ficha.notFound || !ficha.pessoa) return <NaoEncontrada aoPronta={props.aoPronta} />;
  return <FichaCompleta {...props} ficha={ficha} pessoa={ficha.pessoa} />;
}

type FichaCompletaProps = ConteudoFichaRhProps & Pick<AbaProps, "ficha" | "pessoa">;

/** O estado dos dois diálogos da ficha: enviar o convite e criar (ou reenviar) o acesso. */
function useDialogosFicha() {
  const [conviteAberto, setConviteAberto] = useState(false);
  const [acessoAberto, setAcessoAberto] = useState(false);
  return { conviteAberto, setConviteAberto, acessoAberto, setAcessoAberto };
}

/** A linha "Filial · Cargo" do cabeçalho: a filial é a do centro de trabalho da pessoa. */
function useSubtitulo(pessoa: Pessoa, ctx: ContextoFicha): string {
  const { t } = useTranslation();
  const { filiais } = useFiliaisDaArvore();
  const noDoLocal = ctx.locais.find((l) => l.id === pessoa.local_id)?.organograma_node_id;
  const filial = filiais.find((f) => f.id === noDoLocal)?.name ?? t("rhForm.ficha.semFilial");
  const cargo = ctx.cargos.find((c) => c.id === pessoa.cargo_id)?.nome ?? pessoa.cargo ?? t("rhForm.ficha.semCargo");
  return `${filial} · ${cargo}`;
}

/**
 * Gravar num separador recarrega a ficha (`loading` desce de novo): é o sinal para reler o que falta e o estado do convite,
 * senão o cartão ficava a dizer o que já se preencheu. A primeira carga já foi lida pelos próprios hooks.
 */
function useReler(aCarregar: boolean, ...recarregar: Array<() => void>) {
  const primeira = useRef(true);
  const ultimas = useRef(recarregar);
  ultimas.current = recarregar;
  useEffect(() => {
    if (aCarregar) return;
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    ultimas.current.forEach((fn) => fn());
  }, [aCarregar]);
}

function FichaCompleta({ vizinhas, aoIr, aba, aoMudarAba, ficha, pessoa, aoPronta }: FichaCompletaProps) {
  useAvisarPronta(aoPronta);
  const ctx = useContextoFicha(ficha, pessoa);
  const convite = useConviteAdmissaoResumo(pessoa.id);
  const fotografiaUrl = usePessoaFotografia(pessoa.fotografia_anexo_id);
  const dialogos = useDialogosFicha();
  const subtitulo = useSubtitulo(pessoa, ctx);
  const abaAtiva: AbaFicha = ehAbaFicha(aba) ? aba : "visaoGeral";
  const temConta = Boolean(ficha.conta);
  const p = ctx.pendencias;
  useReler(ficha.loading, p.recarregar, convite.recarregar);
  // Se não se sabe o que falta (sem permissão para o ver, ou a leitura falhou) o botão fica ativo: quem decide é o servidor.
  const pendencias = temConta || p.carregando || p.semAcesso || p.erro ? 0 : p.pendencias.length;
  const aoMudarCargo = () => {
    void ficha.refresh();
    p.recarregar();
  };

  return (
    <>
      <CabecalhoFichaRh
        pessoa={pessoa} subtitulo={subtitulo} fotografiaUrl={fotografiaUrl} temConta={temConta}
        estadoContrato={ctx.estadoContratoDerivado} vizinhas={vizinhas} aoIr={aoIr}
      />
      <AcoesFicha
        temConta={temConta} pendencias={pendencias} aoCriarAcesso={() => dialogos.setAcessoAberto(true)}
        aoEnviarConvite={() => dialogos.setConviteAberto(true)} podeEnviarConvite={podeEnviarNovoConvite(convite.resumo)}
        aoAbrirAba={aoMudarAba}
      />
      <FaixaProgressoAdmissaoDaFicha resumo={convite.resumo} />
      <Tabs value={abaAtiva} onValueChange={aoMudarAba} className="flex min-h-0 flex-1 flex-col">
        <ListaAbasFicha contadores={contadoresDaFicha(ficha)} abaAtiva={abaAtiva} />
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <PessoaConviteAdmissaoEstado
            pessoaId={pessoa.id} estado={convite} podeEnviar={ctx.hasPermission("hr.pessoas.convite.enviar") && !temConta}
            podeAprovar={ctx.hasPermission("hr.onboarding.approve")}
          />
          <PessoaAdmissaoPendencias pessoaId={pessoa.id} estado={p} />
          <ConteudoAba
            ficha={ficha} pessoa={pessoa} ctx={ctx} aoMudarAba={aoMudarAba} aoMudarCargo={aoMudarCargo} resumoConvite={convite.resumo}
          />
        </div>
      </Tabs>
      <Dialogos
        pessoa={pessoa} ctx={ctx} convite={convite} temConta={temConta} {...dialogos}
        aoCriadoAcesso={() => void ficha.refresh()}
      />
    </>
  );
}

function ConteudoAba(p: AbaProps & { aoMudarAba: (aba: string) => void; aoMudarCargo: () => void; resumoConvite: ResumoConvite | null }) {
  return (
    <>
      <TabsContent value="visaoGeral" className="mt-0"><AbaVisaoGeral {...p} aoAbrirAba={p.aoMudarAba} resumoConvite={p.resumoConvite} /></TabsContent>
      <TabsContent value="laborais" className="mt-0"><AbaLaborais {...p} aoMudarCargo={p.aoMudarCargo} /></TabsContent>
      <TabsContent value="pessoais" className="mt-0"><AbaPessoais {...p} /></TabsContent>
      <TabsContent value="contratos" className="mt-0"><AbaContratos {...p} /></TabsContent>
      <TabsContent value="planeamento" className="mt-0"><AbaPlaneamento {...p} /></TabsContent>
      <TabsContent value="ausencias" className="mt-0"><AbaAusencias {...p} /></TabsContent>
      <TabsContent value="documentos" className="mt-0"><AbaDocumentos {...p} /></TabsContent>
      <TabsContent value="custo" className="mt-0"><AbaCusto {...p} /></TabsContent>
    </>
  );
}

interface DialogosProps {
  pessoa: Pessoa;
  ctx: ContextoFicha;
  convite: ReturnType<typeof useConviteAdmissaoResumo>;
  temConta: boolean;
  conviteAberto: boolean;
  setConviteAberto: (aberto: boolean) => void;
  acessoAberto: boolean;
  setAcessoAberto: (aberto: boolean) => void;
  aoCriadoAcesso: () => void;
}

function Dialogos(p: DialogosProps) {
  const { pessoa, convite } = p;
  return (
    <>
      <EnviarConviteDialog
        open={p.conviteAberto} onOpenChange={p.setConviteAberto} pessoaId={pessoa.id}
        // O e-mail pessoal da ficha é só a sugestão: o RH pode escolher outro, e fica registado no evento.
        emailSugerido={pessoa.email_pessoal}
        // Só o estado do convite se relê: recarregar a ficha inteira fechava o diálogo com o link por copiar.
        onEnviado={convite.recarregar}
      />
      <CriarAcessoDialog
        open={p.acessoAberto} onOpenChange={p.setAcessoAberto} pessoaId={pessoa.id} modo={p.temConta ? "reenviar" : "criar"}
        pendencias={p.ctx.pendencias.pendencias} onCriado={p.aoCriadoAcesso}
      />
    </>
  );
}
