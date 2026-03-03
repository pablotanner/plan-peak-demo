import { useEffect, useState } from "react";
import "./App.css";
import { DescriptionSidebar } from "./DescriptionSidebar";
import { DescriptionContent } from "./descriptionContent";
import { DebugPanel } from "./DebugPanel";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// IDs, do not change, this is what is sent by Shelly 
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


// Config to add more devices if needed
const SETUPS = [
  {
    key: "d1",
    label: "Device 1",
    deviceId: DEVICE1,
    procMac: SENSOR1,
    dryMac: SENSOR2,
    procLS:390,
    dryLS:370,
  },
  {
    key: "d2",
    label: "Device 2",
    deviceId: DEVICE2,
    procMac: SENSOR3,
    dryMac: SENSOR4,
    procLS:500,
    dryLS:350,
  },
] as const;

// Time Window
const ONE_MINUTE_MS = 60000;
const WINDOW_MINUTES = 30; // Messzeitraum default

// Price Calculation
const STROMPREIS_CHF = 0.28;
const ZEITRAUM = 20;
const STUNDEN_PRO_JAHR = 24 * 365;
const GLEICHZEITIGKEIT = 0.5;

// Types
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

  // Power/cost/metrics per setup
  // Example keys: power_d1, strompreis_d1, entfeuchtungseffizienz_d1, differenz_wasserinhalt_d1
  [k: string]: number | string | undefined;
};

// Helpers
function minuteBucket(tsMs: number) {
  return Math.floor(tsMs / ONE_MINUTE_MS) * ONE_MINUTE_MS;
}

// Customized Absolute Humidity formula
function calculateAbsoluteHumidity(temperatureC: number, relativeHumidity: number) {
  const saturationVaporPressure =
    6.112 * Math.exp((16 * temperatureC) / (243.12 + temperatureC));
  const vaporPressure = (relativeHumidity / 100) * saturationVaporPressure;
  return (216.7 * vaporPressure) / (temperatureC + 273.15);
}

// Normalization
type DeviceSettings = {
  procLS: number; // Prozessluft Volumenstrom (m3/h)
  dryLS: number;  // Trockenluft Volumenstrom (m3/h)
};

type Settings = {
  strompreis: number;       // CHF/kWh
  zeitraum: number;         // Jahre
  gleichzeitigkeit: number; // 0-1
  messzeitraum: number;     // Minuten (Anzeigefenster)
  devices: Record<string, DeviceSettings>;
};

const DEFAULT_SETTINGS: Settings = {
  strompreis: STROMPREIS_CHF,
  zeitraum: ZEITRAUM,
  gleichzeitigkeit: GLEICHZEITIGKEIT,
  messzeitraum: WINDOW_MINUTES,
  devices: Object.fromEntries(SETUPS.map((s) => [s.key, { procLS: s.procLS, dryLS: s.dryLS }])),
};

