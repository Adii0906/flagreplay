"use client";

import type { ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "empty";
  if (typeof v === "string") return `"${v}"`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtUtc(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#18181b" stroke="#2f2f35" />
      <path d="M10 25V7" stroke="#ededef" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11 8h11l-3 4.5 3 4.5H11" fill="#f97316" />
    </svg>
  );
}

type Tone = "neutral" | "accent" | "ok" | "bad" | "warn" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted border-line-strong",
  accent: "bg-accent-soft text-accent border-accent/30",
  ok: "bg-ok-soft text-ok border-ok/25",
  bad: "bg-bad-soft text-bad border-bad/25",
  warn: "bg-warn-soft text-warn border-warn/25",
  outline: "bg-transparent text-muted border-line-strong",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx("inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[11px] font-medium leading-4 whitespace-nowrap", tones[tone], className)}
    >
      {children}
    </span>
  );
}

export function Section({
  label,
  title,
  icon,
  right,
  children,
  className,
}: {
  label: string;
  title?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-lg border border-line bg-surface", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {icon && <span className="text-faint">{icon}</span>}
          <span className="font-mono text-[11px] tracking-wide text-faint uppercase">{label}</span>
          {title && <span className="truncate text-sm font-medium text-fg">{title}</span>}
        </div>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cx("rounded-sm bg-surface-3 px-1 py-px font-mono text-[12px] text-fg", className)}>{children}</code>;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  const v = {
    primary: "bg-accent text-black hover:bg-[#fb8a3c] border-accent font-semibold",
    secondary: "bg-surface-2 text-fg hover:bg-surface-3 border-line-strong",
    ghost: "bg-transparent text-muted hover:text-fg hover:bg-surface-2 border-transparent",
    danger: "bg-bad-soft text-bad border-bad/30 hover:bg-bad/20",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3 py-1.5 text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        v,
        className,
      )}
    >
      {children}
    </button>
  );
}
