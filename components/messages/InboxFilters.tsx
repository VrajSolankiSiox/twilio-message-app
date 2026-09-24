"use client";

interface InboxFiltersProps {
  showClosed: boolean;
  showStop: boolean;
  showBlank: boolean;
  onShowClosedChange: (value: boolean) => void;
  onShowStopChange: (value: boolean) => void;
  onShowBlankChange: (value: boolean) => void;
  disabled?: boolean;
}

function FilterChip({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-40"
          : active
            ? "bg-brand text-white shadow-sm shadow-brand/20"
            : "bg-surface text-zinc-600 ring-1 ring-border hover:bg-brand-muted/60"
      }`}
    >
      {label}
    </button>
  );
}

export default function InboxFilters({
  showClosed,
  showStop,
  showBlank,
  onShowClosedChange,
  onShowStopChange,
  onShowBlankChange,
  disabled = false,
}: InboxFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <FilterChip
        label="Open"
        active={!showClosed}
        disabled={disabled}
        onClick={() => onShowClosedChange(false)}
      />
      <FilterChip
        label="Closed"
        active={showClosed}
        disabled={disabled}
        onClick={() => {
          onShowClosedChange(true);
          onShowStopChange(false);
          onShowBlankChange(false);
        }}
      />
      {!showClosed && (
        <>
          <FilterChip
            label="STOP"
            active={showStop}
            disabled={disabled}
            onClick={() => onShowStopChange(!showStop)}
          />
          <FilterChip
            label="No reply"
            active={showBlank}
            disabled={disabled}
            onClick={() => onShowBlankChange(!showBlank)}
          />
        </>
      )}
    </div>
  );
}
