// As ações do RH sobre uma admissão, num só sítio: as que se fazem logo (aprovar, reenviar, renovar...) correm e dizem o que
// aconteceu numa mensagem; as que pedem mais (rever, rejeitar, gerar contrato, anular, enviar credenciais) abrem o seu
// diálogo. Serve o pipeline e o cartão da ficha, para os dois fazerem exactamente o mesmo. Tudo em memória.
import { useState, type ReactNode } from "react";
import {
  anularContrato, aprovarFicha, devolverFicha, reenviarContrato, reenviarLink, rejeitarFicha, renovarLogin, simularPrimeiroAcesso,
} from "@/components/rh-exemplo/dados/accoesAdmissao";
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import type { ResultadoAdmissao } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { useTranslation } from "@/hooks/useTranslation";
import { EnviarCredenciaisDialog } from "./EnviarCredenciaisDialog";
import { GerarContratoDialog } from "./GerarContratoDialog";
import { MotivoAdmissaoDialog } from "./MotivoAdmissaoDialog";
import { RevisaoAdmissaoDialog } from "./RevisaoAdmissaoDialog";

export type AcaoUi =
  | "rever" | "aprovar" | "devolver" | "rejeitar" | "gerarContrato" | "reenviarContrato" | "anularContrato"
  | "enviarCredenciais" | "renovarLogin" | "reenviarLink" | "simularAcesso";

type TipoDialogo = "rever" | "rejeitar" | "gerarContrato" | "anularContrato" | "enviarCredenciais";
const COM_DIALOGO: readonly AcaoUi[] = ["rever", "devolver", "rejeitar", "gerarContrato", "anularContrato", "enviarCredenciais"];

const IMEDIATAS: Partial<Record<AcaoUi, (id: string) => ResultadoAdmissao>> = {
  aprovar: aprovarFicha, reenviarLink, renovarLogin, reenviarContrato, simularAcesso: simularPrimeiroAcesso,
};

const nomeDe = (id: string): string => lerEstado().fichas[id]?.pessoa.nome_completo ?? "";

export interface AcoesAdmissao {
  executar: (pessoaId: string, acao: AcaoUi) => void;
  /** Os diálogos (montá-los uma vez, junto de quem usa `executar`). */
  dialogos: ReactNode;
  /** O que acabou de acontecer, em texto, para uma região `role="status"`. */
  mensagem: string | null;
}

export function useAcoesAdmissao(): AcoesAdmissao {
  const { t } = useTranslation();
  const [dialogo, setDialogo] = useState<{ pessoaId: string; tipo: TipoDialogo } | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const fechar = () => setDialogo(null);
  const dizer = (acao: string, id: string) => setMensagem(t(`rhAdm.msg.${acao}`, { nome: nomeDe(id) }));
  const abrir = (pessoaId: string, tipo: TipoDialogo) => setDialogo({ pessoaId, tipo });
  const aberto = (tipo: TipoDialogo): string | null => (dialogo?.tipo === tipo ? dialogo.pessoaId : null);

  const executar = (pessoaId: string, acao: AcaoUi) => {
    if (COM_DIALOGO.includes(acao)) return abrir(pessoaId, acao === "devolver" ? "rever" : (acao as TipoDialogo));
    const r = IMEDIATAS[acao]?.(pessoaId);
    if (r?.ok) dizer(acao, pessoaId);
    else if (r) setMensagem(t(`rhAdm.erro.${r.erro}`));
  };

  const motivo = (tipo: "rejeitar" | "anularContrato", fazer: (id: string, m: string) => ResultadoAdmissao) => {
    const id = aberto(tipo);
    return {
      aberto: id !== null, aoFechar: fechar,
      titulo: t(`rhAdm.${tipo}.titulo`, { nome: id ? nomeDe(id) : "" }), descricao: t(`rhAdm.${tipo}.descricao`),
      confirmar: t(`rhAdm.acao.${tipo}`),
      aoConfirmar: (m: string) => {
        const r = id ? fazer(id, m) : null;
        if (r?.ok && id) dizer(tipo, id);
        return Boolean(r?.ok);
      },
    };
  };

  const dialogos = (
    <>
      <RevisaoAdmissaoDialog
        pessoaId={aberto("rever")} aoFechar={fechar}
        aoAprovar={(id) => { if (aprovarFicha(id).ok) dizer("aprovar", id); fechar(); }}
        aoDevolver={(id, c) => { if (devolverFicha(id, c).ok) dizer("devolver", id); fechar(); }}
        aoRejeitar={(id) => abrir(id, "rejeitar")}
      />
      <MotivoAdmissaoDialog {...motivo("rejeitar", rejeitarFicha)} />
      <MotivoAdmissaoDialog {...motivo("anularContrato", anularContrato)} />
      <GerarContratoDialog
        pessoaId={aberto("gerarContrato")} aoFechar={fechar} aoGerado={(id) => { dizer("gerarContrato", id); fechar(); }}
      />
      <EnviarCredenciaisDialog
        pessoaId={aberto("enviarCredenciais")} aoFechar={fechar} aoEnviado={(id) => { dizer("enviarCredenciais", id); fechar(); }}
      />
    </>
  );
  return { executar, dialogos, mensagem };
}
