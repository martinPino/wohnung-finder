import { useState, useEffect } from "react";
import type { T } from "@/lib/i18n";

const STORAGE_KEY = "immoscout:onboardingComplete";

interface OnboardingProps {
  t: T;
  onComplete: () => void;
}

interface Step {
  icon: string;
  titleKey: keyof T;
  descKey: keyof T;
  actionKey?: keyof T;
  actionUrl?: string;
  actionFn?: () => void;
}

export function useOnboarding() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setShow(true);
  }, []);

  const complete = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  };

  const reopen = () => setShow(true);

  return { show, complete, reopen };
}

export default function Onboarding({ t, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);

  // Open (or focus) the SAME debugging Chrome the automation connects to
  // (saved profile + remote-debugging port), with the ImmoScout login page.
  // Never opens a normal browser window.
  const openDebugChrome = async () => {
    try {
      await fetch("/api/run-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ launchChrome: true }),
      });
    } catch { /* ignore */ }
  };

  const steps: Step[] = [
    {
      icon: "🔵",
      titleKey: "onboardingStep1Title",
      descKey: "onboardingStep1Desc",
      actionKey: "onboardingStep1Action",
      actionFn: openDebugChrome,
    },
    {
      icon: "🔐",
      titleKey: "onboardingStep2Title",
      descKey: "onboardingStep2Desc",
      actionKey: "onboardingStep2Action",
      actionFn: openDebugChrome,
    },
    {
      icon: "🔍",
      titleKey: "onboardingStep3Title",
      descKey: "onboardingStep3Desc",
    },
    {
      icon: "✉️",
      titleKey: "onboardingStep4Title",
      descKey: "onboardingStep4Desc",
    },
    {
      icon: "🚀",
      titleKey: "onboardingStep5Title",
      descKey: "onboardingStep5Desc",
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  const handleAction = () => {
    if (current.actionFn) current.actionFn();
    else if (current.actionUrl) window.open(current.actionUrl, "_blank");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
        style={{ maxHeight: "90vh" }}
      >
        <div className="p-8">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                  i <= step ? "bg-blue-600" : "bg-gray-200"
                }`}
              />
            ))}
          </div>

          {/* Header */}
          {step === 0 && (
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">🏠</div>
              <h2 className="text-xl font-bold text-gray-900">{t.onboardingTitle}</h2>
              <p className="text-sm text-gray-500 mt-1">{t.onboardingSubtitle}</p>
            </div>
          )}

          {/* Step content */}
          <div className={step === 0 ? "" : "mt-2"}>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl">
                {current.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                    {t["onboardingStep" + (step + 1) + "Title" as keyof T] === undefined
                      ? `Step ${step + 1} of ${steps.length}`
                      : `${step + 1} / ${steps.length}`}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {t[current.titleKey] as string}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {t[current.descKey] as string}
                </p>

                {current.actionKey && (
                  <button
                    type="button"
                    onClick={handleAction}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    {t[current.actionKey] as string}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={() => step > 0 ? setStep(s => s - 1) : onComplete()}
              className="text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
            >
              {step === 0 ? t.onboardingSkip : t.onboardingBack}
            </button>

            <button
              type="button"
              onClick={() => isLast ? onComplete() : setStep(s => s + 1)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              {isLast ? t.onboardingFinish : t.onboardingNext}
              {!isLast && (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
