// GERADO por script (fora do repositório) a partir dos extras dos GLB do fabricante (catalogue, model, brand, finish): NÃO editar à mão.
// Os 76 GLB «completos» (lava-loiças RODI/Frasa e torneiras Rubicer/Marti 1921/Moovlux) de public/modelos3d/completos: materiais embutidos,
// geometria optimizada (meshopt). Chave: família | modelo | acabamento do catálogo (familias.ts): torneira = id da família; lava-loiça = id da medida.
export type FamiliaFicheiro = "torneira" | "lava_loica";
export interface Ficheiro3D {
  readonly familia: FamiliaFicheiro; readonly modelo: string; readonly acab: string;
  /** o nome do ficheiro em public/modelos3d/completos */
  readonly ficheiro: string; readonly marca: string; readonly bytes: number; readonly triangulos: number;
}
export const FICHEIROS_3D: readonly Ficheiro3D[] = [
  { familia: "lava_loica", modelo: "ambar100", acab: "blanco", ficheiro: "lava_loica-ambar100-blanco.glb", marca: "RODI", bytes: 119720, triangulos: 35684 },
  { familia: "lava_loica", modelo: "ambar100", acab: "gunmetal", ficheiro: "lava_loica-ambar100-gunmetal.glb", marca: "RODI", bytes: 119732, triangulos: 35684 },
  { familia: "lava_loica", modelo: "ambar100", acab: "negro", ficheiro: "lava_loica-ambar100-negro.glb", marca: "RODI", bytes: 119760, triangulos: 35684 },
  { familia: "lava_loica", modelo: "ambar105", acab: "blanco", ficheiro: "lava_loica-ambar105-blanco.glb", marca: "RODI", bytes: 79804, triangulos: 18567 },
  { familia: "lava_loica", modelo: "ambar105", acab: "gunmetal", ficheiro: "lava_loica-ambar105-gunmetal.glb", marca: "RODI", bytes: 79816, triangulos: 18567 },
  { familia: "lava_loica", modelo: "ambar105", acab: "negro", ficheiro: "lava_loica-ambar105-negro.glb", marca: "RODI", bytes: 79844, triangulos: 18567 },
  { familia: "lava_loica", modelo: "ambar116", acab: "blanco", ficheiro: "lava_loica-ambar116-blanco.glb", marca: "RODI", bytes: 110348, triangulos: 35812 },
  { familia: "lava_loica", modelo: "ambar116", acab: "gunmetal", ficheiro: "lava_loica-ambar116-gunmetal.glb", marca: "RODI", bytes: 110360, triangulos: 35812 },
  { familia: "lava_loica", modelo: "ambar116", acab: "negro", ficheiro: "lava_loica-ambar116-negro.glb", marca: "RODI", bytes: 110388, triangulos: 35812 },
  { familia: "lava_loica", modelo: "ambar40", acab: "blanco", ficheiro: "lava_loica-ambar40-blanco.glb", marca: "RODI", bytes: 77688, triangulos: 18167 },
  { familia: "lava_loica", modelo: "ambar40", acab: "gunmetal", ficheiro: "lava_loica-ambar40-gunmetal.glb", marca: "RODI", bytes: 77700, triangulos: 18167 },
  { familia: "lava_loica", modelo: "ambar40n", acab: "blanco", ficheiro: "lava_loica-ambar40n-blanco.glb", marca: "RODI", bytes: 76132, triangulos: 17971 },
  { familia: "lava_loica", modelo: "ambar40", acab: "negro", ficheiro: "lava_loica-ambar40-negro.glb", marca: "RODI", bytes: 77728, triangulos: 18167 },
  { familia: "lava_loica", modelo: "ambar40n", acab: "gunmetal", ficheiro: "lava_loica-ambar40n-gunmetal.glb", marca: "RODI", bytes: 76144, triangulos: 17971 },
  { familia: "lava_loica", modelo: "ambar40n", acab: "negro", ficheiro: "lava_loica-ambar40n-negro.glb", marca: "RODI", bytes: 76172, triangulos: 17971 },
  { familia: "lava_loica", modelo: "ambar50", acab: "blanco", ficheiro: "lava_loica-ambar50-blanco.glb", marca: "RODI", bytes: 77264, triangulos: 18199 },
  { familia: "lava_loica", modelo: "ambar50", acab: "gunmetal", ficheiro: "lava_loica-ambar50-gunmetal.glb", marca: "RODI", bytes: 77276, triangulos: 18199 },
  { familia: "lava_loica", modelo: "ambar50n", acab: "blanco", ficheiro: "lava_loica-ambar50n-blanco.glb", marca: "RODI", bytes: 75552, triangulos: 17971 },
  { familia: "lava_loica", modelo: "ambar50", acab: "negro", ficheiro: "lava_loica-ambar50-negro.glb", marca: "RODI", bytes: 77304, triangulos: 18199 },
  { familia: "lava_loica", modelo: "ambar50n", acab: "gunmetal", ficheiro: "lava_loica-ambar50n-gunmetal.glb", marca: "RODI", bytes: 75564, triangulos: 17971 },
  { familia: "lava_loica", modelo: "ambar50n", acab: "negro", ficheiro: "lava_loica-ambar50n-negro.glb", marca: "RODI", bytes: 75592, triangulos: 17971 },
  { familia: "lava_loica", modelo: "ambar55", acab: "blanco", ficheiro: "lava_loica-ambar55-blanco.glb", marca: "RODI", bytes: 116976, triangulos: 35284 },
  { familia: "lava_loica", modelo: "ambar55", acab: "gunmetal", ficheiro: "lava_loica-ambar55-gunmetal.glb", marca: "RODI", bytes: 116988, triangulos: 35284 },
  { familia: "lava_loica", modelo: "ambar55", acab: "negro", ficheiro: "lava_loica-ambar55-negro.glb", marca: "RODI", bytes: 117016, triangulos: 35284 },
  { familia: "lava_loica", modelo: "ambar57", acab: "blanco", ficheiro: "lava_loica-ambar57-blanco.glb", marca: "RODI", bytes: 77380, triangulos: 18199 },
  { familia: "lava_loica", modelo: "ambar57", acab: "gunmetal", ficheiro: "lava_loica-ambar57-gunmetal.glb", marca: "RODI", bytes: 77392, triangulos: 18199 },
  { familia: "lava_loica", modelo: "ambar57", acab: "negro", ficheiro: "lava_loica-ambar57-negro.glb", marca: "RODI", bytes: 77420, triangulos: 18199 },
  { familia: "lava_loica", modelo: "ambar70", acab: "blanco", ficheiro: "lava_loica-ambar70-blanco.glb", marca: "RODI", bytes: 75960, triangulos: 18199 },
  { familia: "lava_loica", modelo: "ambar70", acab: "gunmetal", ficheiro: "lava_loica-ambar70-gunmetal.glb", marca: "RODI", bytes: 75972, triangulos: 18199 },
  { familia: "lava_loica", modelo: "ambar70", acab: "negro", ficheiro: "lava_loica-ambar70-negro.glb", marca: "RODI", bytes: 76000, triangulos: 18199 },
  { familia: "lava_loica", modelo: "ambar80", acab: "blanco", ficheiro: "lava_loica-ambar80-blanco.glb", marca: "RODI", bytes: 75412, triangulos: 18231 },
  { familia: "lava_loica", modelo: "ambar80", acab: "gunmetal", ficheiro: "lava_loica-ambar80-gunmetal.glb", marca: "RODI", bytes: 75424, triangulos: 18231 },
  { familia: "lava_loica", modelo: "ambar80", acab: "negro", ficheiro: "lava_loica-ambar80-negro.glb", marca: "RODI", bytes: 75452, triangulos: 18231 },
  { familia: "lava_loica", modelo: "ambar86", acab: "blanco", ficheiro: "lava_loica-ambar86-blanco.glb", marca: "RODI", bytes: 79820, triangulos: 18567 },
  { familia: "lava_loica", modelo: "ambar86", acab: "gunmetal", ficheiro: "lava_loica-ambar86-gunmetal.glb", marca: "RODI", bytes: 79832, triangulos: 18567 },
  { familia: "lava_loica", modelo: "ambar86", acab: "negro", ficheiro: "lava_loica-ambar86-negro.glb", marca: "RODI", bytes: 79860, triangulos: 18567 },
  { familia: "lava_loica", modelo: "bahia", acab: "inox", ficheiro: "lava_loica-bahia-inox.glb", marca: "RODI", bytes: 86080, triangulos: 22151 },
  { familia: "lava_loica", modelo: "belem", acab: "inox", ficheiro: "lava_loica-belem-inox.glb", marca: "RODI", bytes: 86028, triangulos: 22471 },
  { familia: "lava_loica", modelo: "brasilia", acab: "inox", ficheiro: "lava_loica-brasilia-inox.glb", marca: "RODI", bytes: 85832, triangulos: 21951 },
  { familia: "lava_loica", modelo: "duo60", acab: "inox", ficheiro: "lava_loica-duo60-inox.glb", marca: "RODI", bytes: 137560, triangulos: 43864 },
  { familia: "lava_loica", modelo: "duo80", acab: "inox", ficheiro: "lava_loica-duo80-inox.glb", marca: "RODI", bytes: 108060, triangulos: 43444 },
  { familia: "lava_loica", modelo: "keran100", acab: "inox", ficheiro: "lava_loica-keran100-inox.glb", marca: "RODI", bytes: 125648, triangulos: 39370 },
  { familia: "lava_loica", modelo: "keran116", acab: "inox", ficheiro: "lava_loica-keran116-inox.glb", marca: "RODI", bytes: 112844, triangulos: 39638 },
  { familia: "lava_loica", modelo: "keran80", acab: "inox", ficheiro: "lava_loica-keran80-inox.glb", marca: "RODI", bytes: 86900, triangulos: 22525 },
  { familia: "lava_loica", modelo: "keran86", acab: "inox", ficheiro: "lava_loica-keran86-inox.glb", marca: "RODI", bytes: 87064, triangulos: 22525 },
  { familia: "lava_loica", modelo: "laguna", acab: "inox", ficheiro: "lava_loica-laguna-inox.glb", marca: "RODI", bytes: 86088, triangulos: 22311 },
  { familia: "lava_loica", modelo: "lody40", acab: "cobre", ficheiro: "lava_loica-lody40-cobre.glb", marca: "Frasa", bytes: 69708, triangulos: 16235 },
  { familia: "lava_loica", modelo: "lody40", acab: "gunmetal", ficheiro: "lava_loica-lody40-gunmetal.glb", marca: "Frasa", bytes: 69716, triangulos: 16235 },
  { familia: "lava_loica", modelo: "lody40", acab: "oro", ficheiro: "lava_loica-lody40-oro.glb", marca: "Frasa", bytes: 69704, triangulos: 16235 },
  { familia: "lava_loica", modelo: "lody50", acab: "cobre", ficheiro: "lava_loica-lody50-cobre.glb", marca: "Frasa", bytes: 69148, triangulos: 16267 },
  { familia: "lava_loica", modelo: "lody50", acab: "gunmetal", ficheiro: "lava_loica-lody50-gunmetal.glb", marca: "Frasa", bytes: 69156, triangulos: 16267 },
  { familia: "lava_loica", modelo: "lody50", acab: "oro", ficheiro: "lava_loica-lody50-oro.glb", marca: "Frasa", bytes: 69144, triangulos: 16267 },
  { familia: "lava_loica", modelo: "lody70", acab: "cobre", ficheiro: "lava_loica-lody70-cobre.glb", marca: "Frasa", bytes: 68356, triangulos: 16331 },
  { familia: "lava_loica", modelo: "lody70", acab: "gunmetal", ficheiro: "lava_loica-lody70-gunmetal.glb", marca: "Frasa", bytes: 68364, triangulos: 16331 },
  { familia: "lava_loica", modelo: "lody70", acab: "oro", ficheiro: "lava_loica-lody70-oro.glb", marca: "Frasa", bytes: 68352, triangulos: 16331 },
  { familia: "lava_loica", modelo: "una55", acab: "inox", ficheiro: "lava_loica-una55-inox.glb", marca: "RODI", bytes: 130960, triangulos: 40428 },
  { familia: "lava_loica", modelo: "una75", acab: "inox", ficheiro: "lava_loica-una75-inox.glb", marca: "RODI", bytes: 85840, triangulos: 40708 },
  { familia: "lava_loica", modelo: "velar34", acab: "inox", ficheiro: "lava_loica-velar34-inox.glb", marca: "Frasa", bytes: 67516, triangulos: 16891 },
  { familia: "lava_loica", modelo: "velar40", acab: "inox", ficheiro: "lava_loica-velar40-inox.glb", marca: "Frasa", bytes: 67368, triangulos: 16891 },
  { familia: "lava_loica", modelo: "velar45", acab: "inox", ficheiro: "lava_loica-velar45-inox.glb", marca: "Frasa", bytes: 67196, triangulos: 16955 },
  { familia: "lava_loica", modelo: "velar50", acab: "inox", ficheiro: "lava_loica-velar50-inox.glb", marca: "Frasa", bytes: 67156, triangulos: 16987 },
  { familia: "lava_loica", modelo: "velar71", acab: "inox", ficheiro: "lava_loica-velar71-inox.glb", marca: "Frasa", bytes: 66704, triangulos: 17051 },
  { familia: "torneira", modelo: "cira", acab: "chrome", ficheiro: "torneira-cira-chrome.glb", marca: "Marti 1921", bytes: 248816, triangulos: 52363 },
  { familia: "torneira", modelo: "cira", acab: "gunmetal", ficheiro: "torneira-cira-gunmetal.glb", marca: "Marti 1921", bytes: 248828, triangulos: 52363 },
  { familia: "torneira", modelo: "cira", acab: "negro", ficheiro: "torneira-cira-negro.glb", marca: "Marti 1921", bytes: 248876, triangulos: 52363 },
  { familia: "torneira", modelo: "cira", acab: "oro", ficheiro: "torneira-cira-oro.glb", marca: "Marti 1921", bytes: 248816, triangulos: 52363 },
  { familia: "torneira", modelo: "granada", acab: "blanco", ficheiro: "torneira-granada-blanco.glb", marca: "Marti 1921", bytes: 348860, triangulos: 86362 },
  { familia: "torneira", modelo: "granada", acab: "negro", ficheiro: "torneira-granada-negro.glb", marca: "Marti 1921", bytes: 348868, triangulos: 86362 },
  { familia: "torneira", modelo: "smooth", acab: "blanco", ficheiro: "torneira-smooth-blanco.glb", marca: "Rubicer", bytes: 289788, triangulos: 75707 },
  { familia: "torneira", modelo: "smooth", acab: "chrome", ficheiro: "torneira-smooth-chrome.glb", marca: "Rubicer", bytes: 289748, triangulos: 75707 },
  { familia: "torneira", modelo: "smooth", acab: "cobre", ficheiro: "torneira-smooth-cobre.glb", marca: "Rubicer", bytes: 289744, triangulos: 75707 },
  { familia: "torneira", modelo: "smooth", acab: "gunmetal", ficheiro: "torneira-smooth-gunmetal.glb", marca: "Rubicer", bytes: 289760, triangulos: 75707 },
  { familia: "torneira", modelo: "smooth", acab: "negro", ficheiro: "torneira-smooth-negro.glb", marca: "Rubicer", bytes: 289804, triangulos: 75707 },
  { familia: "torneira", modelo: "smooth", acab: "nickel", ficheiro: "torneira-smooth-nickel.glb", marca: "Rubicer", bytes: 289748, triangulos: 75707 },
  { familia: "torneira", modelo: "smooth", acab: "oro", ficheiro: "torneira-smooth-oro.glb", marca: "Rubicer", bytes: 289744, triangulos: 75707 },
  { familia: "torneira", modelo: "stick", acab: "negro", ficheiro: "torneira-stick-negro.glb", marca: "Moovlux", bytes: 250032, triangulos: 64339 },
];

export const chaveFicheiro = (familia: string, modelo: string, acab?: string): string => `${familia}|${modelo}|${acab ?? ""}`;
const PORCHAVE: ReadonlyMap<string, Ficheiro3D> = new Map(FICHEIROS_3D.map((x) => [chaveFicheiro(x.familia, x.modelo, x.acab), x]));
/** Há GLB completo do fabricante para esta variante? */
export const temFicheiro = (familia: string, modelo: string, acab?: string): boolean => !!acab && PORCHAVE.has(chaveFicheiro(familia, modelo, acab));
/** O URL do GLB completo (servido pelo Vite a partir de public/), ou `undefined` se a variante não tem. */
export const urlDoFicheiro = (familia: string, modelo: string, acab?: string): string | undefined => {
  const x = acab ? PORCHAVE.get(chaveFicheiro(familia, modelo, acab)) : undefined;
  return x ? `/modelos3d/completos/${x.ficheiro}` : undefined;
};
