import { Cpu, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  title?: string;
  description?: string;
}

export function EmptyState({
  title = "No projects yet",
  description = "Start your first AI-assisted hardware design. Describe your circuit idea and let the system generate a structured project brief."
}: EmptyStateProps) {
  return (
    <Card className="border-dashed border-border/60 bg-card/40">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="relative mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Cpu className="h-8 w-8 text-primary" />
          </div>
          <div className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20">
            <Sparkles className="h-4 w-4 text-amber-400" />
          </div>
        </div>

        <h3 className="mb-2 text-lg font-medium text-foreground">{title}</h3>
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>

        <Button asChild>
          <a href="/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            Create your first project
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
