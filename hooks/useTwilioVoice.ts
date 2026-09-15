"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Call, Device } from "@twilio/voice-sdk";

export type CallState =
  | "idle"
  | "initializing"
  | "ready"
  | "connecting"
  | "ringing"
  | "connected"
  | "disconnecting"
  | "error";

interface VoiceUser {
  userId: string;
  fullName: string;
}

interface StartCallOptions {
  to: string;
  user: VoiceUser;
}

export function useTwilioVoice() {
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const [callState, setCallState] = useState<CallState>("idle");
  const [activeNumber, setActiveNumber] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromNumber, setFromNumber] = useState<string | null>(null);

  const cleanupCall = useCallback(() => {
    activeCallRef.current = null;
    setActiveNumber(null);
    setIsMuted(false);
    setCallState(deviceRef.current ? "ready" : "idle");
  }, []);

  const attachCallListeners = useCallback(
    (call: Call) => {
      activeCallRef.current = call;

      call.on("ringing", () => setCallState("ringing"));
      call.on("accept", () => setCallState("connected"));
      call.on("disconnect", cleanupCall);
      call.on("cancel", cleanupCall);
      call.on("reject", () => {
        setError("Call was rejected.");
        cleanupCall();
      });
      call.on("error", (err) => {
        setError(err.message || "Call failed.");
        cleanupCall();
      });
    },
    [cleanupCall]
  );

  const refreshToken = useCallback(async () => {
    const res = await fetch("/api/twilio/token", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to get voice token");
    }
    return data as { token: string; fromNumber: string };
  }, []);

  const initialize = useCallback(async () => {
    if (deviceRef.current) return;

    setCallState("initializing");
    setError(null);

    try {
      const { token, fromNumber: callerId } = await refreshToken();
      setFromNumber(callerId);

      const device = new Device(token, {
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        closeProtection: true,
      });

      device.on("registered", () => setCallState("ready"));
      device.on("unregistered", () => setCallState("idle"));
      device.on("error", (err) => {
        setError(err.message || "Voice device error.");
        setCallState("error");
      });
      device.on("tokenWillExpire", async () => {
        try {
          const { token: nextToken } = await refreshToken();
          await device.updateToken(nextToken);
        } catch {
          setError("Voice session expired. Please refresh the page.");
        }
      });

      await device.register();
      deviceRef.current = device;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to initialize calling."
      );
      setCallState("error");
    }
  }, [refreshToken]);

  const startCall = useCallback(
    async ({ to, user }: StartCallOptions) => {
      setError(null);

      if (!deviceRef.current) {
        await initialize();
      }

      const device = deviceRef.current;
      if (!device) {
        setError("Calling is not ready. Please try again.");
        return;
      }

      if (activeCallRef.current) {
        setError("A call is already in progress.");
        return;
      }

      setCallState("connecting");
      setActiveNumber(to);

      try {
        const call = await device.connect({
          params: {
            To: to,
            InitiatedByUserId: user.userId,
            InitiatedByName: user.fullName,
          },
        });

        attachCallListeners(call);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start call.");
        cleanupCall();
      }
    },
    [attachCallListeners, cleanupCall, initialize]
  );

  const hangUp = useCallback(() => {
    setCallState("disconnecting");
    activeCallRef.current?.disconnect();
    deviceRef.current?.disconnectAll();
    cleanupCall();
  }, [cleanupCall]);

  const toggleMute = useCallback(() => {
    const call = activeCallRef.current;
    if (!call) return;

    const nextMuted = !call.isMuted();
    call.mute(nextMuted);
    setIsMuted(nextMuted);
  }, []);

  useEffect(() => {
    return () => {
      activeCallRef.current?.disconnect();
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, []);

  const isInCall =
    callState === "connecting" ||
    callState === "ringing" ||
    callState === "connected" ||
    callState === "disconnecting";

  return {
    callState,
    activeNumber,
    isMuted,
    error,
    fromNumber,
    isInCall,
    isReady: callState === "ready",
    initialize,
    startCall,
    hangUp,
    toggleMute,
    setError,
  };
}
