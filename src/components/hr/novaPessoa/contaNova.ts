// Ligar a «Nova pessoa» a uma conta de CRM que já existe. Escolher a conta PREENCHE os campos que ela sabe (nome, apelido,
// e-mail e telefone de trabalho, cargo e centro) sem tocar no que alguém já escreveu à mão; e só com `hr.pessoas.conta.link`
// é que a ficha, depois de criada, fica LIGADA a ela (`rpc_hr_ligar_conta`, no hook `usePessoas`): quem não pode ligar
// continua a poder preencher a partir da conta.
//
// Cada campo preenchido pela conta é um palpite: enquanto tem exatamente o que a conta pôs (e ninguém o tocou) marca-se como
// tal e leva a nota do que convém confirmar (um nome partido no último espaço, um e-mail em falta...). Trocar ou limpar a
// conta reverte só os palpites que ainda estão como a conta anterior os deixou, e nunca apaga uma letra escrita por alguém.
import { useCallback, useMemo, useState } from "react";
import { useContasLigaveis, type ContaLigavel } from "@/hooks/useContasLigaveis";
import {
  preenchimentoDaConta,
  reverterAutoPreenchido,
  type AvisoPreenchimento,
  type CamposPreenchiveis,
} from "@/lib/hr/preenchimentoPorConta";
import type { ValoresNovaPessoa } from "./tiposNova";

export interface ContaNova {
  contas: ContaLigavel[];
  loading: boolean;
  /** `hr.pessoas.conta.link`: muda só o texto da nota; o campo continua ativo dos dois lados. */
  podeLigar: boolean;
  aoEscolher: (contaId: string) => void;
  /** A nota do palpite (nome partido, e-mail em falta...) para o campo, ou `null` se não tem nenhum por confirmar. */
  avisoDoPalpite: (campoId: string) => AvisoPreenchimento | null;
  /** O campo ainda tem exatamente o valor que a conta lhe deixou (e ninguém o tocou)? Só então se marca como palpite. */
  ePalpite: (campoId: string) => boolean;
}

/** Os seis campos que uma conta pode preencher, lidos dos valores atuais. */
export function camposPreenchiveis(v: ValoresNovaPessoa): CamposPreenchiveis {
  return {
    primeiro_nome: v.geral.primeiro_nome,
    apelido: v.geral.apelido,
    email_trabalho: v.geral.email_trabalho,
    telefone_trabalho: v.geral.telefone_trabalho,
    cargo_id: v.laborais.cargo_id,
    local_id: v.laborais.local_id,
  };
}

const CAMPO_DO_ID: Record<string, keyof CamposPreenchiveis> = {
  "hr-novo-primeiro-nome": "primeiro_nome",
  "hr-novo-apelido": "apelido",
  "hr-novo-email-trabalho": "email_trabalho",
  "hr-novo-telefone-trabalho": "telefone_trabalho",
  "hr-novo-cargo": "cargo_id",
  "hr-novo-local": "local_id",
};

interface Entrada {
  valores: ValoresNovaPessoa;
  /** Substitui os valores todos de uma vez (o preenchimento mexe em dois grupos). */
  definir: (valores: ValoresNovaPessoa) => void;
  tocados: ReadonlySet<string>;
  locais: ReadonlyArray<{ id: string; nome: string }>;
  cargosActivos: ReadonlyArray<{ id: string; nome: string; activo: boolean }>;
  podeLigar: boolean;
}

export function useContaNova({ valores, definir, tocados, locais, cargosActivos, podeLigar }: Entrada): ContaNova {
  const { contas, loading } = useContasLigaveis();
  /** O que a conta escolhida escreveu em cada campo (distingue palpite de escrita à mão). */
  const [autoPreenchido, setAutoPreenchido] = useState<Record<string, string>>({});
  const [avisos, setAvisos] = useState<AvisoPreenchimento[]>([]);

  /**
   * Trocar (ou limpar) a conta: primeiro REVERTE os campos que ainda têm exatamente o palpite da conta ANTERIOR, só depois
   * aplica o preenchimento da conta nova -- nunca ao contrário, senão o preenchimento novo seria logo desfeito.
   */
  const aoEscolher = useCallback(
    (contaId: string) => {
      const reversao = reverterAutoPreenchido(camposPreenchiveis(valores), autoPreenchido);
      const depoisDaReversao: ValoresNovaPessoa = {
        ...valores,
        geral: { ...valores.geral, ...reversao.patchGeral, conta_id: contaId },
        laborais: { ...valores.laborais, ...reversao.patchLaborais },
      };
      const conta = contas.find((c) => c.id === contaId);
      if (!conta) {
        setAutoPreenchido({});
        setAvisos([]);
        definir(depoisDaReversao);
        return;
      }
      const resultado = preenchimentoDaConta(conta, camposPreenchiveis(depoisDaReversao), {}, locais, cargosActivos);
      setAutoPreenchido(resultado.autoNovo);
      setAvisos(resultado.avisos);
      definir({
        ...depoisDaReversao,
        geral: { ...depoisDaReversao.geral, ...resultado.patchGeral },
        laborais: { ...depoisDaReversao.laborais, ...resultado.patchLaborais },
      });
    },
    [valores, autoPreenchido, contas, locais, cargosActivos, definir],
  );

  const ePalpite = useCallback(
    (campoId: string): boolean => {
      const campo = CAMPO_DO_ID[campoId];
      return campo !== undefined && autoPreenchido[campoId] !== undefined && !tocados.has(campoId) && camposPreenchiveis(valores)[campo] === autoPreenchido[campoId];
    },
    [autoPreenchido, tocados, valores],
  );

  const avisoDoPalpite = useCallback(
    (campoId: string): AvisoPreenchimento | null => (tocados.has(campoId) ? null : (avisos.find((a) => a.campoId === campoId) ?? null)),
    [avisos, tocados],
  );

  return useMemo(
    () => ({ contas, loading, podeLigar, aoEscolher, avisoDoPalpite, ePalpite }),
    [contas, loading, podeLigar, aoEscolher, avisoDoPalpite, ePalpite],
  );
}
