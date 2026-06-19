import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/useTranslation';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Building2, ShoppingBag, Cpu, Heart, GraduationCap, UtensilsCrossed, 
  Truck, Factory, Briefcase, Loader2, Check, ChevronRight, ChevronLeft,
  LayoutTemplate
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TemplateNode {
  name: string;
  type: string;
  children?: TemplateNode[];
}

interface OrgTemplate {
  id: string;
  icon: React.ReactNode;
  labelKey: string;
  descKey: string;
  color: string;
  structure: TemplateNode;
}

const TEMPLATES: OrgTemplate[] = [
  {
    id: 'tech',
    icon: <Cpu className="h-6 w-6" />,
    labelKey: 'orgChartTemplates.tech',
    descKey: 'orgChartTemplates.techDesc',
    color: 'hsl(250, 80%, 60%)',
    structure: {
      name: '', type: 'holding',
      children: [
        { name: 'Engineering', type: 'departamento', children: [
          { name: 'Frontend', type: 'equipa' },
          { name: 'Backend', type: 'equipa' },
          { name: 'DevOps', type: 'equipa' },
          { name: 'QA', type: 'equipa' },
        ]},
        { name: 'Product', type: 'departamento', children: [
          { name: 'Product Management', type: 'equipa' },
          { name: 'UX/UI Design', type: 'equipa' },
        ]},
        { name: 'Sales & Marketing', type: 'departamento', children: [
          { name: 'Sales', type: 'equipa' },
          { name: 'Marketing', type: 'equipa' },
          { name: 'Customer Success', type: 'equipa' },
        ]},
        { name: 'Operations', type: 'departamento', children: [
          { name: 'HR', type: 'equipa' },
          { name: 'Finance', type: 'equipa' },
          { name: 'Legal', type: 'equipa' },
        ]},
      ],
    },
  },
  {
    id: 'retail',
    icon: <ShoppingBag className="h-6 w-6" />,
    labelKey: 'orgChartTemplates.retail',
    descKey: 'orgChartTemplates.retailDesc',
    color: 'hsl(30, 85%, 55%)',
    structure: {
      name: '', type: 'holding',
      children: [
        { name: 'Commercial', type: 'departamento', children: [
          { name: 'Sales Floor', type: 'equipa' },
          { name: 'E-commerce', type: 'equipa' },
          { name: 'Visual Merchandising', type: 'equipa' },
        ]},
        { name: 'Supply Chain', type: 'departamento', children: [
          { name: 'Procurement', type: 'equipa' },
          { name: 'Warehouse', type: 'equipa' },
          { name: 'Logistics', type: 'equipa' },
        ]},
        { name: 'Marketing', type: 'departamento', children: [
          { name: 'Digital Marketing', type: 'equipa' },
          { name: 'Brand & Communications', type: 'equipa' },
        ]},
        { name: 'Back Office', type: 'departamento', children: [
          { name: 'Finance', type: 'equipa' },
          { name: 'HR', type: 'equipa' },
          { name: 'IT', type: 'equipa' },
        ]},
      ],
    },
  },
  {
    id: 'healthcare',
    icon: <Heart className="h-6 w-6" />,
    labelKey: 'orgChartTemplates.healthcare',
    descKey: 'orgChartTemplates.healthcareDesc',
    color: 'hsl(0, 75%, 55%)',
    structure: {
      name: '', type: 'holding',
      children: [
        { name: 'Clinical', type: 'departamento', children: [
          { name: 'Medical Staff', type: 'equipa' },
          { name: 'Nursing', type: 'equipa' },
          { name: 'Pharmacy', type: 'equipa' },
          { name: 'Laboratory', type: 'equipa' },
        ]},
        { name: 'Patient Services', type: 'departamento', children: [
          { name: 'Reception', type: 'equipa' },
          { name: 'Scheduling', type: 'equipa' },
          { name: 'Billing', type: 'equipa' },
        ]},
        { name: 'Administration', type: 'departamento', children: [
          { name: 'HR', type: 'equipa' },
          { name: 'Finance', type: 'equipa' },
          { name: 'Compliance', type: 'equipa' },
        ]},
      ],
    },
  },
  {
    id: 'construction',
    icon: <Factory className="h-6 w-6" />,
    labelKey: 'orgChartTemplates.construction',
    descKey: 'orgChartTemplates.constructionDesc',
    color: 'hsl(45, 80%, 50%)',
    structure: {
      name: '', type: 'holding',
      children: [
        { name: 'Projects', type: 'departamento', children: [
          { name: 'Project Management', type: 'equipa' },
          { name: 'Site Engineering', type: 'equipa' },
          { name: 'Safety & Quality', type: 'equipa' },
        ]},
        { name: 'Commercial', type: 'departamento', children: [
          { name: 'Bidding & Proposals', type: 'equipa' },
          { name: 'Client Relations', type: 'equipa' },
        ]},
        { name: 'Operations', type: 'departamento', children: [
          { name: 'Equipment & Fleet', type: 'equipa' },
          { name: 'Procurement', type: 'equipa' },
          { name: 'Warehouse', type: 'equipa' },
        ]},
        { name: 'Administration', type: 'departamento', children: [
          { name: 'Finance', type: 'equipa' },
          { name: 'HR', type: 'equipa' },
          { name: 'Legal', type: 'equipa' },
        ]},
      ],
    },
  },
  {
    id: 'hospitality',
    icon: <UtensilsCrossed className="h-6 w-6" />,
    labelKey: 'orgChartTemplates.hospitality',
    descKey: 'orgChartTemplates.hospitalityDesc',
    color: 'hsl(170, 65%, 45%)',
    structure: {
      name: '', type: 'holding',
      children: [
        { name: 'Front of House', type: 'departamento', children: [
          { name: 'Reception', type: 'equipa' },
          { name: 'Concierge', type: 'equipa' },
          { name: 'Events', type: 'equipa' },
        ]},
        { name: 'Food & Beverage', type: 'departamento', children: [
          { name: 'Kitchen', type: 'equipa' },
          { name: 'Restaurant Service', type: 'equipa' },
          { name: 'Bar', type: 'equipa' },
        ]},
        { name: 'Housekeeping', type: 'departamento', children: [
          { name: 'Rooms', type: 'equipa' },
          { name: 'Laundry', type: 'equipa' },
          { name: 'Maintenance', type: 'equipa' },
        ]},
        { name: 'Administration', type: 'departamento', children: [
          { name: 'Revenue Management', type: 'equipa' },
          { name: 'Marketing', type: 'equipa' },
          { name: 'HR', type: 'equipa' },
        ]},
      ],
    },
  },
  {
    id: 'logistics',
    icon: <Truck className="h-6 w-6" />,
    labelKey: 'orgChartTemplates.logistics',
    descKey: 'orgChartTemplates.logisticsDesc',
    color: 'hsl(210, 70%, 50%)',
    structure: {
      name: '', type: 'holding',
      children: [
        { name: 'Operations', type: 'departamento', children: [
          { name: 'Fleet Management', type: 'equipa' },
          { name: 'Route Planning', type: 'equipa' },
          { name: 'Dispatch', type: 'equipa' },
        ]},
        { name: 'Warehouse', type: 'departamento', children: [
          { name: 'Receiving', type: 'equipa' },
          { name: 'Storage & Picking', type: 'equipa' },
          { name: 'Shipping', type: 'equipa' },
        ]},
        { name: 'Commercial', type: 'departamento', children: [
          { name: 'Sales', type: 'equipa' },
          { name: 'Customer Service', type: 'equipa' },
        ]},
        { name: 'Support', type: 'departamento', children: [
          { name: 'IT', type: 'equipa' },
          { name: 'Finance', type: 'equipa' },
          { name: 'HR', type: 'equipa' },
        ]},
      ],
    },
  },
  {
    id: 'education',
    icon: <GraduationCap className="h-6 w-6" />,
    labelKey: 'orgChartTemplates.education',
    descKey: 'orgChartTemplates.educationDesc',
    color: 'hsl(280, 65%, 55%)',
    structure: {
      name: '', type: 'holding',
      children: [
        { name: 'Academic', type: 'departamento', children: [
          { name: 'Faculty', type: 'equipa' },
          { name: 'Research', type: 'equipa' },
          { name: 'Library', type: 'equipa' },
        ]},
        { name: 'Student Services', type: 'departamento', children: [
          { name: 'Admissions', type: 'equipa' },
          { name: 'Student Support', type: 'equipa' },
          { name: 'Career Services', type: 'equipa' },
        ]},
        { name: 'Administration', type: 'departamento', children: [
          { name: 'Finance', type: 'equipa' },
          { name: 'HR', type: 'equipa' },
          { name: 'IT', type: 'equipa' },
          { name: 'Facilities', type: 'equipa' },
        ]},
      ],
    },
  },
  {
    id: 'corporate',
    icon: <Building2 className="h-6 w-6" />,
    labelKey: 'orgChartTemplates.corporate',
    descKey: 'orgChartTemplates.corporateDesc',
    color: 'hsl(220, 50%, 45%)',
    structure: {
      name: '', type: 'holding',
      children: [
        { name: 'Executive Office', type: 'departamento', children: [
          { name: 'Strategy', type: 'equipa' },
          { name: 'Communications', type: 'equipa' },
        ]},
        { name: 'Finance & Legal', type: 'departamento', children: [
          { name: 'Accounting', type: 'equipa' },
          { name: 'Treasury', type: 'equipa' },
          { name: 'Legal & Compliance', type: 'equipa' },
        ]},
        { name: 'Human Resources', type: 'departamento', children: [
          { name: 'Talent Acquisition', type: 'equipa' },
          { name: 'Training & Development', type: 'equipa' },
          { name: 'Payroll & Benefits', type: 'equipa' },
        ]},
        { name: 'IT & Digital', type: 'departamento', children: [
          { name: 'Infrastructure', type: 'equipa' },
          { name: 'Applications', type: 'equipa' },
          { name: 'Security', type: 'equipa' },
        ]},
        { name: 'Sales & Marketing', type: 'departamento', children: [
          { name: 'Sales', type: 'equipa' },
          { name: 'Marketing', type: 'equipa' },
          { name: 'Business Development', type: 'equipa' },
        ]},
      ],
    },
  },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootOrgId: string;
  rootOrgName: string;
  onSuccess: () => void;
}

