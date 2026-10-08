"use client";

/** Latest track weather: air/track temperature, humidity, rain and wind. */
import { CloudRain, Droplets, Navigation, Sun, Thermometer, Wind } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WeatherNow } from "@/lib/timing";

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const cardinal = (deg: number) => CARDINALS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-muted/40 p-2.5">
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

export function WeatherCard({ weather }: { weather: WeatherNow | null }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <div className="flex items-baseline justify-between">
          <CardTitle>Weather</CardTitle>
          {weather && (
            <span className="text-xs text-muted-foreground">
              {new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(weather.date))}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!weather ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No weather data yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Stat icon={<Thermometer className="size-4" />} label="Air" value={`${weather.air_temperature.toFixed(1)} °C`} />
            <Stat icon={<Thermometer className="size-4 text-orange-400" />} label="Track" value={`${weather.track_temperature.toFixed(1)} °C`} />
            <Stat icon={<Droplets className="size-4" />} label="Humidity" value={`${Math.round(weather.humidity)} %`} />
            <Stat
              icon={weather.rainfall > 0 ? <CloudRain className="size-4 text-sky-400" /> : <Sun className="size-4" />}
              label="Rain"
              value={weather.rainfall > 0 ? <span className="text-sky-400">Raining</span> : "Dry"}
            />
            <div className="col-span-2">
              <Stat
                icon={<Wind className="size-4" />}
                label="Wind"
                value={
                  <span className="flex items-center gap-1.5">
                    {/* OpenF1 gives m/s; km/h is what most fans picture. */}
                    {(weather.wind_speed * 3.6).toFixed(0)} km/h from {cardinal(weather.wind_direction)}
                    {/* wind_direction is where the wind comes FROM; the arrow shows where it blows TO.
                        Lucide's Navigation icon points north-east (45°) by default. */}
                    <Navigation
                      className="size-3.5 text-muted-foreground"
                      style={{ transform: `rotate(${weather.wind_direction + 180 - 45}deg)` }}
                      aria-hidden
                    />
                  </span>
                }
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
