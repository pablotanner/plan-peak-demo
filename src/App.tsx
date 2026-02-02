import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ---------- IDs ----------
const DEVICE1 = "shellyproem50-441d6475ac84";
const DEVICE2 = "shellyproem50-441d6475ac84-AUSGANG2";

const SENSOR1 = "7c:c6:b6:73:9d:6d"; // Prozessluft 1
const SENSOR2 = "f8:44:77:05:40:48"; // Trockenluft 1
const SENSOR3 = "f8:44:77:3a:0c:40"; // Prozessluft 2
const SENSOR4 = "f8:44:77:21:32:65"; // Trockenluft 2

type SensorMeta = {
  name: string;
  color: string;
};

const SENSOR_META: Record<string, SensorMeta> = {
  "7c:c6:b6:73:9d:6d": {
    name: "Prozessluft 1",
    color: "#ff7300",
  },
  "f8:44:77:05:40:48": {
    name: "Trockenluft 1",
    color: "#0088FE",
  },
  "f8:44:77:3a:0c:40": {
    name: "Prozessluft 2",
    color: "#ff4d4f",
  },
  "f8:44:77:21:32:65": {
    name: "Trockenluft 2",
    color: "#00c49f",
  },
};

type DeviceMeta = {
  label: string;
  color: string;
};

const DEVICE_META: Record<string, DeviceMeta> = {
  d1: { label: "Device 1", color: "#1900ff" }, // blue
  d2: { label: "Device 2", color: "#1bad3d" }, // green
};

// ---------- Config: add more devices easily ----------
const SETUPS = [
  {
    key: "d1",
    label: "Device 1",
    deviceId: DEVICE1,
    procMac: SENSOR1,
    dryMac: SENSOR2,
  },
  {
    key: "d2",
    label: "Device 2",
    deviceId: DEVICE2,
    procMac: SENSOR3,
    dryMac: SENSOR4,
  },
] as const;

type SetupKey = typeof SETUPS[number]["key"];

// ---------- Time window ----------
const ONE_MINUTE_MS = 60_000;
const WINDOW_MINUTES = 35;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

// ---------- Price calc ----------
const STROMPREIS_CHF = 0.28;
const ZEITRAUM = 20;
const STUNDEN_PRO_JAHR = 24 * 365;
const GLEICHZEITIGKEIT = 0.5;

// ---------- Types ----------
type DbRow = {
  ts: string; // ISO
  received_at?: string;
  device_id?: string;
  sensor_mac?: string | null;

  act_power?: number | null;

  temperature?: number | null;
  humidity?: number | null;
  battery?: number | null;
};

type UnifiedPoint = {
  ts: number;
  timeLabel: string;

  // Power/cost/metrics per setup (dynamic keys)
  // Example keys: power_d1, strompreis_d1, entfeuchtungseffizienz_d1, differenz_wasserinhalt_d1
  [k: string]: number | string | undefined;
};

// ---------- Helpers ----------
function minuteBucket(tsMs: number) {
  return Math.floor(tsMs / ONE_MINUTE_MS) * ONE_MINUTE_MS;
}

function calculateAbsoluteHumidity(
  temperatureC: number,
  relativeHumidity: number
) {
  const saturationVaporPressure =
    6.112 * Math.exp((16 * temperatureC) / (243.12 + temperatureC));
  const vaporPressure = (relativeHumidity / 100) * saturationVaporPressure;
  return (216.7 * vaporPressure) / (temperatureC + 273.15);
}

