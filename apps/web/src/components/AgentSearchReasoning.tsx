"use client";

import { useState } from "react";
import type { CurationResponse } from "@latino-canon/core";


export function AgentSearchReasoning({ response }: { response: CurationResponse }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const extractedTerms = [];
  if (response.extractedIntent.theme) extractedTerms.push({ label: "theme", value: response.extractedIntent.theme });
  if (response.extractedIntent.decade) extractedTerms.push({ label: "decade", value: `${response.extractedIntent.decade}s` });
  if (response.extractedIntent.directorGender) extractedTerms.push({ label: "director", value: response.extractedIntent.directorGender });
  if (response.extractedIntent.tone) extractedTerms.push({ label: "tone", value: response.extractedIntent.tone });

  return (
    <div className="mb-8">
      {/* Collapsed header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`group relative w-full rounded-2xl border px-6 py-4 text-left transition-colors ${
          isExpanded ? "border-accent/60 bg-surface-raised" : "border-border bg-surface hover:border-accent/60"
        }`}
      >
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-2xl">✨</span>
            <div>
              <div className="font-bold text-text text-lg">AI-Curated Results</div>
              {!isExpanded && extractedTerms.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {extractedTerms.map((term) => (
                    <span key={term.label} className="text-xs text-muted bg-surface/50 px-2 py-1 rounded-full">
                      {term.label}: <span className="text-accent font-semibold">{term.value}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <span
            className="text-muted transition-transform duration-300 text-lg"
            style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}
          >
            ▼
          </span>
        </div>
      </button>

      {/* Expanded reasoning with gradient-coded steps */}
      {isExpanded && (
        <div className="mt-4 space-y-4 rounded-2xl border border-border bg-surface p-6 animate-fade-in">
          {/* Reasoning steps with color-coded badges */}
          <div className="space-y-3">
            {response.reasoning.map((line, i) => {
              const isStep = line.startsWith("[");
              const stepMatch = line.match(/\[(\d)\/4\]/);
              const stepNum = stepMatch ? stepMatch[1] : null;

              if (isStep && stepNum) {
                return (
                  <div
                    key={i}
                    className="flex gap-4 items-start p-3 rounded-lg bg-surface/40 border border-border/50 hover:border-border transition-all"
                    style={{
                      animation: `slide-in-up 0.6s ease-out ${i * 100}ms both`,
                    }}
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent"
                    >
                      {stepNum}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-text leading-relaxed">
                        {line.substring(line.indexOf("]") + 1).trim()}
                      </p>
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>

          {/* Extracted intent summary with gradient badges */}
          {extractedTerms.length > 0 && (
            <div
              className="mt-6 pt-6 border-t border-border/50"
              style={{
                animation: "slide-in-up 0.6s ease-out 400ms both",
              }}
            >
              <p className="text-xs font-semibold text-muted mb-3 uppercase tracking-wider">Extracted Intent</p>
              <div className="flex flex-wrap gap-3">
                {extractedTerms.map((term) => {
                  return (
                    <div
                      key={term.label}
                      className="rounded-full border border-accent/50 px-4 py-2 text-xs font-semibold text-accent"
                    >
                      {term.label}: <span className="font-bold">{term.value}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
