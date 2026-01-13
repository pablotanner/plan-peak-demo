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

// Only use these two for now:
const SENSOR1 = "7c:c6:b6:73:9d:6d"; // Prozessluft
const SENSOR2 = "f8:44:77:05:40:48"; // Trockenluft




// sensor gives different data at different times:
// time, humidity, temperature every 1 minute
// time, power, energy every 5 seconds
type UnifiedPoint = {
  ts: number;
  timeLabel: string;

  power?: number;
  energy?: number;

  // sensor 1 (Prozessluft)
  temperature1?: number;
  humidity1?: number;

  // sensor 2 (Trockenluft)
  temperature2?: number;
  humidity2?: number;

  strompreis?: number;
  differenz_wasserinhalt?: number;
  entfeuchtungseffizienz?: number;
};


const ONE_MINUTE_MS = 60_000;

const WINDOW_MINUTES = 10;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

// Strompreis
const STROMPREIS_CHF = 0.28;
const ZEITRAUM = 20;
const STUNDEN_PRO_JAHR = 24*365; 
const GLEICHZEITIGKEIT = 0.5;


function calculateAbsoluteHumidity(temperatureC: number, relativeHumidity: number) {

    // Saturation vapor pressure (hPa) – Magnus formula
    //const saturationVaporPressure = 6.112 * Math.exp((17.62 * temperatureC) / (243.12 + temperatureC));
    const saturationVaporPressure = 6.112 * Math.exp((16 * temperatureC) / (243.12 + temperatureC));

    // Actual vapor pressure (hPa)
    const vaporPressure =
        (relativeHumidity / 100) * saturationVaporPressure;

    // Absolute humidity (g/m³)
    return (216.7 * vaporPressure) / (temperatureC + 273.15);
}




function minuteBucket(ts: number) {
  return Math.floor(ts / ONE_MINUTE_MS) * ONE_MINUTE_MS;
}


// Backend row shape (minimal fields we use)
type DbRow = {
  ts: string;                // ISO string
  received_at?: string;      // ISO
  device_id?: string;

  sensor_mac?: string | null;

  // Power meter fields
  act_power?: number | null;

  // Environment fields
  temperature?: number | null;
  humidity?: number | null;
  battery?: number | null;
};

function normalizeMeasurements(rows: DbRow[]): UnifiedPoint[] {
  const sorted = [...rows].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  const buckets = new Map<number, UnifiedPoint>();

  let lastEnergy = 0;

  // hold last-known env values per sensor so lines don’t drop to undefined
  let lastT1: number | undefined;
  let lastH1: number | undefined;
  let lastT2: number | undefined;
  let lastH2: number | undefined;

  for (const r of sorted) {
    const rawTsMs = Date.parse(r.ts); // ts is TIMESTAMPTZ -> ISO string
    const minuteTs = minuteBucket(rawTsMs);

    let p = buckets.get(minuteTs);
    if (!p) {
      p = {
        ts: minuteTs,
        timeLabel: new Date(minuteTs).toLocaleTimeString(),
      };
      buckets.set(minuteTs, p);
    }

    // --- Environment: route by sensor_mac ---
    const mac = (r.sensor_mac ?? "").toLowerCase();

    if (mac === SENSOR1) {
      if (typeof r.temperature === "number") lastT1 = r.temperature;
      if (typeof r.humidity === "number") lastH1 = r.humidity;
    } else if (mac === SENSOR2) {
      if (typeof r.temperature === "number") lastT2 = r.temperature;
      if (typeof r.humidity === "number") lastH2 = r.humidity;
    }

    if (lastT1 !== undefined) p.temperature1 = lastT1;
    if (lastH1 !== undefined) p.humidity1 = lastH1;
    if (lastT2 !== undefined) p.temperature2 = lastT2;
    if (lastH2 !== undefined) p.humidity2 = lastH2;

    // --- Power meter ---
    if (typeof r.act_power === "number") {
      p.power = r.act_power;

      // you were assuming power points every 5s; we keep that assumption
      lastEnergy += r.act_power * (5 / 3600);
      p.energy = Number(lastEnergy.toFixed(2));

      p.strompreis =
        (p.power / 1000) *
        STROMPREIS_CHF *
        ZEITRAUM *
        STUNDEN_PRO_JAHR *
        GLEICHZEITIGKEIT;
    }

    // --- Derived metrics (need sensor 1 + sensor 2 + power) ---
    if (
      p.power !== undefined &&
      p.temperature1 !== undefined &&
      p.humidity1 !== undefined &&
      p.temperature2 !== undefined &&
      p.humidity2 !== undefined
    ) {
      // Input (sensor 1)
      const prozessLuft = {
        VOLUMENSTROM: 50, // m^3 / h
        DICHTE: 1.12,     // kg/m^3
        TEMPERATUR: p.temperature1,
        RELATIVE_HUMIDITY: p.humidity1,
      };
      const abs1 = calculateAbsoluteHumidity(prozessLuft.TEMPERATUR, prozessLuft.RELATIVE_HUMIDITY);
      const wasser1 = prozessLuft.VOLUMENSTROM * prozessLuft.DICHTE * abs1 / 1000;

      // Output (sensor 2)
      const trockenLuft = {
        VOLUMENSTROM: 50,
        DICHTE: 1.12,
        TEMPERATUR: p.temperature2,
        RELATIVE_HUMIDITY: p.humidity2,
      };
      const abs2 = calculateAbsoluteHumidity(trockenLuft.TEMPERATUR, trockenLuft.RELATIVE_HUMIDITY);
      const wasser2 = trockenLuft.VOLUMENSTROM * trockenLuft.DICHTE * abs2 / 1000;

      p.differenz_wasserinhalt = Math.abs(wasser1 - wasser2);
      p.entfeuchtungseffizienz = p.differenz_wasserinhalt / (p.power / 1000);
    }
  }

  const now = Date.now();
  return Array.from(buckets.values()).filter((p) => p.ts >= now - WINDOW_MS);
}


