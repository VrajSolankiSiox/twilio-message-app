"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Conversation } from "@/lib/messages";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";

interface IndicatorStyle {
  top: number;
  height: number;
  opacity: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedPhone: string | null;
  loading: boolean;
  onSelect: (phone: string) => void;
  formatTime: (dateStr: string) => string;
  getInitials: (phone: string) => string;
}

export default function ConversationList({
  conversations,
  selectedPhone,
  loading,
  onSelect,
  formatTime,
  getInitials,
}: ConversationListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement>>({});
  const prevPhoneRef = useRef<string | null>(null);
  const travelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [indicator, setIndicator] = useState<IndicatorStyle>({
    top: 0,
    height: 0,
    opacity: 0,
  });
  const [isLifted, setIsLifted] = useState(false);

  const indicatorReady = indicator.opacity > 0 && indicator.height > 0;
  const normalizedSelected = selectedPhone
    ? normalizePhone(selectedPhone)
    : null;

  const measureItem = useCallback((phone: string) => {
    const list = listRef.current;
    const el = itemRefs.current[normalizePhone(phone)];
    if (!list || !el) return null;

    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    return {
      top: elRect.top - listRect.top + list.scrollTop,
      height: elRect.height,
      opacity: 1,
    };
  }, []);

  const updateIndicator = useCallback(
    (phone: string | null = normalizedSelected) => {
      if (!phone) return;
      const next = measureItem(phone);
      if (next) setIndicator(next);
    },
    [measureItem, normalizedSelected]
  );

  const handleIndicatorTransitionEnd = (
    event: React.TransitionEvent<HTMLDivElement>
  ) => {
    if (event.propertyName !== "transform") return;
    setIsLifted(false);
  };

  useLayoutEffect(() => {
    const isFirstPaint = prevPhoneRef.current === null;
    const isSelectionChange =
      prevPhoneRef.current !== null &&
      normalizedSelected !== null &&
      prevPhoneRef.current !== normalizedSelected;

    if (!normalizedSelected) {
      prevPhoneRef.current = null;
      return;
    }

    if (isFirstPaint) {
      updateIndicator(normalizedSelected);
      prevPhoneRef.current = normalizedSelected;
      return;
    }

    if (isSelectionChange) {
      setIsLifted(true);

      if (travelTimerRef.current) clearTimeout(travelTimerRef.current);
      travelTimerRef.current = setTimeout(() => {
        updateIndicator(normalizedSelected);
      }, 60);
    } else {
      updateIndicator(normalizedSelected);
    }

    prevPhoneRef.current = normalizedSelected;
  }, [normalizedSelected, conversations, updateIndicator]);

  useLayoutEffect(() => {
    return () => {
      if (travelTimerRef.current) clearTimeout(travelTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const handleResize = () => updateIndicator();
    const handleScroll = () => {
      if (!isLifted) updateIndicator();
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(list);
    list.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [updateIndicator, isLifted]);

  const highlightedPhone = indicatorReady ? normalizedSelected : null;

  return (
    <div
      ref={listRef}
      className="inbox-list relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
    >
      {loading && conversations.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      )}

      {!loading && conversations.length === 0 && (
        <p className="px-5 py-16 text-center text-sm text-zinc-400">
          No conversations match your filters
        </p>
      )}

      {conversations.length > 0 && (
        <div
          aria-hidden
          onTransitionEnd={handleIndicatorTransitionEnd}
          className={`inbox-indicator pointer-events-none absolute z-[1] ${
            isLifted ? "inbox-indicator--lifted" : ""
          }`}
          style={
            {
              "--indicator-y": `${indicator.top}px`,
              "--indicator-h": `${indicator.height}px`,
              opacity: indicator.opacity,
            } as React.CSSProperties
          }
        />
      )}

      {conversations.map((conv) => {
        const phoneKey = normalizePhone(conv.phone);
        const isHighlighted = highlightedPhone === phoneKey;

        return (
          <button
            key={conv.phone}
            type="button"
            ref={(el) => {
              if (el) itemRefs.current[phoneKey] = el;
              else delete itemRefs.current[phoneKey];
            }}
            onClick={() => onSelect(conv.phone)}
            className="relative z-[2] flex w-full items-start gap-3 border-b border-border/40 px-4 py-3.5 text-left"
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-[box-shadow,background-color,color] duration-300 ${
                isHighlighted
                  ? "bg-brand text-white shadow-sm shadow-brand/20"
                  : "bg-brand-muted/80 text-brand"
              }`}
            >
              {getInitials(conv.phone)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className={`truncate text-sm transition-[font-weight,color] duration-200 ${
                    isHighlighted
                      ? "font-semibold text-foreground"
                      : "font-medium text-zinc-700"
                  }`}
                >
                  {formatPhoneDisplay(conv.phone)}
                </p>
                <time className="shrink-0 text-[10px] text-zinc-400">
                  {formatTime(conv.lastMessageAt)}
                </time>
              </div>
              <p
                className={`mt-0.5 truncate text-xs transition-colors duration-200 ${
                  isHighlighted ? "text-zinc-600" : "text-zinc-500"
                }`}
              >
                {conv.lastMessage}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {conv.assignedToName ? (
                  <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                    {conv.assignedToName}
                  </span>
                ) : (
                  <span className="rounded-md bg-amber-50/90 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                    Unassigned
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
