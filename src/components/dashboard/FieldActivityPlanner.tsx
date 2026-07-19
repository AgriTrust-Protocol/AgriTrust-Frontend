"use client";

import { useEffect, useMemo, useState } from "react";
import { type ActivityType, type FieldTask, type TaskInput, type TaskStatus, useTasks } from "@/src/hooks/useTasks";

type CalendarView = "Month" | "Week" | "Day";
type WeatherDay = { date: string; temperature: number; precipitation: number; wind: number; condition: string };

const fields = ["North Field", "River Plot", "Orchard Block", "South Pasture"];
const assignees = ["Maya Chen", "Jon Bell", "Amina Yusuf", "Luis Rivera"];
const activityTypes: ActivityType[] = ["Irrigation", "Fertilization", "Pest control", "Harvest", "Scouting"];
const statusStyles: Record<TaskStatus, string> = {
  Planned: "bg-slate-100 text-slate-700", Assigned: "bg-blue-100 text-blue-700", InProgress: "bg-amber-100 text-amber-800", Completed: "bg-emerald-100 text-emerald-800", Cancelled: "bg-rose-100 text-rose-700",
};

const demoTasks: FieldTask[] = [
  { id: "demo-1", title: "Irrigate North Field", field_id: "North Field", activity_type: "Irrigation", assignee_id: "maya", assignee_name: "Maya Chen", start: "2026-07-17T08:00", end: "2026-07-17T11:00", status: "Assigned", weather_dependency: true },
  { id: "demo-2", title: "Orchard pest check", field_id: "Orchard Block", activity_type: "Pest control", assignee_id: "jon", assignee_name: "Jon Bell", start: "2026-07-18T09:00", end: "2026-07-18T11:00", status: "Planned", weather_dependency: false },
  { id: "demo-3", title: "Apply compost", field_id: "River Plot", activity_type: "Fertilization", assignee_id: "amina", assignee_name: "Amina Yusuf", start: "2026-07-21T07:00", end: "2026-07-21T12:00", status: "InProgress", weather_dependency: true },
];

