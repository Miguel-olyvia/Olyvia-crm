// 5/11 (Rúben: «vai buscar ao catálogo produtos, cada produto com a sua cor»). Um desenho simples de cada tipo de produto, pintado com a cor
// dele: o catálogo de teste não tem fotografias; o verdadeiro terá (os produtos do fornecedor).
import type { Categoria } from "./catalogoFake";

const LINHA = "rgba(0,0,0,0.35)";

export function Ilustracao({ cat, hex = "#d9d9d9", tamanho = 56, className }: { cat: Categoria; hex?: string; tamanho?: number; className?: string }) {
  const corpo = (() => {
    switch (cat) {
      case "sanita": return <><rect x="16" y="8" width="24" height="14" rx="3" fill={hex} stroke={LINHA} /><path d="M12 24h32c0 12-7 20-16 20s-16-8-16-20z" fill={hex} stroke={LINHA} /><ellipse cx="28" cy="27" rx="11" ry="3.5" fill="rgba(0,0,0,0.12)" /></>;
      case "bide": return <><path d="M12 22h32c0 12-7 22-16 22s-16-10-16-22z" fill={hex} stroke={LINHA} /><ellipse cx="28" cy="25" rx="11" ry="3.5" fill="rgba(0,0,0,0.12)" /><rect x="25" y="14" width="6" height="7" rx="1.5" fill="#bfc3c7" stroke={LINHA} /></>;
      case "base": return <><rect x="6" y="16" width="44" height="26" rx="3" fill={hex} stroke={LINHA} /><circle cx="28" cy="29" r="3.5" fill="rgba(0,0,0,0.35)" /><path d="M10 20h36" stroke="rgba(255,255,255,0.35)" /></>;
      case "banheira": return <><path d="M6 22h44v8c0 8-6 12-14 12H20C12 42 6 38 6 30z" fill={hex} stroke={LINHA} /><rect x="40" y="12" width="4" height="10" fill="#bfc3c7" /></>;
      case "movel": return <><rect x="8" y="12" width="40" height="6" rx="1.5" fill="#f4f4f2" stroke={LINHA} /><ellipse cx="28" cy="15" rx="10" ry="2" fill="rgba(0,0,0,0.12)" /><rect x="10" y="18" width="36" height="22" rx="2" fill={hex} stroke={LINHA} /><path d="M10 29h36M24 23h8M24 34h8" stroke={LINHA} /></>;
      case "coluna": return <><rect x="18" y="4" width="20" height="46" rx="2" fill={hex} stroke={LINHA} /><path d="M18 20h20M18 35h20M26 11h4M26 27h4M26 42h4" stroke={LINHA} /></>;
      case "espelho": return <><rect x="10" y="8" width="36" height="40" rx="6" fill="#e9f3f7" stroke={hex} strokeWidth="3" /><rect x="14" y="12" width="28" height="32" rx="4" fill="none" stroke="rgba(255,230,150,0.9)" strokeWidth="2" /><path d="M18 18l8 -4" stroke="white" strokeWidth="2" /></>;
      case "toalheiro": return <><rect x="14" y="6" width="4" height="44" rx="2" fill={hex} /><rect x="38" y="6" width="4" height="44" rx="2" fill={hex} />{[12, 19, 26, 33, 40].map((y) => <rect key={y} x="16" y={y} width="24" height="3" rx="1.5" fill={hex} />)}</>;
      case "coluna_duche": return <><rect x="26" y="10" width="4" height="40" rx="2" fill={hex} /><rect x="16" y="8" width="16" height="3" rx="1.5" fill={hex} /><ellipse cx="16" cy="12" rx="9" ry="3" fill={hex} stroke={LINHA} />{[10, 14, 18, 22].map((x) => <line key={x} x1={x} y1="16" x2={x - 1} y2="22" stroke="#8fc6e0" />)}<rect x="22" y="34" width="12" height="5" rx="2" fill={hex} /></>;
      case "resguardo": return <><rect x="8" y="6" width="20" height="44" fill="#cfe9f3" fillOpacity="0.7" stroke={hex} strokeWidth="2" /><rect x="28" y="6" width="20" height="44" fill="#cfe9f3" fillOpacity="0.5" stroke={hex} strokeWidth="2" /><path d="M12 12l8 -4M32 14l6 -3" stroke="white" /></>;
      case "torneira": return <><rect x="22" y="34" width="12" height="14" rx="2" fill={hex} /><path d="M28 34V22c0-6 4-8 10-8h4v5h-4c-3 0-4 1-4 4v11" fill={hex} /><rect x="20" y="28" width="16" height="4" rx="2" fill={hex} /></>;
      case "revestimento":
      case "pavimento": return <>{[0, 1, 2].map((r) => [0, 1].map((c) => <rect key={`${r}${c}`} x={6 + c * 22} y={8 + r * 14} width="21" height="13" fill={hex} stroke={LINHA} />))}</>;
      // 6/11: a cozinha
      case "bancada": return <><rect x="4" y="16" width="48" height="6" rx="1.5" fill="#f4f4f2" stroke={LINHA} /><rect x="6" y="22" width="44" height="22" rx="2" fill={hex} stroke={LINHA} /><path d="M20.5 22v22M35.5 22v22M11 30h5M25 30h6M40 30h5" stroke={LINHA} /></>;
      case "lava": return <><rect x="6" y="14" width="44" height="28" rx="4" fill={hex} stroke={LINHA} /><rect x="10" y="18" width="22" height="20" rx="3" fill="rgba(0,0,0,0.15)" /><path d="M36 20h10M36 25h10M36 30h10" stroke={LINHA} /><circle cx="21" cy="28" r="2" fill="rgba(0,0,0,0.35)" /></>;
      case "placa": return <><rect x="6" y="10" width="44" height="36" rx="3" fill={hex} stroke={LINHA} />{[[18, 21], [38, 21], [18, 37], [38, 37]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="6" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />)}</>;
      case "forno": return <><rect x="8" y="8" width="40" height="40" rx="3" fill={hex} stroke={LINHA} /><rect x="13" y="18" width="30" height="24" rx="2" fill="rgba(0,0,0,0.35)" /><path d="M14 13h28" stroke="rgba(255,255,255,0.6)" strokeWidth="2" /></>;
      case "frigorifico": return <><rect x="14" y="4" width="28" height="48" rx="3" fill={hex} stroke={LINHA} /><path d="M14 20h28M36 9v7M36 25v10" stroke={LINHA} strokeWidth="1.5" /></>;
      case "maquina": return <><rect x="8" y="8" width="40" height="40" rx="3" fill={hex} stroke={LINHA} /><path d="M8 16h40" stroke={LINHA} /><circle cx="14" cy="12" r="1.5" fill="rgba(0,0,0,0.4)" /><rect x="22" y="11" width="16" height="2" rx="1" fill="rgba(0,0,0,0.3)" /></>;
      case "exaustor": return <><rect x="23" y="4" width="10" height="20" fill={hex} stroke={LINHA} /><path d="M10 40l13-16h10l13 16z" fill={hex} stroke={LINHA} /><rect x="8" y="40" width="40" height="5" rx="1.5" fill={hex} stroke={LINHA} /></>;
      case "armario": return <><rect x="14" y="4" width="28" height="48" rx="2" fill={hex} stroke={LINHA} /><path d="M14 22h28M14 38h28M28 4v18M26 12h0M30 12h0" stroke={LINHA} /><rect x="17" y="26" width="22" height="9" rx="1" fill="rgba(0,0,0,0.25)" /></>;
      default: return <rect x="10" y="10" width="36" height="36" rx="6" fill={hex} stroke={LINHA} />;
    }
  })();
  return (
    <svg viewBox="0 0 56 56" width={tamanho} height={tamanho} aria-hidden="true" className={className}>
      <rect width="56" height="56" rx="12" fill="hsl(var(--muted))" />
      {corpo}
    </svg>
  );
}
