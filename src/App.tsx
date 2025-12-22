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

// sensor gives different data at different times:
// time, humidity, temperature every 1 minute
// time, power, energy every 5 seconds
type UnifiedPoint = {
  ts: number;
  timeLabel: string;
  power?: number;
  energy?: number;
  temperature?: number;
  humidity?: number;
  strompreis?: number; 
  differenz_wasserinhalt?: number; // kg/h
  entfeuchtungseffizienz?: number;  // in kg/kWh
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

function normalizeMeasurements(measurements: any[]): UnifiedPoint[] {
  const sorted = [...measurements].sort((a, b) => {
    const ta = a.data.timestamp ?? Date.parse(a.receivedAt);
    const tb = b.data.timestamp ?? Date.parse(b.receivedAt);
    return ta - tb;
  });

  let lastTemp: number | undefined;
  let lastHum: number | undefined;
  let lastEnergy = 0;

  // minuteTs → UnifiedPoint
  const buckets = new Map<number, UnifiedPoint>();

  for (const m of sorted) {
    const rawTs =
      typeof m.data.timestamp === "number"
        ? m.data.timestamp
        : Date.parse(m.receivedAt);

    const minuteTs = minuteBucket(rawTs);

    let p = buckets.get(minuteTs);
    if (!p) {
      p = {
        ts: minuteTs,
        timeLabel: new Date(minuteTs).toLocaleTimeString()
      };
      buckets.set(minuteTs, p);
    }

    
    /* ---------- TEMP / HUM (slow, 1/min) ---------- */
    if (typeof m.data.temperature === "number") {
      lastTemp = m.data.temperature;
    }
    if (typeof m.data.humidity === "number") {
      lastHum = m.data.humidity;
    }

    if (lastTemp !== undefined) p.temperature = lastTemp;
    if (lastHum !== undefined) p.humidity = lastHum;

    /* ---------- POWER / ENERGY (fast) ---------- */
    if (m.data.em) {
      p.power = m.data.em.act_power;

      lastEnergy += m.data.em.act_power * (5 / 3600);
      p.energy = Number(lastEnergy.toFixed(2));

      p.strompreis =
        (p.power / 1000) *
        STROMPREIS_CHF *
        ZEITRAUM *
        STUNDEN_PRO_JAHR *
        GLEICHZEITIGKEIT;

      // Input
      const prozessLuft = {
        VOLUMENSTROM: 50, // m^3 / h
        DICHTE: 1.12, // kg/m^3
        // Temperatur vor maschine
        TEMPERATUR: p.temperature,
        RELATIVE_HUMIDITY: p.humidity,
        ABSOLUTE_HUMIDITY: calculateAbsoluteHumidity(p.temperature, p.humidity),
        WASSERINHALT: undefined // kg/h
      }
      prozessLuft.WASSERINHALT = prozessLuft.VOLUMENSTROM * prozessLuft.DICHTE * prozessLuft.ABSOLUTE_HUMIDITY / 1000

    
      const X_trockenLuftTemp = p.temperature;
      const X_humidity = p.humidity - 10;
      // Output
      const trockenLuft = {
        VOLUMENSTROM: 50, // m^3 / h
        DICHTE: 1.12, // kg/m^3
        // Temperatur nach der Maschine
        TEMPERATUR: X_trockenLuftTemp,
        RELATIVE_HUMIDITY: X_humidity,
        ABSOLUTE_HUMIDITY: calculateAbsoluteHumidity(X_trockenLuftTemp, X_humidity),
        WASSERINHALT: undefined // kg/h
      }
      trockenLuft.WASSERINHALT = trockenLuft.VOLUMENSTROM * trockenLuft.DICHTE * trockenLuft.ABSOLUTE_HUMIDITY / 1000

      p.differenz_wasserinhalt = Math.abs(prozessLuft.WASSERINHALT - trockenLuft.WASSERINHALT)

      p.entfeuchtungseffizienz = p.differenz_wasserinhalt / (p.power / 1000)


    }

  }

  const now = Date.now();

  return Array.from(buckets.values()).filter(
    (p) => p.ts >= now - WINDOW_MS
  );
}

export default function App() {
  const [data, setData] = useState<UnifiedPoint[]>([]);

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


  console.log(data)

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
            dataKey="temperature"
            stroke="#ff7300"
            name="Temperatur"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* HUMIDITY */}
      <h2>Relative Luftfeuchtigkeit (%)</h2>
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
            dataKey="humidity"
            stroke="#0088FE"
            name="Luftfeuchtigkeit"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
