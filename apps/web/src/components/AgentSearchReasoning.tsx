"use client";

import { useState } from "react";
import type { CurationResponse } from "@latino-canon/core";

const STEP_COLORS = {
  "1": "from-[#667eea] to-[#764ba2]",
  "2": "from-[#f093fb] to-[#f5576c]",
  "3": "from-[#4facfe] to-[#00f2fe]",
  "4": "from-[#ffd89b] to-[#f093fb]",
};

export function AgentSearchReasoning({ response }: { response: CurationResponse }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const extractedTerms = [];
  if (response.extractedIntent.theme) extractedTerms.push({ label: "theme", value: response.extractedIntent.theme });
  if (response.extractedIntent.decade) extractedTerms.push({ label: "decade", value: `${response.extractedIntent.decade}s` });
  if (response.extractedIntent.directorGender) extractedTerms.push({ label: "director", value: response.extractedIntent.directorGender });
  if (response.extractedIntent.tone) extractedTerms.push({ label: "tone", value: response.extractedIntent.tone });

  return (
    <div className="mb-8">
      {/* Collapsed header with glassmorphism & gradient border animation */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full glass rounded-2xl px-6 py-4 text-left transition-all duration-300 hover-glow group relative overflow-hidden"
        style={{
          background: isExpanded
            ? "linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(240, 147, 251, 0.15) 100%)"
            : "rgba(26, 18, 37, 0.4)",
          border: "1px solid rgba(102, 126, 234, 0.3)",
        }}
      >
        {/* Animated gradient border effect */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl"
          style={{
            background: "linear-gradient(90deg, #667eea, #f093fb, #4facfe, #667eea)",
            backgroundSize: "200% 200%",
            animation: "gradient-flow 3s ease infinite",
            padding: "1px",
            borderRadius: "16px",
          }}
        />

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
        <div
          className="mt-4 glass-heavy rounded-2xl p-6 space-y-4 animate-fade-in"
          style={{
            background: "linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(240, 147, 251, 0.08) 100%)",
            border: "1px solid rgba(102, 126, 234, 0.2)",
          }}
        >
          {/* Reasoning steps with color-coded badges */}
          <div className="space-y-3">
            {response.reasoning.map((line, i) => {
              const isStep = line.startsWith("[");
              const stepMatch = line.match(/\[(\d)\/4\]/);
              const stepNum = stepMatch ? stepMatch[1] : null;

              if (isStep && stepNum) {
                const colorGradient = STEP_COLORS[stepNum as keyof typeof STEP_COLORS] || STEP_COLORS["1"];
                return (
                  <div
                    key={i}
                    className="flex gap-4 items-start p-3 rounded-lg bg-surface/40 border border-border/50 hover:border-border transition-all"
                    style={{
                      animation: `slide-in-up 0.6s ease-out ${i * 100}ms both`,
                    }}
                  >
                    <div
                      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm bg-gradient-to-r ${colorGradient}`}
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
                {extractedTerms.map((term, idx) => {
                  const gradients = [
                    "from-[#667eea] to-[#764ba2]",
                    "from-[#f093fb] to-[#f5576c]",
                    "from-[#4facfe] to-[#00f2fe]",
                    "from-[#ffd89b] to-[#f093fb]",
                  ];
                  const gradient = gradients[idx % gradients.length];

                  return (
                    <div
                      key={term.label}
                      className={`px-4 py-2 rounded-full text-xs font-semibold text-white bg-gradient-to-r ${gradient} shadow-lg hover-lift`}
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
