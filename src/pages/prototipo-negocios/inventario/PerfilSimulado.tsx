// O "Simular perfil · menu filtrado por permissão" do mockup, agora no rodapé do menu geral (só quando se está no inventário).
import { useId } from "react";
import { PERFIS, mudarPerfil, usePerfil, type PerfilId } from "./perfil";

export default function PerfilSimulado() {
  const perfil = usePerfil();
  const id = useId();
  return (
    <div className="sb-foot grid gap-1.5 text-sm text-muted-foreground" data-testid="perfil-simulado">
      <label htmlFor={id}>Simular perfil · menu filtrado por permissão <span className="ml-1 rounded-md bg-accent/10 px-1.5 text-[10.5px] font-bold text-accent">Novo</span></label>
      <select id={id} value={perfil} onChange={(e) => mudarPerfil(e.target.value as PerfilId)}
        className="h-11 rounded-lg border border-input bg-card px-3 text-[15px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
        {(Object.keys(PERFIS) as PerfilId[]).map((k) => <option key={k} value={k}>{PERFIS[k].t}</option>)}
      </select>
      <span className="text-xs">{PERFIS[perfil].nota}</span>
      <span className="src text-xs opacity-70" title="Fonte de dados">has_permission() · anew_role_permissions</span>
    </div>
  );
}
