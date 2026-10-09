"use client";

/**
 * The one error card used across the app: what failed, why (in plain
 * words), and a Retry button. Never a blank screen.
 */
import { AlertCircle, RotateCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { friendlyError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function ErrorState({
  title,
  error,
  message,
  onRetry,
  retrying = false,
  className,
}: {
  title: string;
  /** The thrown error; turned into a friendly sentence. */
  error?: unknown;
  /** Or an explicit message (takes precedence). */
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <Card className={className} role="alert">
      <CardContent className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-2.5">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{message ?? friendlyError(error)}</p>
          </div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            <RotateCw className={cn("size-3.5", retrying && "motion-safe:animate-spin")} aria-hidden /> Retry
          </button>
        )}
      </CardContent>
    </Card>
  );
}
