# Quarentena de código não utilizado

Esta pasta contém ficheiros retirados do runtime, mas não eliminados.

Data da movimentação: 19 de junho de 2026.

Foi executada uma segunda passagem para identificar cadeias órfãs: ficheiros que
pareciam usados, mas eram consumidos exclusivamente por outros ficheiros já
colocados nesta quarentena. Foram também incluídos barrels sem consumidores e
o CSS inicial do template Vite, sem qualquer import.

Critérios usados:

- nenhum import estático, dinâmico ou reexport encontrado;
- nenhum consumidor runtime encontrado a partir de `src/main.tsx`;
- nenhuma referência executável encontrada no projeto;
- impacto GitNexus `LOW`, com zero callers e zero processos afetados;
- inspeção manual do ficheiro e de possíveis homónimos;
- ficheiro sem alterações locais anteriores.

Os caminhos abaixo de `eliminar/` preservam a estrutura original. Para restaurar
um ficheiro, mova-o novamente para o caminho correspondente na raiz do projeto.

Não foram movidos:

- componentes base de `src/components/ui`;
- ficheiros de `src/_migration`;
- entry points, configurações, testes, migrations e declarações ambientais;
- ficheiros modificados ou novos na worktree antes desta análise;
- candidatos com utilização dinâmica ou incerteza.
