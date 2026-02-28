import { SettingsForm } from "@/components/settings/SettingsForm";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function SettingsPage() {
  return (
    <ScrollArea className="h-full">
      <SettingsForm />
    </ScrollArea>
  );
}