function localDate(value: Date) { return value.toISOString().slice(0, 10); }
function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function prettyDate(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00`)); }

export function FieldActivityPlanner() {
  const [view, setView] = useState<CalendarView>("Month");
  const [cursor, setCursor] = useState(() => new Date("2026-07-17T12:00"));
  const [selectedDate, setSelectedDate] = useState("2026-07-17");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: "", field_id: fields[0], activity_type: "Irrigation" as ActivityType, assignee_name: assignees[0], start: "2026-07-17T08:00", end: "2026-07-17T10:00", notes: "", weather_dependency: true });
  const [weather, setWeather] = useState<WeatherDay[]>([]);
  const { tasks: apiTasks, isError, createTask, updateTask } = useTasks();
  const tasks = apiTasks.length ? apiTasks : demoTasks;

  useEffect(() => {
    let active = true;
    fetch("/api/v1/weather/forecast?days=7")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: WeatherDay[]) => { if (active) setWeather(data); })
      .catch(() => { if (active) setWeather(Array.from({ length: 7 }, (_, index) => ({ date: localDate(addDays(new Date("2026-07-17T12:00"), index)), temperature: 25 + (index % 3), precipitation: index === 1 ? 68 : index === 4 ? 42 : 8, wind: 12 + index, condition: index === 1 ? "Rain" : "Partly cloudy" }))); });
    return () => { active = false; };
  }, []);

  const days = useMemo(() => {
    if (view === "Day") return [cursor];
    if (view === "Week") { const monday = new Date(cursor); monday.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7)); return Array.from({ length: 7 }, (_, i) => addDays(monday, i)); }
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor, view]);
  const todayTasks = tasks.filter((task) => task.start.slice(0, 10) === "2026-07-17" && task.status !== "Cancelled");

  function openTaskModal(date: string) { setSelectedDate(date); setForm((current) => ({ ...current, start: `${date}T08:00`, end: `${date}T10:00` })); setShowModal(true); }
  function submitTask(event: React.FormEvent) {
    event.preventDefault();
    const input: TaskInput = { ...form, assignee_id: form.assignee_name.toLowerCase().replaceAll(" ", "-"), status: form.assignee_name ? "Assigned" : "Planned" };
    createTask.mutate(input, { onSuccess: () => setShowModal(false) });
  }
  function moveTask(task: FieldTask, date: string) {
    const duration = new Date(task.end).getTime() - new Date(task.start).getTime();
    const nextStart = `${date}T${task.start.slice(11)}`;
    updateTask.mutate({ id: task.id, changes: { start: nextStart, end: new Date(new Date(nextStart).getTime() + duration).toISOString().slice(0, 16) } });
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Operations</p><h1 className="mt-1 text-3xl font-bold text-zinc-900 dark:text-white">Field activity planner</h1><p className="mt-1 text-sm text-zinc-500">Coordinate crews, field work, and weather-sensitive tasks.</p></div>
      <button onClick={() => openTaskModal(selectedDate)} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800">+ Create activity</button>
    </div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_290px]">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2"><button aria-label="Previous period" onClick={() => setCursor(addDays(cursor, view === "Month" ? -30 : view === "Week" ? -7 : -1))} className="rounded-md border px-2 py-1 hover:bg-zinc-50">‹</button><button onClick={() => setCursor(new Date("2026-07-17T12:00"))} className="rounded-md border px-3 py-1 text-sm hover:bg-zinc-50">Today</button><button aria-label="Next period" onClick={() => setCursor(addDays(cursor, view === "Month" ? 30 : view === "Week" ? 7 : 1))} className="rounded-md border px-2 py-1 hover:bg-zinc-50">›</button><h2 className="ml-2 font-semibold">{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(cursor)}</h2></div>
          <div className="flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">{(["Month", "Week", "Day"] as CalendarView[]).map((item) => <button key={item} onClick={() => setView(item)} className={`rounded-md px-3 py-1.5 text-sm ${view === item ? "bg-white font-semibold shadow-sm dark:bg-zinc-800" : "text-zinc-500"}`}>{item}</button>)}</div>
        </div>
        <div className={`grid ${view === "Month" ? "grid-cols-7" : view === "Week" ? "grid-cols-7" : "grid-cols-1"}`}>
          {days.map((day, index) => { const date = localDate(day); const dailyTasks = tasks.filter((task) => task.start.slice(0, 10) === date); return <div key={date} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const task = tasks.find((item) => item.id === event.dataTransfer.getData("task")); if (task) moveTask(task, date); }} onClick={() => openTaskModal(date)} className={`min-h-32 border-b border-r border-zinc-100 p-2 dark:border-zinc-900 ${view === "Month" && day.getMonth() !== cursor.getMonth() ? "bg-zinc-50/80 text-zinc-400 dark:bg-zinc-950" : ""} ${date === selectedDate ? "bg-emerald-50/40 dark:bg-emerald-950/10" : ""}`}>
            {(view === "Month" ? index < 7 : true) && <p className="mb-2 text-xs font-medium text-zinc-500">{view !== "Month" && new Intl.DateTimeFormat("en", { weekday: "short" }).format(day) + " · "}<span className={date === "2026-07-17" ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-700 text-white" : ""}>{day.getDate()}</span></p>}
            <div className="space-y-1">{dailyTasks.map((task) => <button draggable key={task.id} onDragStart={(event) => event.dataTransfer.setData("task", task.id)} onClick={(event) => event.stopPropagation()} className={`block w-full cursor-grab truncate rounded px-2 py-1 text-left text-xs font-medium ${statusStyles[task.status]}`} title={`${task.title} — drag to reschedule`}>{task.weather_dependency && "☁ "}{task.title}</button>)}</div>
          </div>; })}
        </div>
        <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-900">Click a day to create an activity. Drag an activity to another day to reschedule it.</p>
      </section>
      <aside className="space-y-5">
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"><div className="flex items-center justify-between"><h2 className="font-semibold">7-day weather</h2><span className="text-xs text-zinc-500">Forecast</span></div><div className="mt-3 space-y-3">{weather.map((day) => <div key={day.date} className="flex items-center justify-between text-sm"><div><p className="font-medium">{prettyDate(day.date)}</p><p className="text-xs text-zinc-500">{day.condition} · {day.wind} km/h</p></div><div className="text-right"><p className="font-semibold">{day.temperature}°C</p><p className={day.precipitation >= 40 ? "text-xs font-semibold text-amber-700" : "text-xs text-zinc-500"}>{day.precipitation}% rain</p></div></div>)}</div><p className="mt-4 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Weather alert: rain may affect outdoor work this weekend.</p></section>
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"><div className="flex items-center justify-between"><h2 className="font-semibold">Today&apos;s tasks</h2><span className="text-xs text-zinc-500">{todayTasks.length} scheduled</span></div><div className="mt-3 space-y-3">{todayTasks.map((task) => <label key={task.id} className="flex cursor-pointer gap-2 text-sm"><input type="checkbox" checked={task.status === "Completed"} onChange={() => updateTask.mutate({ id: task.id, changes: { status: task.status === "Completed" ? "InProgress" : "Completed" } })} className="mt-1 h-4 w-4 accent-emerald-700"/><span><span className="block font-medium">{task.title}</span><span className="text-xs text-zinc-500">{task.assignee_name} · {task.start.slice(11)}</span></span></label>)}</div></section>
      </aside>
    </div>
    {isError && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Tasks could not be synced. You are viewing the current planning board.</p>}
    {showModal && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><form onSubmit={submitTask} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-950"><div className="flex items-start justify-between"><div><h2 className="text-xl font-bold">Schedule field activity</h2><p className="text-sm text-zinc-500">Assign a crew member and set the timing.</p></div><button type="button" onClick={() => setShowModal(false)} className="text-xl text-zinc-500">×</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2 text-sm font-medium">Activity title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Inspect irrigation lines" className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-normal"/></label><Select label="Field" value={form.field_id} onChange={(field_id) => setForm({ ...form, field_id })} options={fields}/><Select label="Activity type" value={form.activity_type} onChange={(activity_type) => setForm({ ...form, activity_type: activity_type as ActivityType })} options={activityTypes}/><Select label="Assignee" value={form.assignee_name} onChange={(assignee_name) => setForm({ ...form, assignee_name })} options={assignees}/><label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={form.weather_dependency} onChange={(e) => setForm({ ...form, weather_dependency: e.target.checked })} className="h-4 w-4 accent-emerald-700"/>Weather dependent</label><label className="text-sm font-medium">Start<input type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-normal"/></label><label className="text-sm font-medium">End<input type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-normal"/></label><label className="sm:col-span-2 text-sm font-medium">Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 min-h-20 w-full rounded-lg border border-zinc-300 px-3 py-2 font-normal" placeholder="Instructions for the field team"/></label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setShowModal(false)} className="rounded-lg px-4 py-2 text-sm font-semibold">Cancel</button><button disabled={createTask.isPending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{createTask.isPending ? "Scheduling…" : "Schedule activity"}</button></div></form></div>}
  </div>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly string[] }) {
  return <label className="text-sm font-medium">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-normal dark:bg-zinc-900">{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
