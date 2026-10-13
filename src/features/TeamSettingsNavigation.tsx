import { BookOpen, ChevronRight, Factory, Monitor, UserRoundCog, UsersRound } from "lucide-react";
import { Button } from "../components/ui";

export type TeamSection = "users" | "lines" | "members" | "catalog" | "displays";

export const teamSections = [
  { id: "users", name: "Users", description: "Accounts and roles", icon: UsersRound },
  { id: "lines", name: "Production Lines", description: "Manage line names", icon: Factory },
  { id: "members", name: "Line Members", description: "Team assignments", icon: UserRoundCog },
  { id: "catalog", name: "Job List", description: "Reusable task names", icon: BookOpen },
  { id: "displays", name: "Live Displays", description: "Approve viewing devices", icon: Monitor },
] as const;

export function TeamSettingsNavigation({
  selected,
  onSelect,
}: {
  selected: TeamSection;
  onSelect: (section: TeamSection) => void;
}) {
  return <nav aria-label="Team settings sections" className="surface-card flex gap-1 overflow-x-auto p-2 lg:flex-col">
    {teamSections.map(item => <Button key={item.id} variant="ghost" aria-current={selected === item.id ? "page" : undefined}
      className={"!min-h-[58px] shrink-0 !justify-start !px-3 text-left lg:w-full " + (selected === item.id ? "!bg-[#e7f4f0] !text-[#0a6c5f]" : "!text-[#526976]")}
      onClick={() => onSelect(item.id)}>
      <item.icon size={19} aria-hidden="true"/><span className="flex min-w-0 flex-col items-start gap-1"><strong className="text-xs sm:text-sm">{item.name}</strong><small className="hidden text-xs font-normal opacity-80 lg:block">{item.description}</small></span>
      {selected === item.id && <ChevronRight className="ml-auto hidden lg:block" size={16}/>}
    </Button>)}
  </nav>;
}
