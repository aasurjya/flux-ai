"use client";

import { Download, Loader2, CheckCircle, AlertCircle, FileArchive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExportJob } from "@/types/project";

interface ExportJobCardProps {
  job: ExportJob;
}

export function ExportJobCard({ job }: ExportJobCardProps) {
  const statusConfig = {
    pending: { icon: Loader2, label: "Pending", variant: "secondary" as const, spin: false, color: "text-muted-foreground" },
    running: { icon: Loader2, label: "Running", variant: "warning" as const, spin: true, color: "text-amber-400" },
    completed: { icon: CheckCircle, label: "Completed", variant: "secondary" as const, spin: false, color: "text-emerald-400" },
    failed: { icon: AlertCircle, label: "Failed", variant: "critical" as const, spin: false, color: "text-rose-400" }
  };

  const config = statusConfig[job.status];
  const Icon = config.icon;

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileArchive className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">KiCad Export</CardTitle>
              <CardDescription className="text-xs">
                {new Date(job.createdAt).toLocaleString()}
              </CardDescription>
            </div>
          </div>
          <Badge variant={config.variant}>
            <Icon className={`mr-1 h-3 w-3 ${config.color} ${config.spin ? "animate-spin" : ""}`} />
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-background/50 p-3 font-mono text-xs text-muted-foreground">
          {job.logs.map((log, i) => (
            <p key={i} className="py-0.5">{`> ${log}`}</p>
          ))}
        </div>

        {job.status === "completed" && job.downloadUrl && (
          <Button variant="outline" className="w-full" asChild>
            <a href={job.downloadUrl} download>
              <Download className="mr-2 h-4 w-4" />
              Download KiCad Package
            </a>
          </Button>
        )}

        {job.status === "failed" && job.error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {job.error}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
