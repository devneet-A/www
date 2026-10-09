import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      // Floating panel: generous rounding, a soft drop shadow and a faint top
      // highlight, slightly translucent so the page glow shows through.
      className={cn(
        "flex flex-col gap-4 rounded-3xl border border-white/[0.07] bg-card/90 bg-[linear-gradient(180deg,oklch(1_0_0/0.035),transparent_45%)] py-5 text-card-foreground shadow-xl shadow-black/35 backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1 px-4 sm:px-5", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("text-[15px] leading-none font-bold tracking-tight", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-4 sm:px-5", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
