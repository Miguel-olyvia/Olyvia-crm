// O que acontece à volta de cada passo, sem ser o passo: o aviso do que mudou (lido depois de o estado mudar, para dizer a fase
// em que a pessoa ficou, e só depois de o diálogo do passo desmontar: enquanto ele sai, o resto da página continua escondido do
// leitor de ecrã) e o foco, que volta ao botão certo quando o diálogo fecha. O aviso é só a região live: o toast com o mesmo texto
// não se repete (a convenção de `useResolucaoSubmissao`: o toast diz o que aconteceu, a região live só acrescenta).
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import type { ColunaQuadro } from "../quadro/cartoesQuadroPessoas";
import type { ResumoPessoa } from "../pessoasTipos";
import { textoDoAviso, type TipoAviso } from "./anunciosProcesso";
import { useAvisoAlternado } from "./avisoAlternado";
import { devolverFoco, type OrigemFoco } from "./focoProcesso";
import { itensDaPessoa } from "./itensProcesso";

interface Pendente {
  tipo: TipoAviso;
  pessoaId: string;
  /** A fase em que a pessoa estava antes do passo (`null` sem item). */
  antes: ColunaQuadro | null;
  /** A frase que o passo já traz escrita (a chamada: a visita marcada, a chamada agendada, a perdida); substitui a genérica. */
  mensagem?: string;
}

interface Entrada {
  resumos: readonly ResumoPessoa[];
  hoje: string;
  aoAnunciar: (texto: string) => void;
}

export function useControloProcesso({ resumos, hoje, aoAnunciar }: Entrada) {
  const { t } = useTranslation();
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const foco = useRef<OrigemFoco | null>(null);
  const anunciar = useRef(aoAnunciar);
  anunciar.current = aoAnunciar;
  const alternar = useAvisoAlternado();
  // O aviso pronto que espera que o diálogo do passo acabe de sair, e se esse diálogo já acabou.
  const emEspera = useRef<string | null>(null);
  const dialogoFechado = useRef(true);

  /** Diz uma frase ao leitor de ecrã; a mesma frase duas vezes seguidas volta a ser lida (o texto alterna um espaço inseparável). */
  const emitir = useCallback((texto: string) => anunciar.current(alternar(texto)), [alternar]);

  const itensDe = (pessoaId: string) => {
    const r = resumos.find((x) => x.pessoa.id === pessoaId);
    return r ? itensDaPessoa(r, hoje) : [];
  };

  /**
   * Chamado com o estado ainda por mudar (na mesma ação que o muda): o aviso sai depois, com a fase em que a pessoa ficou.
   * `mensagem` é a frase que o passo já traz escrita e que vale mais do que a genérica.
   */
  const registar = (tipo: TipoAviso, pessoaId: string, mensagem?: string) => {
    dialogoFechado.current = false;
    setPendente({ tipo, pessoaId, antes: itensDe(pessoaId)[0]?.fase ?? null, mensagem });
  };

  useEffect(() => {
    if (!pendente) return;
    const r = resumos.find((x) => x.pessoa.id === pendente.pessoaId);
    const depois = r ? itensDaPessoa(r, hoje)[0] ?? null : null;
    // Um negócio criado entra pelo seu próprio store: espera até a pessoa o ter, para não dizer a fase de antes.
    if (pendente.tipo === "negocio" && depois?.tipo !== "negocio") return;
    setPendente(null);
    const texto = pendente.mensagem ?? (r ? textoDoAviso(t, pendente.tipo, r.pessoa.nome, pendente.antes, depois) : "");
    if (!texto) { dialogoFechado.current = true; return; }
    // Com o diálogo ainda a sair, o resto da página está escondido do leitor de ecrã: guarda-se o aviso até ele desmontar.
    if (dialogoFechado.current) emitir(texto);
    else emEspera.current = texto;
  }, [pendente, resumos, hoje, t, emitir]);

  const guardarFoco = (origem: OrigemFoco) => { foco.current = origem; };
  /**
   * O diálogo fechou e desmontou (o Radix chama isto no `onCloseAutoFocus`): leva o foco ao botão certo (uma só vez), diz se o fez
   * (senão o diálogo devolve-o ao que o abriu) e só agora diz o aviso do passo, com a página outra vez à vista do leitor de ecrã.
   */
  const aoDevolverFoco = useCallback((): boolean => {
    const origem = foco.current;
    foco.current = null;
    const tratado = origem !== null && devolverFoco(origem);
    dialogoFechado.current = true;
    const texto = emEspera.current;
    emEspera.current = null;
    if (texto !== null) emitir(texto);
    return tratado;
  }, [emitir]);

  /** Diz já uma frase ao leitor de ecrã (o que falta para um passo avançar). */
  const avisar = (texto: string) => emitir(texto);

  return { registar, avisar, guardarFoco, aoDevolverFoco };
}

export type ControloProcesso = ReturnType<typeof useControloProcesso>;
