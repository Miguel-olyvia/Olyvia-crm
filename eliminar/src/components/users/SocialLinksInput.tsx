import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SocialLinks {
  angellist: string;
  facebook: string;
  linkedin: string;
}

interface SocialLinksInputProps {
  socialLinks: SocialLinks;
  onChange: (links: SocialLinks) => void;
  disabled?: boolean;
}

export function SocialLinksInput({
  socialLinks,
  onChange,
  disabled = false,
}: SocialLinksInputProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="linkedin" className="text-sm">LinkedIn</Label>
        <Input
          id="linkedin"
          type="url"
          placeholder="https://linkedin.com/in/username"
          value={socialLinks.linkedin}
          onChange={(e) => onChange({ ...socialLinks, linkedin: e.target.value })}
          disabled={disabled}
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="facebook" className="text-sm">Facebook</Label>
        <Input
          id="facebook"
          type="url"
          placeholder="https://facebook.com/username"
          value={socialLinks.facebook}
          onChange={(e) => onChange({ ...socialLinks, facebook: e.target.value })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
