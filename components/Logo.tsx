import Image from "next/image";

const LOGO_URL =
  "https://revenelx.com/wp-content/uploads/2025/04/RevenelX-Logo-scaled.png";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  layout?: "inline" | "stacked";
}

export default function Logo({
  size = "md",
  showText = false,
  layout = "inline",
}: LogoProps) {
  const heights = { sm: 28, md: 36, lg: 48 };
  const h = heights[size];
  const useStacked = showText && layout === "stacked";

  const image = (
    <Image
      src={LOGO_URL}
      alt="RevenelX"
      width={Math.round(h * 3.2)}
      height={h}
      className={`object-contain object-left ${useStacked ? "h-auto w-full max-w-[160px]" : "h-auto max-w-full"}`}
      style={{
        height: h,
        width: "auto",
        maxWidth: useStacked ? 160 : showText ? 96 : undefined,
      }}
      priority
    />
  );

  if (!showText) {
    return <div className="flex items-center">{image}</div>;
  }

  const text = (
    <div className={useStacked ? "min-w-0" : "min-w-0 flex-1"}>
      {/* <p className="text-sm font-semibold leading-tight text-foreground">
        SMS Portal
      </p> */}
      <p className="text-xs leading-snug font-semibold text-zinc-500">
        RevenelX Communications
      </p>
    </div>
  );

  if (useStacked) {
    return (
      <div className="flex min-w-0 flex-col gap-2.5">
        {image}
        {text}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="shrink-0">{image}</div>
      {text}
    </div>
  );
}
