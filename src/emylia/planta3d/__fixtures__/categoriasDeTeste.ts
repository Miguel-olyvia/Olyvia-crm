// Receitas de TESTE (nunca vão para a app): a mesa e o sofá, tal como eram em categoriasGlb.ts até 27/11, quando saíram da lista por nenhum produto os usar.
// Servem só para os testes das ZONAS (zonasMateriais.test.ts): hoje nenhum genérico real tem partes de material `corpo` nas zonas «tampo redondo», «pés» e «estofo»,
// e a regra de zonas (zonasGlb.ts) continua a cobri-las, por isso testa-se com estas.
import type { CategoriaGlb, MaterialGlb, ParamsGenerico, ParteGlb } from "../categoriasGlb";

const sim = (p: ParamsGenerico, id: string): boolean => p.o[id] !== false;
const caixa = (nome: string, mat: MaterialGlb, colocar: ParteGlb["colocar"], ver?: ParteGlb["ver"]): ParteGlb => ({ nome, forma: "caixa", mat, colocar, ...(ver ? { ver } : {}) });

export const MESA_TESTE: CategoriaGlb = {
  id: "mesa_teste", rotulo: "Mesa (teste)", tipos: ["mesa"], opcoes: [{ id: "redonda", rotulo: "Tampo redondo", tipo: "sim", omissao: false }],
  partes: [
    caixa("tampo", "corpo", ({ w, d, h }) => ({ pos: [0, h - 0.02, 0], esc: [w, 0.04, d] }), (p) => p.o.redonda !== true),
    { nome: "tampo_redondo", forma: "cilindro", mat: "corpo", ver: (p) => p.o.redonda === true, colocar: ({ w, d, h }) => ({ pos: [0, h - 0.02, 0], esc: [w, 0.04, d] }) },
    caixa("aro", "corpo", ({ w, d, h }) => ({ pos: [0, h - 0.07, 0], esc: [w - 0.12, 0.06, d - 0.12] }), (p) => p.o.redonda !== true),
    caixa("chanfro", "interior", ({ w, d, h }) => ({ pos: [0, h - 0.042, 0], esc: [w - 0.01, 0.004, d - 0.01] }), (p) => p.o.redonda !== true),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => caixa(`perna_${i + 1}`, "corpo", ({ w, d, h, o }) => { const k = o.redonda === true ? 0.3 : 0.5; return { pos: [sx! * (w * k - 0.05), (h - 0.04) / 2, sz! * (d * k - 0.05)], esc: [0.05, h - 0.04, 0.05] }; })),
  ],
};

export const SOFA_TESTE: CategoriaGlb = {
  id: "sofa", rotulo: "Sofá (teste; o id «sofa» é o que a regra das almofadas em zonasGlb.ts reconhece)", tipos: ["sofa"], opcoes: [{ id: "bracos", rotulo: "Com braços", tipo: "sim", omissao: true }],
  partes: [
    { nome: "base", forma: "caixaR", mat: "corpo", colocar: ({ w, d }) => ({ pos: [0, 0.22, 0.05], esc: [w, 0.3, d - 0.1] }) },
    caixa("assento", "corpo", ({ w, d }) => ({ pos: [0, 0.4, 0.08], esc: [w - 0.4, 0.06, d - 0.3] })),
    caixa("encosto", "corpo", ({ w, d, h }) => ({ pos: [0, (0.2 + h) / 2, -d / 2 + 0.08], esc: [w, h - 0.2, 0.16] })),
    ...[0, 1, 2].map((i): ParteGlb => ({ nome: `almofada_assento_${i + 1}`, forma: "caixaR", mat: "corpo", colocar: ({ w, d }) => { const l = (w - 0.4) / 3; return { pos: [-(w - 0.4) / 2 + l * (i + 0.5), 0.47, 0.06], esc: [l - 0.01, 0.12, d - 0.32] }; } })),
    ...[0, 1, 2].map((i): ParteGlb => ({ nome: `almofada_costas_${i + 1}`, forma: "caixaR", mat: "corpo", colocar: ({ w, d, h }) => { const l = (w - 0.4) / 3; return { pos: [-(w - 0.4) / 2 + l * (i + 0.5), 0.53 + (h - 0.53) / 2, -d / 2 + 0.22], esc: [l - 0.01, h - 0.55, 0.14], rot: [-0.18, 0, 0] }; } })),
    { nome: "braco_esq", forma: "caixaR", mat: "corpo", ver: (p) => sim(p, "bracos"), colocar: ({ w, d }) => ({ pos: [-w / 2 + 0.1, 0.32, 0.03], esc: [0.2, 0.5, d - 0.06] }) },
    { nome: "braco_dir", forma: "caixaR", mat: "corpo", ver: (p) => sim(p, "bracos"), colocar: ({ w, d }) => ({ pos: [w / 2 - 0.1, 0.32, 0.03], esc: [0.2, 0.5, d - 0.06] }) },
  ],
};