// ---------- Normalization ----------
function normalizeMeasurements(
  rows: DbRow[],
  volProc: number,
  volDry: number
): UnifiedPoint[] {
  const sorted = [...rows].sort(
    (a, b) => Date.parse(a.received_at) - Date.parse(b.received_at)
  );

  const buckets = new Map<number, UnifiedPoint>();

  // last env per MAC (so lines stay continuous)
  const lastEnvByMac: Record<string, { t?: number; h?: number }> = {};

  // energy integration per device (very simple; keeps your old assumption)
  const lastEnergyByDevice: Record<string, number> = {};
  for (const s of SETUPS) lastEnergyByDevice[s.deviceId] = 0;

  for (const r of sorted) {
    const tsMs = Date.parse(r.received_at);
    const minuteTs = minuteBucket(tsMs);

    let p = buckets.get(minuteTs);
    if (!p) {
      p = {
        ts: minuteTs,
        timeLabel: new Date(minuteTs).toLocaleTimeString(),
      };
      buckets.set(minuteTs, p);
    }

    for (const macKey of [SENSOR1, SENSOR2, SENSOR3, SENSOR4]) {
      const last = lastEnvByMac[macKey];
      if (!last) continue;

      if (last.t !== undefined && p[`temp_${macKey}`] === undefined) {
        p[`temp_${macKey}`] = last.t;
      }
      if (last.h !== undefined && p[`hum_${macKey}`] === undefined) {
        p[`hum_${macKey}`] = last.h;
      }
    }

    const mac = (r.sensor_mac ?? "").toLowerCase();
    const devId = r.device_id ?? "";

    // ---- Env: store by MAC and write to point keys (so we can chart all sensors) ----
    if (mac) {
      if (!lastEnvByMac[mac]) lastEnvByMac[mac] = {};
      if (typeof r.temperature === "number") lastEnvByMac[mac].t = r.temperature;
      if (typeof r.humidity === "number") lastEnvByMac[mac].h = r.humidity;

      // chart keys for each sensor line
      const t = lastEnvByMac[mac].t;
      const h = lastEnvByMac[mac].h;
      if (t !== undefined) p[`temp_${mac}`] = t;
      if (h !== undefined) p[`hum_${mac}`] = h;
    }

    // ---- Power: per device ----
    if (typeof r.act_power === "number" && devId) {
      // only assign if this device is part of SETUPS (otherwise ignore)
      const setup = SETUPS.find((s) => s.deviceId === devId);
      if (setup) {
        const key = setup.key;

        p[`power_${key}`] = r.act_power;

        // NOTE: your original code assumed power points every 5 seconds.
        // Keeping that for now to minimize changes.
        lastEnergyByDevice[devId] += r.act_power * (5 / 3600);
        p[`energy_${key}`] = Number(lastEnergyByDevice[devId].toFixed(2));

        p[`strompreis_${key}`] =
          (r.act_power / 1000) *
          STROMPREIS_CHF *
          ZEITRAUM *
          STUNDEN_PRO_JAHR *
          GLEICHZEITIGKEIT;
      }
    }

    // ---- Derived metrics per setup (needs proc+dry env + power for that setup) ----
    for (const s of SETUPS) {
      const key = s.key;

      const power = p[`power_${key}`] as number | undefined;

      const proc =
        lastEnvByMac[s.procMac]?.t !== undefined &&
        lastEnvByMac[s.procMac]?.h !== undefined
          ? { t: lastEnvByMac[s.procMac].t!, h: lastEnvByMac[s.procMac].h! }
          : null;

      const dry =
        lastEnvByMac[s.dryMac]?.t !== undefined &&
        lastEnvByMac[s.dryMac]?.h !== undefined
          ? { t: lastEnvByMac[s.dryMac].t!, h: lastEnvByMac[s.dryMac].h! }
          : null;

      if (power !== undefined && proc && dry) {
        // Input (Prozessluft)
        const abs1 = calculateAbsoluteHumidity(proc.t, proc.h);
        const wasser1 = volProc * 1.12 * abs1 / 1000;

        // Output (Trockenluft)
        const abs2 = calculateAbsoluteHumidity(dry.t, dry.h);
        const wasser2 = volDry * 1.12 * abs2 / 1000;

        const diff = Math.abs(wasser1 - wasser2);
        p[`abs1_${key}`] = abs1;
        p[`abs2_${key}`] = abs2;
        p[`differenz_wasserinhalt_${key}`] = diff;
        p[`entfeuchtungseffizienz_${key}`] = diff / (power / 1000);
      }
    }
  }

  const now = Date.now();
  return Array.from(buckets.values()).filter(
    (p) => (p.ts as number) >= now - WINDOW_MS
  );
}

