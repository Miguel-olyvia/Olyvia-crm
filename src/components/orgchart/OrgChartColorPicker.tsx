import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/hooks/useTranslation';
import { OrgChartColors } from './OrgChartCard';

interface OrgChartColorSettings {
  organization: OrgChartColors;
  company: OrgChartColors;
  businessUnit: OrgChartColors;
  department: OrgChartColors;
}

interface OrgChartColorPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colors: OrgChartColorSettings;
  onSave: (colors: OrgChartColorSettings) => void;
}

const DEFAULT_COLORS: OrgChartColorSettings = {
  organization: { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8' },
  company: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  businessUnit: { bg: '#fed7aa', border: '#f97316', text: '#9a3412' },
  department: { bg: '#fef9c3', border: '#eab308', text: '#713f12' },
};

export function OrgChartColorPicker({
  open,
  onOpenChange,
  colors,
  onSave,
}: OrgChartColorPickerProps) {
  const { t } = useTranslation();
  const [localColors, setLocalColors] = React.useState<OrgChartColorSettings>(colors);

  React.useEffect(() => {
    setLocalColors(colors);
  }, [colors]);

  const handleColorChange = (
    type: keyof OrgChartColorSettings,
    field: keyof OrgChartColors,
    value: string
  ) => {
    setLocalColors(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: value,
      },
    }));
  };

  const handleSave = () => {
    onSave(localColors);
    onOpenChange(false);
  };

  const handleReset = () => {
    setLocalColors(DEFAULT_COLORS);
  };

  const ColorRow = ({ 
    label, 
    type 
  }: { 
    label: string; 
    type: keyof OrgChartColorSettings;
  }) => (
    <div className="space-y-2">
      <Label className="font-medium">{label}</Label>
      <div className="flex gap-4">
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">{t('orgChart.colors.background')}</Label>
          <div className="flex gap-2 items-center">
            <Input
              type="color"
              value={localColors[type].bg}
              onChange={(e) => handleColorChange(type, 'bg', e.target.value)}
              className="w-12 h-8 p-0 border-0 cursor-pointer"
            />
            <Input
              type="text"
              value={localColors[type].bg}
              onChange={(e) => handleColorChange(type, 'bg', e.target.value)}
              className="flex-1 h-8 text-xs"
            />
          </div>
        </div>
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">{t('orgChart.colors.border')}</Label>
          <div className="flex gap-2 items-center">
            <Input
              type="color"
              value={localColors[type].border}
              onChange={(e) => handleColorChange(type, 'border', e.target.value)}
              className="w-12 h-8 p-0 border-0 cursor-pointer"
            />
            <Input
              type="text"
              value={localColors[type].border}
              onChange={(e) => handleColorChange(type, 'border', e.target.value)}
              className="flex-1 h-8 text-xs"
            />
          </div>
        </div>
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">{t('orgChart.colors.text')}</Label>
          <div className="flex gap-2 items-center">
            <Input
              type="color"
              value={localColors[type].text}
              onChange={(e) => handleColorChange(type, 'text', e.target.value)}
              className="w-12 h-8 p-0 border-0 cursor-pointer"
            />
            <Input
              type="text"
              value={localColors[type].text}
              onChange={(e) => handleColorChange(type, 'text', e.target.value)}
              className="flex-1 h-8 text-xs"
            />
          </div>
        </div>
      </div>
      {/* Preview */}
      <div 
        className="p-3 rounded-md border-2 text-center text-sm font-medium"
        style={{
          backgroundColor: localColors[type].bg,
          borderColor: localColors[type].border,
          color: localColors[type].text,
        }}
      >
        {t('orgChart.colors.preview')}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('orgChart.colors.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <ColorRow label={t('orgChart.organization')} type="organization" />
          <ColorRow label={t('orgChart.company')} type="company" />
          <ColorRow label={t('orgChart.businessUnit')} type="businessUnit" />
          <ColorRow label={t('orgChart.department')} type="department" />
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            {t('orgChart.colors.reset')}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { DEFAULT_COLORS };
export type { OrgChartColorSettings };
