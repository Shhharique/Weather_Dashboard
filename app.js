// ====== Configuration ======
const OWM_API_KEY = "0d81b15d906e83ac183e67fa5465db3f"; // Required API key
const DEFAULT_QUERY = "Mango, Jharkhand";    // Fallback city
const USE_ONECALL = false;                   // Set true to try One Call UVI (if subscribed)

// Endpoints
const OWM_GEO = "https://api.openweathermap.org/geo/1.0/direct";
const OWM_CURRENT = "https://api.openweathermap.org/data/2.5/weather";
const OWM_FORECAST = "https://api.openweathermap.org/data/2.5/forecast";
const OWM_ONECALL = "https://api.openweathermap.org/data/3.0/onecall";

// ====== Utilities ======
function msToKmh(ms){ return Math.round(ms * 3.6); }
function fmt(n, unit=""){ if (n==null || Number.isNaN(n)) return "—"; const r = Math.round(n*10)/10; return unit?`${r} ${unit}`:`${r}`; }

// Map OWM condition id to UI theme and emoji
function themeFromId(id){
  if (id===800) return { theme:"clear", icon:"☀️", text:"Clear sky" };
  const g = Math.floor(id/100);
  if (g===2) return { theme:"thunder", icon:"⛈️", text:"Thunderstorm" };
  if (g===3) return { theme:"rain", icon:"🌦️", text:"Drizzle" };
  if (g===5) return { theme:"rain", icon:"🌧️", text:"Rain" };
  if (g===6) return { theme:"snow", icon:"🌨️", text:"Snow" };
  if (g===7) return { theme:"fog", icon:"🌫️", text:"Atmosphere" };
  if (g===8) return { theme:"clouds", icon:"⛅", text:"Clouds" };
  return { theme:"clouds", icon:"⛅", text:"Clouds" };
}

function setThemeById(id){ document.body.dataset.theme = themeFromId(id).theme; }

function formatOffsetLabel(offsetSec){
  const sign = offsetSec>=0?"+":"-";
  const abs = Math.abs(offsetSec);
  const hh = String(Math.floor(abs/3600)).padStart(2,"0");
  const mm = String(Math.floor((abs%3600)/60)).padStart(2,"0");
  return `GMT${sign}${hh}:${mm}`;
}

function localNowForOffset(offsetSec){
  const now = Date.now();
  const localOffsetMs = new Date().getTimezoneOffset()*60000;
  return new Date(now + offsetSec*1000 + localOffsetMs);
}

function dateLabelFromUTC(utcSeconds, offsetSec){
  const d = new Date((utcSeconds + offsetSec) * 1000);
  return d.toLocaleDateString(undefined, { weekday:"short", day:"2-digit", month:"short" });
}

// ====== API calls ======
async function geocodeCity(q){
  const url = new URL(OWM_GEO);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "1");
  url.searchParams.set("appid", OWM_API_KEY);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  if (!data || data.length===0) throw new Error("No matches found");
  const g = data[0];
  return { name: g.name, state: g.state, country: g.country, lat: g.lat, lon: g.lon };
}

async function fetchCurrent(lat, lon){
  const url = new URL(OWM_CURRENT);
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  url.searchParams.set("appid", OWM_API_KEY);
  url.searchParams.set("units", "metric");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Current weather failed");
  return await res.json();
}

async function fetchForecast(lat, lon){
  const url = new URL(OWM_FORECAST);
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  url.searchParams.set("appid", OWM_API_KEY);
  url.searchParams.set("units", "metric");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Forecast failed");
  return await res.json();
}

async function fetchUVI(lat, lon){
  if (!USE_ONECALL) return null;
  const url = new URL(OWM_ONECALL);
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  url.searchParams.set("appid", OWM_API_KEY);
  url.searchParams.set("units", "metric");
  url.searchParams.set("exclude", "minutely,hourly,alerts");
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.json();
}

// ====== Renderers ======
function renderCurrent(placeLabel, cur, uviDaily0){
  const loc = document.getElementById("loc");
  const tlabel = document.getElementById("time");
  const temp = document.getElementById("temp");
  const icon = document.getElementById("icon");
  const summary = document.getElementById("summary");
  const chips = document.getElementById("chips");
  const facts = document.getElementById("facts");

  const id = cur.weather?.[0]?.id ?? 801;
  const theming = themeFromId(id);
  setThemeById(id);

  loc.textContent = placeLabel;
  const offset = cur.timezone ?? 0;
  const nowThere = localNowForOffset(offset);
  tlabel.textContent = `${nowThere.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })} • ${formatOffsetLabel(offset)}`;

  temp.textContent = cur.main?.temp!=null ? `${Math.round(cur.main.temp)}°C` : "--°C";
  icon.textContent = theming.icon;
  summary.textContent = cur.weather?.[0]?.description ? cur.weather[0].description : theming.text;

  chips.innerHTML = "";
  const chipData = [
    { k:"Feels", v: cur.main?.feels_like!=null ? `${Math.round(cur.main.feels_like)}°C` : "—" },
    { k:"Humidity", v: cur.main?.humidity!=null ? `${cur.main.humidity}%` : "—" },
    { k:"Cloud", v: cur.clouds?.all!=null ? `${cur.clouds.all}%` : "—" },
    { k:"UV max", v: (uviDaily0?.uvi!=null ? Math.round(uviDaily0.uvi) : "—") }
  ];
  chipData.forEach(({k,v})=>{
    const el = document.createElement("div");
    el.className = "chip";
    el.textContent = `${k}: ${v}`;
    chips.appendChild(el);
  });

  const precipMm = (cur.rain?.["1h"] ?? cur.rain?.["3h"] ?? 0) + (cur.snow?.["1h"] ?? cur.snow?.["3h"] ?? 0);
  const windKmh = cur.wind?.speed!=null ? msToKmh(cur.wind.speed) : null;

  const factRows = [
    ["Wind", windKmh!=null ? `${fmt(windKmh,"km/h")}` : "—"],
    ["Pressure", cur.main?.pressure!=null ? fmt(cur.main.pressure,"hPa") : "—"],
    ["Visibility", cur.visibility!=null ? fmt(cur.visibility/1000,"km") : "—"],
    ["Precipitation", fmt(precipMm,"mm")]
  ];
  facts.innerHTML = factRows.map(([k,v])=>`<div class="fact"><span>${k}</span><b>${v}</b></div>`).join("");
}

