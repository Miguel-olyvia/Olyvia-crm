// O que vai dentro do painel da ficha de RH: o cabeçalho com as ações, as abas fixas e, na parte que rola, o convite, o que
// falta da admissão e o conteúdo da aba. Cada pessoa monta isto de raiz (a chave é o id). Só memória, sem acesso a dados.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CriarAcessoDialog } from "@/components/rh-exemplo/CriarAcessoDialog";
import { EnviarConviteDialog } from "@/components/rh-exemplo/EnviarConviteDialog";
import { PessoaAdmissaoPendencias } from "@/components/rh-exemplo/PessoaAdmissaoPendencias";
import { PessoaConviteAdmissaoEstado } from "@/components/rh-exemplo/PessoaConviteAdmissaoEstado";
import { useFichaRh } from "@/components/rh-exemplo/dados/loja";
import { useConviteAdmissaoResumo } from "@/components/rh-exemplo/hooks/useConviteAdmissaoResumo";
import { useFiliaisDaArvore } from "@/components/rh-exemplo/hooks/useFiliaisDaArvore";
import { usePessoa } from "@/components/rh-exemplo/hooks/usePessoa";
import { usePessoaFotografia } from "@/components/rh-exemplo/hooks/usePessoaFotografia";
import { modoDeEnvioDoConvite } from "@/components/rh-exemplo/modoEnvioConvite";
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
}

function NaoEncontrada() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <SheetTitle>{t("hr.pessoa.notFound")}</SheetTitle>
      <SheetDescription>{t("rhForm.ficha.naoEncontrada")}</SheetDescription>
      <SheetClose asChild>
        <Button type="button" variant="outline" className="min-h-11">{t("rhForm.ficha.fecharAviso")}</Button>
      </SheetClose>
    </div>
  );
}

export function ConteudoFichaRh(props: ConteudoFichaRhProps) {
  const ficha = usePessoa(props.id);
  if (ficha.notFound || !ficha.pessoa) return <NaoEncontrada />;
  return <FichaCompleta {...props} ficha={ficha} pessoa={ficha.pessoa} />;
}

type FichaCompletaProps = ConteudoFichaRhProps & Pick<AbaProps, "ficha" | "pessoa">;

/** O estado dos dois diálogos da ficha: enviar (ou reenviar) o convite e criar (ou reenviar) o acesso. */
function useDialogosFicha() {
  const [conviteAberto, setConviteAberto] = useState(false);
  const [conviteModo, setConviteModo] = useState<"enviar" | "reenviar">("enviar");
  const [acessoAberto, setAcessoAberto] = useState(false);
  const abrirConvite = (modo: "enviar" | "reenviar") => {
    setConviteModo(modo);
    setConviteAberto(true);
  };
  return { conviteAberto, conviteModo, setConviteAberto, acessoAberto, setAcessoAberto, abrirConvite };
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

function FichaCompleta({ vizinhas, aoIr, aba, aoMudarAba, ficha, pessoa }: FichaCompletaProps) {
  const ctx = useContextoFicha(ficha, pessoa);
  const convite = useConviteAdmissaoResumo(pessoa.id);
  const dados = useFichaRh(pessoa.id);
  const fotografiaUrl = usePessoaFotografia(pessoa.fotografia_anexo_id);
  const dialogos = useDialogosFicha();
  const subtitulo = useSubtitulo(pessoa, ctx);
  const abaAtiva: AbaFicha = ehAbaFicha(aba) ? aba : "visaoGeral";
  const temConta = Boolean(ficha.conta);
  const p = ctx.pendencias;
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
        aoEnviarConvite={() => dialogos.abrirConvite(modoDeEnvioDoConvite(convite.resumo))} aoAbrirAba={aoMudarAba}
      />
      <Tabs value={abaAtiva} onValueChange={aoMudarAba} className="flex min-h-0 flex-1 flex-col">
        <ListaAbasFicha contadores={contadoresDaFicha(dados)} abaAtiva={abaAtiva} />
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <PessoaConviteAdmissaoEstado
            pessoaId={pessoa.id} estado={convite} podeEnviar={ctx.hasPermission("hr.pessoas.convite.enviar") && !temConta}
            onReenviar={() => dialogos.abrirConvite("reenviar")}
          />
          <PessoaAdmissaoPendencias pessoaId={pessoa.id} estado={p} />
          <ConteudoAba ficha={ficha} pessoa={pessoa} ctx={ctx} aoMudarAba={aoMudarAba} aoMudarCargo={aoMudarCargo} />
        </div>
      </Tabs>
      <Dialogos
        pessoa={pessoa} ctx={ctx} convite={convite} temConta={temConta} {...dialogos}
        aoCriadoAcesso={() => void ficha.refresh()}
      />
    </>
  );
}

function ConteudoAba(p: AbaProps & { aoMudarAba: (aba: string) => void; aoMudarCargo: () => void }) {
  return (
    <>
      <TabsContent value="visaoGeral" className="mt-0"><AbaVisaoGeral {...p} aoAbrirAba={p.aoMudarAba} /></TabsContent>
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
  conviteModo: "enviar" | "reenviar";
  setConviteAberto: (aberto: boolean) => void;
  acessoAberto: boolean;
  setAcessoAberto: (aberto: boolean) => void;
  aoCriadoAcesso: () => void;
}

function Dialogos(p: DialogosProps) {
  const { pessoa, convite, conviteModo } = p;
  return (
    <>
      <EnviarConviteDialog
        open={p.conviteAberto} onOpenChange={p.setConviteAberto} pessoaId={pessoa.id} modo={conviteModo}
        emailSugerido={conviteModo === "reenviar" ? (convite.resumo?.emailDestino ?? pessoa.email_pessoal) : pessoa.email_pessoal}
        onEnviado={convite.recarregar}
      />
      <CriarAcessoDialog
        open={p.acessoAberto} onOpenChange={p.setAcessoAberto} pessoaId={pessoa.id} modo={p.temConta ? "reenviar" : "criar"}
        pendencias={p.ctx.pendencias.pendencias} onCriado={p.aoCriadoAcesso}
      />
    </>
  );
}