export function OrgChartTemplatePicker({ open, onOpenChange, rootOrgId, rootOrgName, onSuccess }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<OrgTemplate | null>(null);
  const [applying, setApplying] = useState(false);
  const [step, setStep] = useState<'pick' | 'preview'>('pick');

  const handleClose = () => {
    setSelectedTemplate(null);
    setStep('pick');
    onOpenChange(false);
  };

  const handleSelectTemplate = (tpl: OrgTemplate) => {
    setSelectedTemplate(tpl);
    setStep('preview');
  };

  const applyTemplate = async () => {
    if (!selectedTemplate) return;
    setApplying(true);

    try {
      const createNode = async (node: TemplateNode, parentId: string | null): Promise<void> => {
        const isRoot = parentId === null;
        const orgName = isRoot ? rootOrgName : node.name;

        let orgId: string;
        if (isRoot) {
          orgId = rootOrgId;
        } else {
          const { data, error } = await (supabase as any)
            .from('anew_organizations')
            .insert({ name: orgName, type: node.type, status: 'active' })
            .select('id')
            .single();
          if (error) throw error;
          orgId = data.id;

          if (parentId) {
            const { error: hErr } = await (supabase as any)
              .from('anew_hierarchy')
              .insert({ parent_org_id: parentId, child_org_id: orgId });
            if (hErr) throw hErr;
          }
        }

        if (node.children) {
          for (const child of node.children) {
            await createNode(child, orgId);
          }
        }
      };

      await createNode(selectedTemplate.structure, null);

      toast({ title: t('common.success'), description: t('orgChartTemplates.applied') });
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error applying template:', error);
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  };

  const renderPreviewTree = (node: TemplateNode, depth = 0, isRoot = true): React.ReactNode => {
    const name = isRoot ? rootOrgName : node.name;
    const typeColors: Record<string, string> = {
      holding: 'bg-purple-100 text-purple-700 border-purple-300',
      departamento: 'bg-emerald-100 text-emerald-700 border-emerald-300',
      equipa: 'bg-amber-100 text-amber-700 border-amber-300',
    };
    const colorClass = typeColors[node.type] || typeColors.holding;
    const typeLabels: Record<string, string> = {
      holding: t('orgChartTemplates.typeHolding'),
      departamento: t('orgChartTemplates.typeDepartment'),
      equipa: t('orgChartTemplates.typeTeam'),
    };

    return (
      <div key={name + depth} className="flex flex-col">
        <div className="flex items-center gap-2 py-1">
          {depth > 0 && (
            <div className="flex items-center" style={{ width: depth * 24 }}>
              {Array.from({ length: depth }).map((_, i) => (
                <div key={i} className="w-6 flex justify-center">
                  {i === depth - 1 ? (
                    <div className="w-4 h-px bg-border" />
                  ) : (
                    <div className="w-px h-full bg-border/30" />
                  )}
                </div>
              ))}
            </div>
          )}
          <Badge variant="outline" className={`text-xs font-normal ${colorClass}`}>
            {typeLabels[node.type] || node.type}
          </Badge>
          <span className="text-sm font-medium">{name}</span>
        </div>
        {node.children?.map(child => renderPreviewTree(child, depth + 1, false))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={step === 'pick' ? 'max-w-3xl' : 'max-w-lg'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary" />
            {step === 'pick' ? t('orgChartTemplates.title') : t('orgChartTemplates.preview')}
          </DialogTitle>
          <DialogDescription>
            {step === 'pick' ? t('orgChartTemplates.subtitle') : t('orgChartTemplates.previewDesc')}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === 'pick' ? (
            <motion.div
              key="pick"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto py-2"
            >
              {TEMPLATES.map(tpl => (
                <Card
                  key={tpl.id}
                  className="cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] border-2 hover:border-primary/40"
                  onClick={() => handleSelectTemplate(tpl)}
                >
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
                      style={{ backgroundColor: tpl.color }}
                    >
                      {tpl.icon}
                    </div>
                    <span className="font-semibold text-sm">{t(tpl.labelKey)}</span>
                    <span className="text-xs text-muted-foreground leading-tight">{t(tpl.descKey)}</span>
                  </CardContent>
                </Card>
              ))}
            </motion.div>
          ) : selectedTemplate ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: selectedTemplate.color }}
                >
                  {selectedTemplate.icon}
                </div>
                <div>
                  <p className="font-semibold text-sm">{t(selectedTemplate.labelKey)}</p>
                  <p className="text-xs text-muted-foreground">{t(selectedTemplate.descKey)}</p>
                </div>
              </div>

              <div className="border rounded-lg p-4 max-h-[45vh] overflow-y-auto bg-background">
                {renderPreviewTree(selectedTemplate.structure)}
              </div>

              <p className="text-xs text-muted-foreground italic">
                {t('orgChartTemplates.editAfterApply')}
              </p>

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setStep('pick')} disabled={applying}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  {t('common.back')}
                </Button>
                <Button onClick={applyTemplate} disabled={applying}>
                  {applying ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  {t('orgChartTemplates.apply')}
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
