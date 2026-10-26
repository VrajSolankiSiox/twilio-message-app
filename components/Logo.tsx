import Image, { type StaticImageData } from "next/image";
import greenLogoImage from "@/public/revenelx-logo-green.png";

const LOGO_DEFAULT_URL =
  "https://revenelx.com/wp-content/uploads/2025/04/RevenelX-Logo-scaled.png";

/** Public path (notifications, invoices). Prefer bundled import in Logo for cache busting. */
export const LOGO_GREEN_PATH = "/revenelx-logo-green.png";

export type LogoTone = "default" | "green";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  layout?: "inline" | "stacked";
  subtitle?: string;
  subtitleClassName?: string;
  /** `green` only for logged-in RevenelX Green UI — not login. */
  tone?: LogoTone;
}

export default function Logo({
  size = "md",
  showText = false,
  layout = "inline",
  subtitle,
  subtitleClassName = "text-zinc-600",
  tone = "default",
}: LogoProps) {
  const heights = { sm: 28, md: 36, lg: 48 };
  const h = heights[size];
  const useStacked = showText && layout === "stacked";
  const isGreen = tone === "green";
  const logoSrc: string | StaticImageData = isGreen
    ? greenLogoImage
    : LOGO_DEFAULT_URL;
  const logoWidth = isGreen
    ? Math.round((greenLogoImage.width / greenLogoImage.height) * h)
    : Math.round(h * 3.2);

  const image = (
    <Image
      src={logoSrc}
      alt="RevenelX"
      width={logoWidth}
      height={h}
      unoptimized={isGreen}
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

  const text = subtitle ? (
    <div className={useStacked ? "min-w-0" : "min-w-0 flex-1"}>
      <p
        className={`text-xs leading-snug font-semibold tracking-tight ${subtitleClassName}`}
      >
        {subtitle}
      </p>
    </div>
  ) : null;

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
