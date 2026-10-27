/** O estado do painel «Ligar pessoa» / «Alterar ligação»: campos, dependências empresa > filial e envio. */
import { useState, type FormEvent } from "react";
import { dataDeHojeBase } from "@/components/rh-exemplo/lib/dataBase";
import { centroPrincipalDaFilial } from "@/components/rh-exemplo/organizacao/arvore";
import type {
  CentroOrg, ErroLigacao, EstadoOrganizacao, EstruturaOrg, FilialOrg, Ligacao, PedidoLigacao, ResultadoGravacao,
} from "@/components/rh-exemplo/organizacao/tipos";

interface Entrada {
  est: EstruturaOrg;
  estado: EstadoOrganizacao;
  pessoaInicial: string | null;
  aoFechar: () => void;
  aoGuardar: (pedido: PedidoLigacao) => Promise<ResultadoGravacao>;
}

export interface FormLigacao {
  pessoaId: string;
  empresaId: string;
  filialId: string;
  /** Vazio = «mesmo centro da filial». */
  centroId: string;
  desde: string;
  motivo: string;
  erro: ErroLigacao | null;
  /** A recusa da base, já traduzida, quando a há. */
  mensagemErro: string | null;
  aGuardar: boolean;
  /** A ligação actual da pessoa escolhida, se já estiver ligada. */
  ligada: Ligacao | undefined;
  principal: CentroOrg | null;
  filiaisDaEmpresa: FilialOrg[];
  escolherPessoa: (id: string) => void;
  escolherEmpresa: (id: string) => void;
  setFilialId: (id: string) => void;
  setCentroId: (id: string) => void;
  setDesde: (v: string) => void;
  setMotivo: (v: string) => void;
  submeter: (e: FormEvent) => Promise<void>;
}

export function useFormLigacao({ est, estado, pessoaInicial, aoFechar, aoGuardar }: Entrada): FormLigacao {
  const atual = (id: string): Ligacao | undefined => estado.ligacoes.find((l) => l.pessoaId === id);
  const inicial = pessoaInicial ? atual(pessoaInicial) : undefined;
  const [pessoaId, setPessoaId] = useState(pessoaInicial ?? "");
  // Com uma só empresa (a organização activa) não há nada a escolher.
  const [empresaId, setEmpresaId] = useState(inicial?.empresaId ?? (est.empresas.length === 1 ? est.empresas[0]!.id : ""));
  const [filialId, setFilialId] = useState(inicial?.filialId ?? "");
  const [centroId, setCentroId] = useState(inicial?.centroId ?? "");
  const [desde, setDesde] = useState(() => dataDeHojeBase());
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<ErroLigacao | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);

  const escolherPessoa = (id: string): void => {
    setPessoaId(id);
    const l = atual(id);
    if (!l) return;
    setEmpresaId(l.empresaId);
    setFilialId(l.filialId);
    setCentroId(l.centroId);
  };
  const escolherEmpresa = (id: string): void => {
    setEmpresaId(id);
    if (est.filiais.find((f) => f.id === filialId)?.empresaId !== id) setFilialId("");
  };
  const submeter = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setAGuardar(true);
    try {
      const r = await aoGuardar({ pessoaId, empresaId, filialId, centroId: centroId || null, desde, motivo });
      if (r.ok) {
        aoFechar();
      } else {
        setErro(r.erro);
        setMensagemErro(r.mensagem ?? null);
      }
    } finally {
      setAGuardar(false);
    }
  };

  return {
    pessoaId, empresaId, filialId, centroId, desde, motivo, erro, mensagemErro, aGuardar,
    ligada: pessoaId ? atual(pessoaId) : undefined,
    principal: filialId ? centroPrincipalDaFilial(est, filialId) : null,
    filiaisDaEmpresa: est.filiais.filter((f) => f.empresaId === empresaId),
    escolherPessoa, escolherEmpresa, setFilialId, setCentroId, setDesde, setMotivo, submeter,
  };
}