export default function App() {
  const [data, setData] = useState<UnifiedPoint[]>([]);

  console.log(data)
  
  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch("https://plan-peak-backendnew.vercel.app/measurements");
      const json = await res.json();
      const normalized = normalizeMeasurements(json.measurements);
      setData(normalized);
    };

    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, []);


  return (
    <div style={{ padding: 20 }}>
      <h1>Qubiq Demo</h1>
      {/* POWER */}
      <h2>Power (W)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" W" />
          <Tooltip formatter={(value, name, props) => value}/>
          <Line type="monotone"
           dataKey="power" 
           name="Power"
           stroke="#ffce0bff"
            dot={false}
            
            />
        </LineChart>
      </ResponsiveContainer>

      <h2>Energiekosten ({ZEITRAUM} Jahre)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" CHF" />
          <Tooltip 
            formatter={(value, name, props) => (value ? Math.round(value) : 0) + " CHF"}
          />
          <Line type="monotone" name="Energiekosten" dataKey="strompreis" stroke="#1900ffff" dot={false} />
        </LineChart>
      </ResponsiveContainer>

      <h2>Entfeuchtungseffizienz (kg/kWh)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" kg/kWh" />
          <Tooltip 
            formatter={(value, name, props) => Math.round(value*100)/100}
          />
          <Line type="monotone" name="Entfeuchtungseffizienz" dataKey="entfeuchtungseffizienz" stroke="#1bad3dff" dot={false} />
        </LineChart>
      </ResponsiveContainer>

      <h2>Differenz Wasserinhalt (kg/h)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" kg/h" />
          <Tooltip 
            formatter={(value, name, props) => Math.round(value*1000)/1000}
          />
          <Line type="monotone" name="Differenz Wasserinhalt" dataKey="differenz_wasserinhalt" stroke="#1f10f1ff" dot={false} />
        </LineChart>
      </ResponsiveContainer>


      {/* TEMPERATURE */}
      <h2>Temperature (°C)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" °C" />
          <Tooltip 
              formatter={(value, name, props) => value + "°C"}

          />
          <Line
            type="monotone"
            dataKey="temperature1"
            stroke="#ff7300"
            name="Temperatur (H&T 1)"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* HUMIDITY */}
      <h2>Relative Luftfeuchtigkeit (%) (H&T 1)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" %" domain={[30, 80]} />
          <Tooltip 
            formatter={(value, name, props) => value + "%"}

          />
          <Line
            type="monotone"
            dataKey="humidity1"
            stroke="#0088FE"
            name="Luftfeuchtigkeit"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
