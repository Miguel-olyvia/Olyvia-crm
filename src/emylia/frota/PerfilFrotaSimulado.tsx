// O "A ver como" da Frota (o seletor de perfis do protótipo HTML), no rodapé do menu geral quando a Frota está aberta (como PerfilSimulado do Inventário).
import { useId } from "react";
import { PERFIS_FROTA, mudarPerfilFrota, usePerfilFrota, type PerfilFrota } from "./perfil";

export default function PerfilFrotaSimulado() {
  const perfil = usePerfilFrota();
  const id = useId();
  return (
    <div className="grid gap-1.5 text-sm text-muted-foreground" data-testid="perfil-frota">
      <label htmlFor={id}>Frota · a ver como</label>
      <select id={id} value={perfil} onChange={(e) => mudarPerfilFrota(e.target.value as PerfilFrota)}
        className="h-11 rounded-lg border border-input bg-card px-3 text-[15px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
        {(Object.keys(PERFIS_FROTA) as PerfilFrota[]).map((k) => <option key={k} value={k}>{PERFIS_FROTA[k]}</option>)}
      </select>
      <span className="text-xs">{perfil === "gestor" ? "Vê e faz tudo." : perfil === "tecnico" ? "Só a sua viatura: km, abastecimentos, ocorrências e stock." : "Despesas, extratos e renovações; sem atribuir nem mudar estados."}</span>
    </div>
  );
}