export default function App() {
  const [data, setData] = useState<UnifiedPoint[]>([]);

  // NEW: controllable volumenstrom inputs
  const [volProc, setVolProc] = useState<number>(450);
  const [volDry, setVolDry] = useState<number>(350);

  // UPDATED: log now includes the selected volumenstrom values
  console.log({ data, volProc, volDry });

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch(
        "https://plan-peak-backendnew.vercel.app/measurements"
      );
      const json = await res.json();
      setData(normalizeMeasurements(json.measurements, volProc, volDry));
    };

    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, [volProc, volDry]);

  // pick last (latest) point that has a numeric value for a given key
  function lastNumber(data: UnifiedPoint[], key: string): number | undefined {
    for (let i = data.length - 1; i >= 0; i--) {
      const v = data[i][key];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return undefined;
  }

  const cost1 = lastNumber(data, "strompreis_d1"); // CHF (20 years)
  const cost2 = lastNumber(data, "strompreis_d2");

  const savings =
    cost1 !== undefined && cost2 !== undefined ? cost2 - cost1 : undefined;
  // Positive savings means: Device 1 is cheaper than Device 2 (because cost2 - cost1 > 0)

  return (
    <div style={{ padding: 20 }}>
      <h1>Qubiq Demo</h1>

      {/* NEW: Inputs for volumenstrom */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Prozessluft Volumenstrom
          <input
            type="number"
            value={volProc}
            onChange={(e) => setVolProc(Number(e.target.value))}
            style={{ width: 110 }}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Trockenluft Volumenstrom
          <input
            type="number"
            value={volDry}
            onChange={(e) => setVolDry(Number(e.target.value))}
            style={{ width: 110 }}
          />
        </label>
      </div>

      <div
        style={{
          padding: "6px 14px",
          borderRadius: 4,
          border: "1px solid #e6e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 20 }}>
          Ersparnisse auf 20 Jahre:
        </div>

        <div style={{ fontSize: 24, fontWeight: 800, color: "#128b02" }}>
          {savings === undefined ? (
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              Warte auf Daten...
            </span>
          ) : (
            <>
              <span>
                {(savings >= 0 ? "+" : "") +
                  Math.round(savings).toLocaleString()}
              </span>
              <span style={{ fontSize: 24, fontWeight: 600 }}> CHF</span>
            </>
          )}
        </div>
      </div>

      {/* POWER */}
      <h2>Power (W)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" W" />
          <Tooltip formatter={(value) => value as any} />
          {SETUPS.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={`power_${s.key}`}
              name={`Power (${DEVICE_META[s.key].label})`}
              stroke={DEVICE_META[s.key].color}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <h2>Energiekosten ({ZEITRAUM} Jahre)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" CHF" />
          <Tooltip
            formatter={(value) =>
              ((value ? Math.round(value as number) : 0) + " CHF") as any
            }
          />
          {SETUPS.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={`strompreis_${s.key}`}
              name={`Energiekosten (${DEVICE_META[s.key].label})`}
              stroke={DEVICE_META[s.key].color}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <h2>Entfeuchtungseffizienz (kg/kWh)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" kg/kWh" />
          <Tooltip
            formatter={(value) => (Math.round((value as number) * 100) / 100) as any}
          />
          {SETUPS.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={`entfeuchtungseffizienz_${s.key}`}
              name={`Effizienz (${DEVICE_META[s.key].label})`}
              stroke={DEVICE_META[s.key].color}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <h2>Differenz Wasserinhalt (kg/h)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" kg/h" />
          <Tooltip
            formatter={(value) =>
              (Math.round((value as number) * 1000) / 1000) as any
            }
          />
          {SETUPS.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={`differenz_wasserinhalt_${s.key}`}
              name={`Differenz Wasserinhalt (${DEVICE_META[s.key].label})`}
              stroke={DEVICE_META[s.key].color}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* TEMPERATURE */}
      <h2>Temperature (°C)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" °C" />
          <Tooltip formatter={(value) => `${value} °C`} />

          {Object.entries(SENSOR_META).map(([mac, meta]) => (
            <Line
              key={mac}
              type="monotone"
              dataKey={`temp_${mac}`}
              name={meta.name}
              stroke={meta.color}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* HUMIDITY */}
      <h2>Relative Luftfeuchtigkeit (%)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" %" domain={[30, 80]} />
          <Tooltip formatter={(value) => `${value} %`} />

          {Object.entries(SENSOR_META).map(([mac, meta]) => (
            <Line
              key={mac}
              type="monotone"
              dataKey={`hum_${mac}`}
              name={meta.name}
              stroke={meta.color}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* ABS HUMIDITY */}
      <h2>Abs Luftfeuchtigkeit</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit="" />
          <Tooltip
            formatter={(value) =>
              (Math.round((value as number) * 1000) / 1000) as any
            }
          />
          {SETUPS.map((s) => (
            <>
              <Line
                key={`abs1_${s.key}`}
                type="monotone"
                dataKey={`abs1_${s.key}`}
                name={`Abs 1 (${DEVICE_META[s.key].label})`}
                stroke={DEVICE_META[s.key].color}
                dot={false}
              />
              <Line
                key={`abs2_${s.key}`}
                type="monotone"
                dataKey={`abs2_${s.key}`}
                name={`Abs 2 (${DEVICE_META[s.key].label})`}
                stroke={DEVICE_META[s.key].color}
                dot={false}
              />
            </>
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}