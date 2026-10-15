/** O estado da página «Organização»: árvore, pesquisa, nó aberto, painel de ligação, confirmação de «Desligar» e aviso. */
import { useMemo, useState } from "react";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { desligarPessoa, guardarLigacao } from "@/components/rh-exemplo/organizacao/accoesOrganizacao";
import { construirArvore, filtrarArvore, idsExpansiveis } from "@/components/rh-exemplo/organizacao/arvore";
import { pessoasDoExemplo } from "@/components/rh-exemplo/organizacao/dadosOrganizacao";
import { ESTRUTURA_ORGANIZACAO, useOrganizacao } from "@/components/rh-exemplo/organizacao/lojaOrganizacao";
import { useTranslation } from "@/hooks/useTranslation";
import type { ErroLigacao, NoOrg, PedidoLigacao, Resultado } from "@/components/rh-exemplo/organizacao/tipos";

function procurar(no: NoOrg, id: string | null): NoOrg | null {
  if (id === null) return null;
  return no.id === id ? no : no.filhos.reduce<NoOrg | null>((achado, f) => achado ?? procurar(f, id), null);
}

export function usePaginaOrganizacao() {
  const { t } = useTranslation();
  const estado = useOrganizacao();
  const rh = useEstadoRh((e) => e);
  const pessoas = useMemo(() => pessoasDoExemplo(rh), [rh]);
  const porId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);
  const arvore = useMemo(() => construirArvore(ESTRUTURA_ORGANIZACAO, estado.ligacoes), [estado.ligacoes]);
  const todos = useMemo(() => idsExpansiveis(arvore), [arvore]);

  const [abertos, setAbertos] = useState<ReadonlySet<string>>(() => new Set(todos));
  const [termo, setTermo] = useState("");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [form, setForm] = useState<{ aberto: boolean; pessoaInicial: string | null }>({ aberto: false, pessoaInicial: null });
  const [aDesligar, setADesligar] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  const nomeDe = (id: string): string => porId.get(id)?.nome ?? id;
  const alternar = (id: string): void => {
    const novo = new Set(abertos);
    if (!novo.delete(id)) novo.add(id);
    setAbertos(novo);
  };
  const guardar = (pedido: PedidoLigacao): Resultado => {
    const r = guardarLigacao(pedido);
    if (r.ok) setAviso(t(`rhOrg.feito.${r.tipo}`, { nome: nomeDe(pedido.pessoaId) }));
    return r;
  };
  const desligar = (pessoaId: string, motivo: string): ErroLigacao | null => {
    const r = desligarPessoa(pessoaId, motivo);
    if ("erro" in r) return r.erro;
    setAviso(t("rhOrg.feito.desligar", { nome: nomeDe(pessoaId) }));
    setADesligar(null);
    return null;
  };

  const pesquisando = termo.trim() !== "";
  return {
    estado, pessoas, porId, termo, setTermo, aviso, seleccionado, setSeleccionado, form, aDesligar, setADesligar,
    visivel: filtrarArvore(arvore, termo),
    noAberto: procurar(arvore, seleccionado),
    abertos: pesquisando ? new Set(todos) : abertos,
    pessoaADesligar: aDesligar ? { id: aDesligar, nome: nomeDe(aDesligar) } : null,
    alternar, guardar, desligar,
    expandirTudo: () => setAbertos(new Set(todos)),
    recolherTudo: () => setAbertos(new Set<string>()),
    abrirForm: (pessoaInicial: string | null) => setForm({ aberto: true, pessoaInicial }),
    fecharForm: () => setForm({ aberto: false, pessoaInicial: null }),
  };
}
