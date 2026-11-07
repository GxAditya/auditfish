import { DotmSquare3 } from "@/components/ui/dotm-square-3";

export function DotLoader({ size = 16, className }: { size?: number; className?: string }) {
  return <span className={className} style={{ display: "inline-flex" }}><DotmSquare3 size={size} dotSize={Math.max(2, Math.round(size / 7))} /></span>;
}