function normalizeMeasurements(rows: DbRow[], settings: Settings = DEFAULT_SETTINGS): UnifiedPoint[] {
  const sorted = [...rows].sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at));

  const buckets = new Map<number, UnifiedPoint>();

  // last env per MAC (so lines stay continuous)
  const lastEnvByMac: Record<string, { t?: number; h?: number }> = {};

  // energy integration per device
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

    // Env: store by MAC and write to point keys (so we can chart all sensors)
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

    // Power (per device)
    if (typeof r.act_power === "number" && devId) {
      // only assign if this device is part of SETUPS (otherwise ignore)
      const setup = SETUPS.find((s) => s.deviceId === devId);
      if (setup) {
        const key = setup.key;

        p[`power_${key}`] = r.act_power;

        // Assume one power reading per 5 seconds for energy integration (we set this interval in Shelly settings)
        lastEnergyByDevice[devId] += r.act_power * (5 / 3600);
        p[`energy_${key}`] = Number(lastEnergyByDevice[devId].toFixed(2));

        p[`strompreis_${key}`] =
          (r.act_power / 1000) *
          settings.strompreis *
          settings.zeitraum *
          STUNDEN_PRO_JAHR *
          settings.gleichzeitigkeit;
      }
    }

    // Derived metrics per setup (needs proc+dry env + power for that setup)
    for (const s of SETUPS) {
      const key = s.key;

      const power = p[`power_${key}`] as number | undefined;

      const proc = lastEnvByMac[s.procMac]?.t !== undefined && lastEnvByMac[s.procMac]?.h !== undefined
        ? { t: lastEnvByMac[s.procMac].t!, h: lastEnvByMac[s.procMac].h! }
        : null;

      const dry = lastEnvByMac[s.dryMac]?.t !== undefined && lastEnvByMac[s.dryMac]?.h !== undefined
        ? { t: lastEnvByMac[s.dryMac].t!, h: lastEnvByMac[s.dryMac].h! }
        : null;

      if (power !== undefined && proc && dry) {
        const procLS = settings.devices[s.key]?.procLS ?? s.procLS;
        const dryLS  = settings.devices[s.key]?.dryLS  ?? s.dryLS;

        // Input (Prozessluft)
        const abs1 = calculateAbsoluteHumidity(proc.t, proc.h);
        const wasser1 = procLS * 1.12 * abs1 / 1000;

        // Output (Trockenluft)
        const abs2 = calculateAbsoluteHumidity(dry.t, dry.h);
        const wasser2 = dryLS * 1.12 * abs2 / 1000;

        const diff = Math.abs(wasser1 - wasser2);
        p[`abs1_${key}`] = abs1
        p[`abs2_${key}`] = abs2
        p[`differenz_wasserinhalt_${key}`] = diff;
        p[`entfeuchtungseffizienz_${key}`] = diff / (power / 1000);
      }
    }
  }

  const now = Date.now();
  const windowMs = settings.messzeitraum * 60 * 1000;
  return Array.from(buckets.values()).filter((p) => (p.ts as number) >= now - windowMs);
}

