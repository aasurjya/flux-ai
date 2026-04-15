"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";

interface AnswerQuestionsFormProps {
  projectId: string;
  questions: string[];
  action: (formData: FormData) => void | Promise<void>;
}

/**
 * Clarifying-questions form rendered when the AI pipeline paused
 * waiting for disambiguation. Every question is required — we'd rather
 * nag the user than let the pipeline guess.
 */
export function AnswerQuestionsForm({ projectId, questions, action }: AnswerQuestionsFormProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const allAnswered = questions.every((_, i) => (answers[i] ?? "").trim().length > 0);

  return (
    <Card className="border-primary/30 bg-card/80">
      <CardHeader>
        <CardTitle>Clarifying questions</CardTitle>
        <CardDescription>
          Answer each question before we continue — the pipeline paused because these
          choices materially change the BOM or topology.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-6">
          <input type="hidden" name="projectId" value={projectId} />
          {questions.map((question, i) => (
            <div key={i} className="space-y-2">
              <label htmlFor={`q-${i}`} className="text-sm font-medium text-foreground">
                {question}
              </label>
              <input type="hidden" name={`question-${i}`} value={question} />
              <Textarea
                id={`q-${i}`}
                name={`answer-${i}`}
                value={answers[i] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                required
                rows={2}
                placeholder="Your answer"
              />
            </div>
          ))}
          <SubmitButton disabled={!allAnswered}>Continue generation</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
