import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { NodeCategory, CustomNodeType, FlowTemplate } from "./types";
import { DEFAULT_CATEGORIES, DEFAULT_NODE_TYPES, DEFAULT_TEMPLATES } from "./seed-data";

interface DynamicNodeContextValue {
  categories: NodeCategory[];
  nodeTypes: CustomNodeType[];
  templates: FlowTemplate[];
  addCategory: (cat: NodeCategory) => void;
  updateCategory: (id: string, patch: Partial<NodeCategory>) => void;
  deleteCategory: (id: string) => void;
  reorderCategories: (ids: string[]) => void;
  addNodeType: (nt: CustomNodeType) => void;
  updateNodeType: (id: string, nt: CustomNodeType) => void;
  deleteNodeType: (id: string) => void;
  duplicateNodeType: (id: string) => CustomNodeType;
  getNodeType: (id: string) => CustomNodeType | undefined;
  addTemplate: (t: FlowTemplate) => void;
  deleteTemplate: (id: string) => void;
  exportAll: () => string;
  importAll: (json: string) => {
    ok: boolean;
    imported: {
      categories: number;
      nodeTypes: number;
      templates: number;
    };
    reason?: string;
  };
}

const DynamicNodeContext = createContext<DynamicNodeContextValue | null>(null);

export function useDynamicNodes() {
  const ctx = useContext(DynamicNodeContext);
  if (!ctx) throw new Error("useDynamicNodes must be used within DynamicNodeProvider");
  return ctx;
}

export function DynamicNodeProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<NodeCategory[]>(DEFAULT_CATEGORIES);
  const [nodeTypes, setNodeTypes] = useState<CustomNodeType[]>(DEFAULT_NODE_TYPES);
  const [templates, setTemplates] = useState<FlowTemplate[]>(DEFAULT_TEMPLATES);

  const addCategory = useCallback((cat: NodeCategory) => setCategories(p => [...p, cat]), []);
  const updateCategory = useCallback((id: string, patch: Partial<NodeCategory>) =>
    setCategories(p => p.map(c => c.id === id ? { ...c, ...patch } : c)), []);
  const deleteCategory = useCallback((id: string) => setCategories(p => p.filter(c => c.id !== id)), []);
  const reorderCategories = useCallback((ids: string[]) =>
    setCategories(p => ids.map((id, i) => ({ ...p.find(c => c.id === id)!, order: i }))), []);

  const addNodeType = useCallback((nt: CustomNodeType) => setNodeTypes(p => [...p, nt]), []);
  const updateNodeType = useCallback((id: string, nt: CustomNodeType) =>
    setNodeTypes(p => p.map(n => n.id === id ? nt : n)), []);
  const deleteNodeType = useCallback((id: string) => setNodeTypes(p => p.filter(n => n.id !== id)), []);
  const duplicateNodeType = useCallback((id: string) => {
    const orig = nodeTypes.find(n => n.id === id);
    if (!orig) throw new Error("Not found");
    const dup: CustomNodeType = {
      ...orig,
      id: `nt_${Date.now()}`,
      name: `${orig.name} (cópia)`,
      isDefault: false,
      fields: orig.fields.map(f => ({ ...f, id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` })),
    };
    setNodeTypes(p => [...p, dup]);
    return dup;
  }, [nodeTypes]);

  const getNodeType = useCallback((id: string) => nodeTypes.find(n => n.id === id), [nodeTypes]);

  const addTemplate = useCallback((t: FlowTemplate) => setTemplates(p => [...p, t]), []);
  const deleteTemplate = useCallback((id: string) => setTemplates(p => p.filter(t => t.id !== id)), []);

  const exportAll = useCallback(() => {
    return JSON.stringify({ categories, nodeTypes, templates }, null, 2);
  }, [categories, nodeTypes, templates]);

  const importAll = useCallback((json: string) => {
    try {
      const data = JSON.parse(json);
      const importedCategories = Array.isArray(data.categories)
        ? data.categories
        : Array.isArray(data.nodeCategories)
          ? data.nodeCategories
          : [];
      const importedNodeTypes = Array.isArray(data.nodeTypes)
        ? data.nodeTypes
        : Array.isArray(data.customNodeTypes)
          ? data.customNodeTypes
          : Array.isArray(data.nodes)
            ? data.nodes
            : [];
      const importedTemplates = Array.isArray(data.templates)
        ? data.templates
        : Array.isArray(data.flowTemplates)
          ? data.flowTemplates
          : [];

      let categoriesAdded = 0;
      let nodeTypesAdded = 0;
      let templatesAdded = 0;

      if (importedCategories.length > 0) {
        setCategories(prev => {
          const existingIds = new Set(prev.map(item => item.id));
          const nextItems = importedCategories.filter((item: any) => item?.id && !existingIds.has(item.id));
          categoriesAdded = nextItems.length;
          return nextItems.length > 0 ? [...prev, ...nextItems] : prev;
        });
      }

      if (importedNodeTypes.length > 0) {
        setNodeTypes(prev => {
          const existingIds = new Set(prev.map(item => item.id));
          const nextItems = importedNodeTypes.filter((item: any) => item?.id && !existingIds.has(item.id));
          nodeTypesAdded = nextItems.length;
          return nextItems.length > 0 ? [...prev, ...nextItems] : prev;
        });
      }

      if (importedTemplates.length > 0) {
        setTemplates(prev => {
          const existingIds = new Set(prev.map(item => item.id));
          const nextItems = importedTemplates.filter((item: any) => item?.id && !existingIds.has(item.id));
          templatesAdded = nextItems.length;
          return nextItems.length > 0 ? [...prev, ...nextItems] : prev;
        });
      }

      const totalImported = categoriesAdded + nodeTypesAdded + templatesAdded;

      if (
        importedCategories.length === 0 &&
        importedNodeTypes.length === 0 &&
        importedTemplates.length === 0
      ) {
        return {
          ok: false,
          imported: { categories: 0, nodeTypes: 0, templates: 0 },
          reason: "Formato não suportado",
        };
      }

      return {
        ok: totalImported > 0,
        imported: {
          categories: categoriesAdded,
          nodeTypes: nodeTypesAdded,
          templates: templatesAdded,
        },
        reason: totalImported > 0 ? undefined : "Sem itens novos para importar",
      };
    } catch {
      return {
        ok: false,
        imported: { categories: 0, nodeTypes: 0, templates: 0 },
        reason: "JSON inválido",
      };
    }
  }, []);

  return (
    <DynamicNodeContext.Provider value={{
      categories, nodeTypes, templates,
      addCategory, updateCategory, deleteCategory, reorderCategories,
      addNodeType, updateNodeType, deleteNodeType, duplicateNodeType, getNodeType,
      addTemplate, deleteTemplate,
      exportAll, importAll,
    }}>
      {children}
    </DynamicNodeContext.Provider>
  );
}
