/** O estado da página «Organização»: árvore real (com as pessoas), pesquisa, nó aberto, painel de ligação, confirmação de «Desligar» e aviso. */
import { useMemo, useState } from "react";
import { construirArvore, ehNoOrg, filtrarArvore, idsExpansiveis } from "@/components/rh-exemplo/organizacao/arvore";
import { useOrganizacaoReal } from "@/components/rh-exemplo/organizacao/useOrganizacaoReal";
import { useTranslation } from "@/hooks/useTranslation";
import type { NoArvore, NoOrg, PedidoLigacao, ResultadoGravacao } from "@/components/rh-exemplo/organizacao/tipos";

/** O nó da estrutura com este identificador (as pessoas e «Sem centro atribuído» não abrem painel). */
function procurar(no: NoArvore, id: string | null): NoOrg | null {
  if (id === null) return null;
  if (no.id === id) return ehNoOrg(no) ? no : null;
  return no.filhos.reduce<NoOrg | null>((achado, f) => achado ?? procurar(f, id), null);
}

export function usePaginaOrganizacao() {
  const { t } = useTranslation();
  const real = useOrganizacaoReal();
  const { est, estado, pessoas } = real;
  const porId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);
  const arvore = useMemo(() => construirArvore(est, estado.ligacoes, pessoas), [est, estado.ligacoes, pessoas]);
  const todos = useMemo(() => idsExpansiveis(arvore), [arvore]);

  // Guardam-se os FECHADOS: um nó que passa a ter filhos (a primeira pessoa de um centro) nasce aberto.
  const [fechados, setFechados] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [termo, setTermo] = useState("");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [form, setForm] = useState<{ aberto: boolean; pessoaInicial: string | null }>({ aberto: false, pessoaInicial: null });
  const [aDesligar, setADesligar] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  const nomeDe = (id: string): string => porId.get(id)?.nome ?? id;
  const alternar = (id: string): void => {
    const novo = new Set(fechados);
    if (!novo.delete(id)) novo.add(id);
    setFechados(novo);
  };
  const guardar = async (pedido: PedidoLigacao): Promise<ResultadoGravacao> => {
    const r = await real.guardar(pedido);
    if (r.ok) setAviso(t(`rhOrg.feito.${r.tipo}`, { nome: nomeDe(pedido.pessoaId) }));
    return r;
  };
  const desligar = async (pessoaId: string, motivo: string): Promise<ResultadoGravacao> => {
    const r = await real.desligar(pessoaId, motivo);
    if (r.ok) {
      setAviso(t("rhOrg.feito.desligar", { nome: nomeDe(pessoaId) }));
      setADesligar(null);
    }
    return r;
  };

  const pesquisando = termo.trim() !== "";
  return {
    est, estado, pessoas, porId, termo, setTermo, aviso, seleccionado, setSeleccionado, form, aDesligar, setADesligar,
    loading: real.loading, semPermissao: real.semPermissao,
    falhaLeitura: real.falhaLeitura, recarregar: real.recarregar,
    visivel: filtrarArvore(arvore, termo),
    noAberto: procurar(arvore, seleccionado),
    abertos: pesquisando ? new Set(todos) : new Set(todos.filter((id) => !fechados.has(id))),
    pessoaADesligar: aDesligar ? { id: aDesligar, nome: nomeDe(aDesligar) } : null,
    alternar, guardar, desligar,
    expandirTudo: () => setFechados(new Set<string>()),
    recolherTudo: () => setFechados(new Set(todos)),
    abrirForm: (pessoaInicial: string | null) => setForm({ aberto: true, pessoaInicial }),
    fecharForm: () => setForm({ aberto: false, pessoaInicial: null }),
  };
}
