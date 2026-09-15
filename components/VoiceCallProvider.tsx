"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useTwilioVoice } from "@/hooks/useTwilioVoice";

type VoiceContextValue = ReturnType<typeof useTwilioVoice>;

const VoiceCallContext = createContext<VoiceContextValue | null>(null);

export function VoiceCallProvider({ children }: { children: ReactNode }) {
  const voice = useTwilioVoice();
  return (
    <VoiceCallContext.Provider value={voice}>{children}</VoiceCallContext.Provider>
  );
}

export function useVoiceCall() {
  const ctx = useContext(VoiceCallContext);
  if (!ctx) {
    throw new Error("useVoiceCall must be used within VoiceCallProvider");
  }
  return ctx;
}