function groupForecastDaily(fc){
  const tz = fc.city?.timezone ?? 0; // seconds
  const days = new Map();
  for (const item of fc.list){
    const dayKey = dateLabelFromUTC(item.dt, tz);
    const bucket = days.get(dayKey) || { temps:[], rain:0, snow:0, windMax:0, ids:[], mains:[] };
    bucket.temps.push(item.main?.temp);
    const r = item.rain?.["3h"] ?? 0; const s = item.snow?.["3h"] ?? 0;
    bucket.rain += r; bucket.snow += s;
    const w = item.wind?.speed ?? 0; if (w>bucket.windMax) bucket.windMax = w;
    const id = item.weather?.[0]?.id; if (id!=null) bucket.ids.push(id);
    const m = item.weather?.[0]?.main; if (m) bucket.mains.push(m);
    days.set(dayKey, bucket);
  }
  const out = [];
  for (const [label, b] of days.entries()){
    const tmin = Math.min(...b.temps.filter(v=>v!=null));
    const tmax = Math.max(...b.temps.filter(v=>v!=null));
    // pick most frequent id
    const id = b.ids.sort((a,bid)=> b.ids.filter(v=>v===a).length - b.ids.filter(v=>v===bid).length)[0] ?? 801;
    const theme = themeFromId(id);
    out.push({
      label,
      icon: theme.icon,
      text: (b.mains[0] ?? theme.text),
      tmin: Math.round(tmin),
      tmax: Math.round(tmax),
      rainMm: Math.round((b.rain + b.snow) || 0),
      windKmh: Math.round(msToKmh(b.windMax))
    });
  }
  // keep next 5 unique day labels from now
  return out.slice(0,5);
}

function renderForecast(fc){
  const el = document.getElementById("forecast");
  const days = groupForecastDaily(fc);
  el.innerHTML = days.map(d => `
    <div class="day">
      <div class="d">${d.label}</div>
      <div class="i">${d.icon}</div>
      <div class="t">${d.tmin}° / ${d.tmax}°</div>
      <div class="subtle">Rain: ${d.rainMm} mm</div>
      <div class="subtle">Wind: ${d.windKmh} km/h</div>
      <div class="subtle">${d.text}</div>
    </div>
  `).join("");
}

function setStatus(msg, type=""){ const el=document.getElementById("status"); el.textContent=msg||""; el.className="status "+(type||""); }

// ====== Orchestration ======
async function loadByCity(query){
  try{
    setStatus("Resolving city…","subtle");
    const g = await geocodeCity(query);
    await loadByCoords(g.lat, g.lon, [g.name, g.state, g.country].filter(Boolean).join(", "));
  }catch(err){ console.error(err); setStatus(err.message || "Something went wrong","error"); }
}

async function loadByCoords(lat, lon, labelOverride){
  try{
    setStatus("Fetching weather…","subtle");
    const [cur, fc, uvi] = await Promise.all([
      fetchCurrent(lat, lon), fetchForecast(lat, lon), fetchUVI(lat, lon)
    ]);
    const place = labelOverride || `${cur.name || "—"}${cur.sys?.country ? ", "+cur.sys.country : ""}`;
    renderCurrent(place, cur, uvi?.daily?.[0]);
    renderForecast(fc);
    setStatus("");
  }catch(err){ console.error(err); setStatus(err.message || "Something went wrong","error"); }
}

// ====== Event wiring ======
document.getElementById("searchForm").addEventListener("submit", (e)=>{
  e.preventDefault();
  const q = document.getElementById("q").value.trim();
  if (q) loadByCity(q);
});
document.getElementById("useLoc").addEventListener("click", ()=>{
  if (!navigator.geolocation){ loadByCity(DEFAULT_QUERY); return; }
  setStatus("Locating…","subtle");
  navigator.geolocation.getCurrentPosition(
    (pos)=> loadByCoords(pos.coords.latitude, pos.coords.longitude, "Current Location"),
    ()=> loadByCity(DEFAULT_QUERY),
    { enableHighAccuracy:false, timeout:8000, maximumAge:60000 }
  );
});

// Initial load: try geolocation, fallback to default city
if (navigator.geolocation){
  navigator.geolocation.getCurrentPosition(
    (pos)=> loadByCoords(pos.coords.latitude, pos.coords.longitude, "Current Location"),
    ()=> loadByCity(DEFAULT_QUERY),
    { enableHighAccuracy:false, timeout:8000, maximumAge:60000 }
  );
}else{
  loadByCity(DEFAULT_QUERY);
}
