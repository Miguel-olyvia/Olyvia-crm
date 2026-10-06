import { useCallback, useEffect, useRef, useState } from "react";

export const OTP_COOLDOWN_SECONDS = 60;

export interface CooldownState {
  /** Segundos inteiros que faltam (0 quando inactivo). */
  restante: number;
  activo: boolean;
  /** Começa a contagem e devolve true; se já estiver activa não faz nada e devolve false. */
  iniciar: () => boolean;
}

/**
 * Pausa só em memória: impede cliques repetidos enquanto o ecrã está aberto.
 * Não é guardada entre recarregamentos de propósito.
 */
export function useCooldown(seconds: number): CooldownState {
  const [restante, setRestante] = useState<number>(() => 0);
  // Fim da contagem (ms). Só é escrito em handlers e efeitos, nunca durante o render.
  const endRef = useRef<number | null>(null);

  const activo = restante > 0;

  useEffect(() => {
    if (!activo) return undefined;
    const id = setInterval(() => {
      const end = endRef.current;
      const left = end === null ? 0 : Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setRestante(left);
      if (left === 0) {
        endRef.current = null;
        clearInterval(id);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [activo]);

  const iniciar = useCallback((): boolean => {
    // Ref (e não estado) para que dois cliques no mesmo instante contem como um.
    if (endRef.current !== null && endRef.current > Date.now()) return false;
    endRef.current = Date.now() + seconds * 1000;
    setRestante(seconds);
    return true;
  }, [seconds]);

  return { restante, activo, iniciar };
}

/** "Reenviar código" -> "Reenviar código (45s)" enquanto a contagem está activa. */
export function cooldownLabel(label: string, restante: number): string {
  return restante > 0 ? `${label} (${restante}s)` : label;
}
