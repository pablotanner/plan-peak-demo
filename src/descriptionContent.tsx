import ReactMarkdown from "react-markdown";

// Paste your description as plain Markdown here.
const MARKDOWN = `
## Anleitung – Messplattform zur Leistungs- und Wirtschaftlichkeitsbewertung von Entfeuchtungsgeräten

Diese Webplattform dient der **technischen und wirtschaftlichen Echtzeitbewertung von Entfeuchtungsgeräten** im Betrieb. Sie ermöglicht sowohl den **direkten Vergleich zweier Geräte** als auch die **Analyse eines einzelnen Geräts innerhalb des Systems**.

Die Berechnungen basieren auf gemessenen Luftzuständen (Temperatur, relative Feuchte), Volumenströmen sowie elektrischer Leistungsaufnahme.

---

## 1️⃣ Betriebsart: Vergleich von zwei Geräten

### Messaufbau

Für jedes Gerät werden zwei Luftströme erfasst:

**Gerät 1**

* Fühler 1 → Prozessluft
* Fühler 2 → Trockenluft
* Messklemme A → elektrische Leistung

**Gerät 2**

* Fühler 3 → Prozessluft
* Fühler 4 → Trockenluft
* Messklemme B → elektrische Leistung

Die Temperatur- und Feuchtesensoren werden direkt in die jeweiligen Luftkanäle eingebunden.
Die Strommessklemmen werden um einen Aussenleiter montiert und erfassen Strom, Spannung und daraus die elektrische Leistung.

---

## Berechnete und dargestellte Kennwerte

Die Plattform zeigt folgende Werte in Echtzeit an:

### Elektrische Leistung

**Power (W)**
Momentane elektrische Leistungsaufnahme des Geräts.

---

### Energiekosten

**Energiekosten auf 20 Jahre (CHF)**
Hochrechnung basierend auf:

* gemessener Leistung
* hinterlegtem Strompreis (CHF/kWh)
* definierter Gleichzeitigkeit (GLZ)

GLZ = 1 entspricht 8'760 Betriebsstunden pro Jahr.

---

### Entfeuchtungseffizienz

**Entfeuchtungseffizienz (kg/kWh)**
Verhältnis zwischen entzogener Wassermenge und eingesetzter Energie.
Direkter Effizienzindikator für den Gerätevergleich.

---

### Wasserentzugsrate

**Differenz Wasserinhalt Prozessluft → Trockenluft (kg/h)**
Tatsächlich entzogene Wassermenge pro Stunde.
Berechnung erfolgt über:

* Volumenstrom
* Differenz der absoluten Feuchte

---

### Luftzustände (Messdaten)

Für jeden Messpunkt werden angezeigt:

* Temperatur (°C)
* Relative Feuchtigkeit (% r.F.)
* Absolute Feuchtigkeit (g/kg trockene Luft)

Diese Werte bilden die Grundlage aller weiteren Berechnungen.

---

## 2️⃣ Betriebsart: Einzelgerät-Analyse

Wird nur ein Gerät bewertet, können Fühler 3 und 4 frei im System positioniert werden.

Beispiele:

* Nassluft
* Nach Wärmetauscher
* Umluftbereich
* Prozessinterne Zonen

Diese Variante dient der **thermodynamischen Prozessanalyse** und erlaubt die Beobachtung von Temperatur- und Feuchteverläufen innerhalb des Systems.

---

## Manuelle Eingaben in der Weboberfläche

Für eine korrekte Bewertung sind folgende Parameter einzugeben:

* Volumenstrom Prozessluft (m³/h)
* Volumenstrom Trockenluft (m³/h)
* Strompreis (CHF/kWh)
* Gleichzeitigkeit (GLZ)

Die Gleichzeitigkeit definiert die jährliche Laufzeit des Geräts:
Betriebsstunden = GLZ × 8'760

---

## Ziel der Plattform

Die Anwendung ermöglicht:

* Objektiven Vergleich zweier Geräte
* Bewertung der realen Entfeuchtungsleistung
* Effizienzvergleich (kg/kWh)
* Transparente Kostenbewertung über 20 Jahre
* Analyse einzelner Prozessbereiche
* Datengestützte Entscheidungsgrundlage für Investitionen

---

## Voraussetzungen für valide Ergebnisse

* Korrekte Sensorplatzierung
* Kalibrierte Fühler
* Verlässliche Volumenstromwerte
* Vergleichbare Betriebsbedingungen
* Fachgerechte Montage der Strommessklemmen

---

Die Plattform liefert damit eine technisch fundierte und wirtschaftlich transparente Entscheidungsbasis für Auswahl, Optimierung und Bewertung von Entfeuchtungssystemen im Realbetrieb.
`;

export function DescriptionContent() {
  return <ReactMarkdown>{MARKDOWN}</ReactMarkdown>;
}