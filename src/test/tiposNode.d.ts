// 20/11 (lote 4, limpeza): os tipos do Node (node:fs, node:path, Array.prototype.at...) para os testes que leem ficheiros.
// Até hoje entravam no typecheck por acaso, pela referência no topo de um teste da cópia antiga do protótipo
// (pages/prototipo-negocios/inventario/InventarioPagina.test.tsx). A cópia saiu; a referência fica aqui, para o
// `tsc -p tsconfig.app.json` ver o mesmo que via antes.
/// <reference types="node" />
