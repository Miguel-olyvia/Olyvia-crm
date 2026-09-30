import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthProvider";
import { listarRotulos } from "../lib/config";
import {
  nomeDe,
  opcoesAtivas,
  opcoesDaLista,
  type Lista,
  type Opcao,
  type RotuloGravado,
} from "../domain/rotulos";

/**
 * O vocabulário desta organização, disponível em toda a aplicação.
 *
 * Um contexto à parte e não mais um campo no `AuthProvider`: o Auth decide se
 * a pessoa entra, e uma falha a carregar nomes não pode ter nada que ver com
 * isso. Aqui, falhar significa cair nos nomes do código — que é exatamente o
 * que uma organização que nunca abriu as Definições vê.
 *
 * Trocar de organização no topo troca o vocabulário: uma empresa do grupo
 * pode chamar &ldquo;piso&rdquo; ao que a outra chama &ldquo;zona&rdquo;.
 */

interface EstadoDosRotulos {
  /** O nome que esta empresa dá a um valor. Nunca devolve vazio. */
  nome: (lista: Lista, valor: string | null | undefined) => string;
  /** As opções a mostrar numa caixa de escolha para trabalho novo. */
  opcoes: (lista: Lista) => Opcao[];
  /** Todas, incluindo as escondidas — para mostrar o que já está gravado. */
  todas: (lista: Lista) => Opcao[];
  /** Voltar a ler, depois de alguém mexer nas Definições. */
  recarregar: () => void;
}

const Ctx = createContext<EstadoDosRotulos | null>(null);

export function RotulosProvider({ children }: { children: ReactNode }) {
  const { activeOrgId } = useAuth();
  const [rotulos, setRotulos] = useState<RotuloGravado[]>([]);
  const [gatilho, setGatilho] = useState(0);

  useEffect(() => {
    let vivo = true;
    if (!activeOrgId) {
      setRotulos([]);
      return;
    }
    void listarRotulos(activeOrgId).then((r) => {
      if (vivo) setRotulos(r);
    });
    return () => {
      vivo = false;
    };
  }, [activeOrgId, gatilho]);

  const recarregar = useCallback(() => setGatilho((n) => n + 1), []);

  const value = useMemo<EstadoDosRotulos>(
    () => ({
      nome: (lista, valor) => nomeDe(lista, valor, rotulos),
      opcoes: (lista) => opcoesAtivas(lista, rotulos),
      todas: (lista) => opcoesDaLista(lista, rotulos),
      recarregar,
    }),
    [rotulos, recarregar]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * O vocabulário, onde for preciso.
 *
 * Fora do provider devolve os nomes do código em vez de rebentar: um ecrã
 * que se monte sem contexto tem de continuar a mostrar palavras.
 */
export function useRotulos(): EstadoDosRotulos {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return {
    nome: (lista, valor) => nomeDe(lista, valor, []),
    opcoes: (lista) => opcoesAtivas(lista, []),
    todas: (lista) => opcoesDaLista(lista, []),
    recarregar: () => {},
  };
}
