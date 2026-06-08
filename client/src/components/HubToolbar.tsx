import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface HubFilterSelect {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  options: { value: string; label: string }[];
  testId?: string;
}

export function HubToolbar({
  search, onSearch, searchPlaceholder = "Search…", selects = [], testId = "hub-toolbar",
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  selects?: HubFilterSelect[];
  testId?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 mb-6" data-testid={testId}>
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
          data-testid={`${testId}-search`}
        />
      </div>
      {selects.map((s, i) => (
        <Select key={i} value={s.value} onValueChange={s.onChange}>
          <SelectTrigger className="sm:w-48" data-testid={s.testId ?? `${testId}-select-${i}`}>
            <SelectValue placeholder={s.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {s.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      ))}
    </div>
  );
}
