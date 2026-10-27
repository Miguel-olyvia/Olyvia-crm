// Diz se o ecrã é de computador (lg do Tailwind, 1024 px ou mais). Sem matchMedia (testes) conta como pequeno.
import { useEffect, useState } from "react";

const LG = "(min-width: 1024px)";
const existe = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function";

export function useDesktop(): boolean {
  const [desktop, setDesktop] = useState<boolean>(() => existe() && window.matchMedia(LG).matches);
  useEffect(() => {
    if (!existe()) return;
    const m = window.matchMedia(LG), atualizar = () => setDesktop(m.matches);
    atualizar();
    m.addEventListener("change", atualizar);
    return () => m.removeEventListener("change", atualizar);
  }, []);
  return desktop;
}