export default function App() {
  const [data, setData] = useState<UnifiedPoint[]>([]);
  const [rawMeasurements, setRawMeasurements] = useState<unknown[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [descOpen, setDescOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch("https://plan-peak-backendnew.vercel.app/measurements");
      const json = await res.json();
      const measurements: DbRow[] = json.measurements ?? [];
      setRawMeasurements(measurements);
      setData(normalizeMeasurements(measurements, settings));
    };
    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, [settings]);


  function setGlobal<K extends keyof Omit<Settings, "devices">>(key: K, value: number) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  function setDeviceParam(deviceKey: string, param: keyof DeviceSettings, value: number) {
    setSettings((s) => ({
      ...s,
      devices: { ...s.devices, [deviceKey]: { ...s.devices[deviceKey], [param]: value } },
    }));
  }


  return (
    <div style={{ padding: 20 }}>
      <h1 style={{margin:0, marginBottom:"0.5em", padding:0}}>Qubiq Demo</h1>

      <div style={{display:"flex", flexDirection:"row", gap:"10px", alignItems:"center"}}>
        <img
        src="/skizze.PNG"
        alt="System Skizze"
        style={{ maxWidth: "40%", height: "auto", marginBottom: 20}}
      />
        <button className="read-more-btn" onClick={() => setDescOpen(true)}>
          Anleitung öffnen
        </button>

        <DescriptionSidebar
          open={descOpen}
          onClose={() => setDescOpen(false)}
          title="Beschreibung"
        >
          <DescriptionContent />
        </DescriptionSidebar>
      </div>
      

      {/*PARAMETER PANEL */}
      <div style={{
        padding: "8px 12px",
        borderRadius: 2,
        border: "1px solid #d0d5e8",
        fontSize: 14,
      }}>
        <h3 style={{ fontSize: 16, padding:0, margin:0, marginBottom:"10px" }}>Parameter</h3>

        {/* Global parameters */}
        <div style={{ marginBottom: 16}}>
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13, textTransform: "uppercase", color: "#a1a1a1" }}>
            Allgemein
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span>Strompreis (CHF/kWh)</span>
              <input
                type="number"
                value={settings.strompreis}
                min={0}
                step={0.01}
                onChange={(e) => setGlobal("strompreis", Number(e.target.value))}
                style={{ width: 100, padding: "4px 8px", borderRadius: 4, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span>Betrachtungszeitraum (Jahre)</span>
              <input
                type="number"
                value={settings.zeitraum}
                min={1}
                step={1}
                onChange={(e) => setGlobal("zeitraum", Number(e.target.value))}
                style={{ width: 100, padding: "4px 8px", borderRadius: 4, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span>Gleichzeitigkeit (0–1)</span>
              <input
                type="number"
                value={settings.gleichzeitigkeit}
                min={0}
                max={1}
                step={0.05}
                onChange={(e) => setGlobal("gleichzeitigkeit", Number(e.target.value))}
                style={{ width: 100, padding: "4px 8px", borderRadius: 4, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span>Messzeitraum (Minuten)</span>
              <input
                type="number"
                value={settings.messzeitraum}
                min={1}
                max={120}
                step={1}
                onChange={(e) => setGlobal("messzeitraum", Number(e.target.value))}
                style={{ width: 100, padding: "4px 8px", borderRadius: 4, border: "1px solid #ccc" }}
              />
            </label>
          </div>
        </div>

        {/* Per-device volumenstrom */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, textTransform: "uppercase", color: "#a1a1a1", letterSpacing: "0.05em" }}>
            Volumenstrom
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {SETUPS.map((s) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
                <strong style={{ minWidth: 90, color: DEVICE_META[s.key].color }}>{DEVICE_META[s.key].label}</strong>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span>Prozessluft (m³/h)</span>
                  <input
                    type="number"
                    value={settings.devices[s.key]?.procLS ?? s.procLS}
                    min={0}
                    step={10}
                    onChange={(e) => setDeviceParam(s.key, "procLS", Number(e.target.value))}
                    style={{ width: 100, padding: "4px 8px", borderRadius: 4, border: "1px solid #ccc" }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span>Trockenluft (m³/h)</span>
                  <input
                    type="number"
                    value={settings.devices[s.key]?.dryLS ?? s.dryLS}
                    min={0}
                    step={10}
                    onChange={(e) => setDeviceParam(s.key, "dryLS", Number(e.target.value))}
                    style={{ width: 100, padding: "4px 8px", borderRadius: 4, border: "1px solid #ccc" }}
                  />
                </label>
              </div>
            ))}
          </div>
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

      <h2>Energiekosten ({settings.zeitraum} Jahre)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" CHF" />
          <Tooltip formatter={(value) => ((value ? Math.round(value as number) : 0) + " CHF") as any} />
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
          <Tooltip formatter={(value) => Math.round((value as number) * 100) / 100 as any} />
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
          <Tooltip formatter={(value) => Math.round((value as number) * 1000) / 1000 as any} />
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

          {/* HUMIDITY */}
    <h2>Absolute Luftfeuchtigkeit</h2>
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="timeLabel" />
        <YAxis unit="" />
          <Tooltip formatter={(value) => Math.round((value as number) * 1000) / 1000 as any} />
        {SETUPS.map((s) => (
          <>
          <Line
              key={s.key}
              type="monotone"
              dataKey={`abs1_${s.key}`}
              name={`Abs 1 (${DEVICE_META[s.key].label})`}
              stroke={DEVICE_META[s.key].color}
              dot={false}
            />
             <Line
              key={s.key}
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
{/* DEBUG PANEL */}
      <DebugPanel
        rawData={rawMeasurements}
        settings={settings}
        computedData={data}
      />
  </div>
  );
}
