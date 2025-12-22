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

type UnifiedPoint = {
  ts: number;
  timeLabel: string;
  power?: number;
  energy?: number;
  temperature?: number;
  humidity?: number;
};

function normalizeMeasurements(measurements: any[]): UnifiedPoint[] {
  const sorted = [...measurements].sort((a, b) => {
    const ta = a.data.timestamp ?? Date.parse(a.receivedAt);
    const tb = b.data.timestamp ?? Date.parse(b.receivedAt);
    return ta - tb;
  });

  let lastTemp: number | undefined;
  let lastHum: number | undefined;
  let lastEnergy = 0;

  const out: UnifiedPoint[] = [];

  for (const m of sorted) {
    const ts =
      typeof m.data.timestamp === "number"
        ? m.data.timestamp
        : Date.parse(m.receivedAt);

    const p: UnifiedPoint = {
      ts,
      timeLabel: new Date(ts).toLocaleTimeString(),
    };

    if (m.data.em) {
      p.power = m.data.em.act_power;
      lastEnergy += m.data.em.act_power * (5 / 3600);
      p.energy = Number(lastEnergy.toFixed(2));
    }

    if (typeof m.data.temperature === "number") lastTemp = m.data.temperature;
    if (typeof m.data.humidity === "number") lastHum = m.data.humidity;

    if (lastTemp !== undefined) p.temperature = lastTemp;
    if (lastHum !== undefined) p.humidity = lastHum;

    out.push(p);
  }

  return out.slice(-300); // keep last ~25 minutes
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
      <h1>Shelly Live Dashboard</h1>

      {/* POWER */}
      <h2>Power (W)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" W" />
          <Tooltip />
          <Line type="monotone" dataKey="power" stroke="#8884d8" dot={false} />
        </LineChart>
      </ResponsiveContainer>

      {/* ENERGY */}
      <h2>Energy (Wh)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" Wh" />
          <Tooltip />
          <Line type="monotone" dataKey="energy" stroke="#82ca9d" dot={false} />
        </LineChart>
      </ResponsiveContainer>

      {/* TEMPERATURE */}
      <h2>Temperature (°C)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" °C" />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="temperature"
            stroke="#ff7300"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* HUMIDITY */}
      <h2>Humidity (%)</h2>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timeLabel" />
          <YAxis unit=" %" domain={[30, 80]} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="humidity"
            stroke="#0088FE"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
