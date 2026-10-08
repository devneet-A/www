"use client";

/**
 * Step-1 smoke test UI: calls our own /api/health route (never the external
 * APIs directly) and shows whether each upstream answered.
 * This component goes away once the real Home page exists (step 2).
 */
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Check {
  ok: boolean;
  ms: number;
  sample?: unknown;
  error?: string;
  authenticated?: boolean;
}

interface Health {
  ok: boolean;
  openf1: Check;
  jolpica: Check;
  checkedAt: string;
}

async function fetchHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`Health check failed (HTTP ${res.status})`);
  return res.json();
}

function CheckCard({ title, description, check }: { title: string; description: string; check: Check }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          <Badge variant={check.ok ? "success" : "destructive"}>{check.ok ? "OK" : "Error"}</Badge>
        </div>
        <CardDescription>
          {description} · {check.ms} ms
          {check.authenticated !== undefined && (check.authenticated ? " · authenticated" : " · no API key (historical only)")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {check.ok ? (
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(check.sample, null, 2)}</pre>
        ) : (
          <p className="text-sm text-destructive">{check.error}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function ApiStatus() {
  const { data, error, isPending, refetch, isFetching } = useQuery({ queryKey: ["health"], queryFn: fetchHealth });

  if (isPending) {
    // Same height as the loaded cards so nothing jumps when data arrives.
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-destructive">{error.message}</p>
          <button onClick={() => refetch()} className="text-sm underline">
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-2">
        <CheckCard title="OpenF1" description="Latest session" check={data.openf1} />
        <CheckCard title="Jolpica" description="Current season calendar" check={data.jolpica} />
      </div>
      <p className="text-xs text-muted-foreground">
        Checked {new Date(data.checkedAt).toLocaleTimeString()} ·{" "}
        <button onClick={() => refetch()} disabled={isFetching} className="underline disabled:opacity-50">
          {isFetching ? "Checking…" : "Check again"}
        </button>
      </p>
    </div>
  );
}
