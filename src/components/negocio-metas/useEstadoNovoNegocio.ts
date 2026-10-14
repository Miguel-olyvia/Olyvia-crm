// O estado do formulário de "Novo negócio", em dois pedaços: os campos da aba Geral e o levantamento. Cada alteração
// avisa `aoSujar` (para o painel saber que há coisas por gravar). Nada aqui grava: é tudo exemplo, em memória.
import { useRef, useState } from "react";
import type { AcoesGeral, ValoresGeral } from "./AbaGeralNovoNegocio";
import type { AcoesLevantamento } from "./AbaLevantamentoNovoNegocio";
import { adaptarLinhasAoServico, levantamentoVazio, novaLinha, type LevantamentoForm, type LinhaForm } from "./levantamento";
import {
  COMERCIAL_POR_OMISSAO, CONTACTO_VAZIO, reporContacto, type ChaveContacto, type PessoaOpcao,
} from "./novoNegocio";

export function useCamposGerais(pessoas: readonly PessoaOpcao[], aoSujar: () => void) {
  const [valores, setValores] = useState<ValoresGeral>({
    pessoaId: "", servico: "", servicoOutro: "", comercial: COMERCIAL_POR_OMISSAO, contacto: CONTACTO_VAZIO,
  });
  const [tocados, setTocados] = useState<ReadonlySet<ChaveContacto>>(new Set());
  const mudar = (parcial: Partial<ValoresGeral>) => { aoSujar(); setValores((v) => ({ ...v, ...parcial })); };
  const acoes: AcoesGeral = {
    pessoa: (id) => {
      aoSujar();
      setValores((v) => ({ ...v, pessoaId: id, contacto: reporContacto(v.contacto, tocados, pessoas.find((p) => p.id === id)) }));
    },
    servico: (servico) => mudar({ servico }),
    servicoOutro: (servicoOutro) => mudar({ servicoOutro }),
    comercial: (comercial) => mudar({ comercial }),
    contacto: (chave, valor) => {
      aoSujar();
      setTocados((antes) => new Set(antes).add(chave));
      setValores((v) => ({ ...v, contacto: { ...v.contacto, [chave]: valor } }));
    },
  };
  return { valores, acoes };
}

export function useLevantamentoForm(hoje: string, servico: string, aoSujar: () => void) {
  const [levantamento, setLevantamento] = useState<LevantamentoForm>(() => levantamentoVazio(hoje, COMERCIAL_POR_OMISSAO));
  const sequencia = useRef(0);
  const alterar = (f: (l: LevantamentoForm) => LevantamentoForm) => { aoSujar(); setLevantamento(f); };
  const acoes: AcoesLevantamento = {
    mudar: (parcial) => alterar((l) => ({ ...l, ...parcial })),
    adicionarLinha: () => {
      sequencia.current += 1;
      const linha = novaLinha(`l${sequencia.current}`, servico);
      alterar((l) => ({ ...l, linhas: [...l.linhas, linha] }));
    },
    mudarLinha: (id: string, parcial: Partial<LinhaForm>) =>
      alterar((l) => ({ ...l, linhas: l.linhas.map((x) => (x.id === id ? { ...x, ...parcial } : x)) })),
    removerLinha: (id) => alterar((l) => ({ ...l, linhas: l.linhas.filter((x) => x.id !== id) })),
  };
  /** Ao mudar o serviço, os trabalhos escolhidos que já não servem ficam por escolher. */
  const adaptarAoServico = (novo: string) =>
    setLevantamento((l) => ({ ...l, linhas: adaptarLinhasAoServico(l.linhas, novo) }));
  return { levantamento, acoes, adaptarAoServico };
}
