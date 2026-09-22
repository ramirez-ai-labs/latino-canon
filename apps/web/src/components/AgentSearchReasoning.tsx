"use client";

import { useState } from "react";
import type { CurationResponse } from "@latino-canon/core";

export function AgentSearchReasoning({ response }: { response: CurationResponse }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const extractedTerms = [];
  if (response.extractedIntent.theme) extractedTerms.push(`theme: ${response.extractedIntent.theme}`);
  if (response.extractedIntent.decade) extractedTerms.push(`decade: ${response.extractedIntent.decade}s`);
  if (response.extractedIntent.directorGender) extractedTerms.push(`director: ${response.extractedIntent.directorGender}`);
  if (response.extractedIntent.tone) extractedTerms.push(`tone: ${response.extractedIntent.tone}`);

  return (
    <div className="mb-6">
      {/* Collapsed header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full rounded-lg border border-border bg-surface-raised px-4 py-3 text-left transition-colors hover:bg-border"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-accent">🤖</span>
            <span className="font-semibold text-text">AI Search</span>
            {!isExpanded && extractedTerms.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {extractedTerms.map((term) => (
                  <span key={term} className="text-xs text-muted">
                    {term}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="text-muted transition-transform" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>
            ▼
          </span>
        </div>
      </button>

      {/* Expanded reasoning */}
      {isExpanded && (
        <div className="mt-2 rounded-lg border border-border bg-surface-raised p-4 space-y-3">
          <div className="space-y-2">
            {response.reasoning.map((line, i) => {
              const isStep = line.startsWith("[");
              const stepMatch = line.match(/\[(\d)\/4\]/);
              const stepNum = stepMatch ? stepMatch[1] : null;

              if (isStep && stepNum) {
                return (
                  <div key={i} className="flex gap-2">
                    <span className="text-accent font-semibold">[{stepNum}/4]</span>
                    <span className="text-sm text-text">{line.substring(line.indexOf("]") + 1).trim()}</span>
                  </div>
                );
              }

              return (
                <p key={i} className="text-xs text-muted ml-8">
                  {line}
                </p>
              );
            })}
          </div>

          {/* Extracted intent summary */}
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted mb-2">Extracted Intent:</p>
            <div className="flex flex-wrap gap-2">
              {extractedTerms.map((term) => (
                <span key={term} className="inline-block px-2 py-1 rounded bg-accent/10 border border-accent/30 text-xs text-accent">
                  {term}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
