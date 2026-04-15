import Link from "next/link";
import { ArrowRight, Bot, Cable, Cpu, FileOutput } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const featureCards = [
  {
    title: "Prompt to circuit brief",
    description: "Turn a plain-English hardware goal into structured requirements, constraints, and architecture decisions.",
    icon: Bot
  },
  {
    title: "Component-aware design planning",
    description: "Start from known chips, preferred vendors, and board constraints instead of a blank schematic.",
    icon: Cpu
  },
  {
    title: "Validation-first workflow",
    description: "Expose missing pull-ups, uncertain power assumptions, and open design issues before export.",
    icon: Cable
  },
  {
    title: "KiCad export path",
    description: "Prepare generated outputs for a downstream KiCad workflow without trying to replace KiCad on day one.",
    icon: FileOutput
  }
];

export default function HomePage() {
  return (
    <div className="container py-16 sm:py-24">
      <section className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div className="space-y-8">
          <div className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary">
            AI copilot for prompt-to-schematic hardware design
          </div>
          <div className="space-y-6">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
              Describe the board you want, review the design logic, and move faster into KiCad.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground sm:text-xl">
              flux.ai helps you turn hardware requirements into circuit planning outputs, draft architecture, BOM guidance, and safe revision-based improvements.
            </p>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/projects/new">
                Start a new project
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/projects">View sample workspace</Link>
            </Button>
          </div>
        </div>
        <Card className="border-primary/20 bg-card/70">
          <CardHeader>
            <CardTitle>Current MVP focus</CardTitle>
            <CardDescription>Build the safest useful version first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-xl border border-border/70 bg-background/30 p-4">
              Prompt → requirements → architecture summary → BOM → validations → export prep
            </div>
            <div className="rounded-xl border border-border/70 bg-background/30 p-4">
              Every improvement creates a new revision so changes are reviewable before use.
            </div>
            <div className="rounded-xl border border-border/70 bg-background/30 p-4">
              KiCad stays the execution environment for detailed schematic and PCB work.
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-24 space-y-10">
        <SectionHeading
          eyebrow="Why this product"
          title="A practical AI workflow for hardware design"
          description="Instead of building a full browser ECAD first, the product focuses on the upstream decisions that are repetitive, error-prone, and perfect for AI-assisted planning."
        />
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {featureCards.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="border-border/60 bg-card/60">
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
