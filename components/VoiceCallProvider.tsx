"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import LiveCallBar from "@/components/LiveCallBar";
import { useTwilioVoice } from "@/hooks/useTwilioVoice";

type VoiceContextValue = ReturnType<typeof useTwilioVoice>;

const VoiceCallContext = createContext<VoiceContextValue | null>(null);

export function VoiceCallProvider({ children }: { children: ReactNode }) {
  const voice = useTwilioVoice();

  useEffect(() => {
    voice.initialize();
  }, [voice.initialize]);

  return (
    <VoiceCallContext.Provider value={voice}>
      {children}
      {voice.isInCall && (
        <div
          className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-3 pb-[calc(3.75rem+env(safe-area-inset-bottom))] lg:bottom-0 lg:pb-4"
          style={{ bottom: 0 }}
        >
          <div className="pointer-events-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-brand/20 bg-brand-muted/95 shadow-lg backdrop-blur-sm">
            <LiveCallBar
              callState={voice.callState}
              callDirection={voice.callDirection}
              activeNumber={voice.activeNumber}
              isMuted={voice.isMuted}
              error={voice.error}
              fromNumber={voice.fromNumber}
              onHangUp={voice.hangUp}
              onToggleMute={voice.toggleMute}
              onAcceptIncoming={voice.acceptIncoming}
              onRejectIncoming={voice.rejectIncoming}
              className="border-0"
            />
          </div>
        </div>
      )}
    </VoiceCallContext.Provider>
  );
}

export function useVoiceCall() {
  const ctx = useContext(VoiceCallContext);
  if (!ctx) {
    throw new Error("useVoiceCall must be used within VoiceCallProvider");
  }
  return ctx;
}
