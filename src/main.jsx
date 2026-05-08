import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Clock,
  Dumbbell,
  GripVertical,
  History,
  KeyRound,
  ListPlus,
  LogOut,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Timer,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import "./styles.css";

const DEFAULT_SESSION_PLANS = [
  {
    id: "plan-chest-arms",
    name: "Chest and Arms",
    focus: "Upper body",
    schedule: "3 days / week",
    notes: "Pressing, curls, triceps, and a short finisher.",
    exercises: [
      {
        id: "exercise-bench",
        name: "Bench Press",
        category: "Chest",
        sets: 4,
        reps: 8,
        weight: 135,
        time: 0,
        notes: "Leave 1-2 reps in reserve.",
      },
      {
        id: "exercise-incline-db",
        name: "Incline Dumbbell Press",
        category: "Chest",
        sets: 3,
        reps: 10,
        weight: 45,
        time: 0,
        notes: "",
      },
      {
        id: "exercise-curl",
        name: "Dumbbell Curl",
        category: "Arms",
        sets: 3,
        reps: 12,
        weight: 25,
        time: 0,
        notes: "",
      },
      {
        id: "exercise-triceps",
        name: "Cable Triceps Pressdown",
        category: "Arms",
        sets: 3,
        reps: 12,
        weight: 40,
        time: 0,
        notes: "",
      },
    ],
  },
  {
    id: "plan-legs-core",
    name: "Legs and Core",
    focus: "Lower body",
    schedule: "2 days / week",
    notes: "Squat pattern, hinge pattern, and trunk work.",
    exercises: [
      {
        id: "exercise-squat",
        name: "Back Squat",
        category: "Legs",
        sets: 5,
        reps: 5,
        weight: 135,
        time: 0,
        notes: "Controlled depth.",
      },
      {
        id: "exercise-rdl",
        name: "Romanian Deadlift",
        category: "Legs",
        sets: 3,
        reps: 8,
        weight: 115,
        time: 0,
        notes: "",
      },
      {
        id: "exercise-plank",
        name: "Front Plank",
        category: "Core",
        sets: 3,
        reps: 1,
        weight: 0,
        time: 60,
        notes: "Brace and breathe.",
      },
    ],
  },
];

const emptyPlan = {
  name: "",
  focus: "",
  schedule: "3 days / week",
  notes: "",
};

const emptyExercise = {
  name: "",
  category: "Strength",
  sets: 3,
  reps: 10,
  weight: 0,
  time: 0,
  notes: "",
};

function readCookie(name) {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}

async function apiRequest(path, options = {}) {
  const hasBody = Object.prototype.hasOwnProperty.call(options, "body");
  const method = options.method || "GET";
  const headers = hasBody ? { "Content-Type": "application/json" } : {};
  const csrfToken = method !== "GET" ? readCookie("workouthub_csrf") : null;

  if (csrfToken) {
    headers["X-CSRF-Token"] = decodeURIComponent(csrfToken);
  }

  const response = await fetch(path, {
    method,
    credentials: "include",
    headers,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

function generateTemporaryPassword(length = 18) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join("");
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayTitle() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date());
}

function formatDateTime(value) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(milliseconds) {
  const safeMilliseconds = Math.max(0, Number(milliseconds) || 0);
  const totalSeconds = Math.round(safeMilliseconds / 1000);

  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

function getWorkoutDuration(workout) {
  if (workout.durationMs) return workout.durationMs;
  if (!workout.startedAt || !workout.finishedAt) return 0;

  const started = new Date(workout.startedAt).getTime();
  const finished = new Date(workout.finishedAt).getTime();

  if (!Number.isFinite(started) || !Number.isFinite(finished)) return 0;
  return Math.max(0, finished - started);
}

function startOfLocalDay(value = new Date()) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function getWorkoutDate(log) {
  return new Date(log.finishedAt || log.startedAt || Date.now());
}

function getDateKey(value) {
  const date = startOfLocalDay(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayLabel(value) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatMonthLabel(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function isWithinLastDays(log, days) {
  const today = startOfLocalDay();
  const firstDay = addDays(today, -(days - 1));
  const workoutDay = startOfLocalDay(getWorkoutDate(log));
  return workoutDay >= firstDay && workoutDay <= today;
}

function formatTime(seconds) {
  const safeSeconds = Number(seconds) || 0;
  if (!safeSeconds) return "0s";
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  if (!minutes) return `${remainder}s`;
  if (!remainder) return `${minutes}m`;
  return `${minutes}m ${remainder}s`;
}

function coerceNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getSetCount(entry) {
  return Math.max(0, Math.trunc(coerceNumber(entry.planned?.sets ?? entry.sets)));
}

function createDoneSets(setCount) {
  return Array.from({ length: setCount }, () => false);
}

function normalizeDoneSets(doneSets, setCount) {
  const current = Array.isArray(doneSets) ? doneSets : [];
  return Array.from({ length: setCount }, (_, index) => Boolean(current[index]));
}

function countDoneSets(entry) {
  return normalizeDoneSets(entry.doneSets, getSetCount(entry)).filter(Boolean).length;
}

function applyDoneSets(entry, doneSets) {
  const doneCount = doneSets.filter(Boolean).length;

  return {
    ...entry,
    doneSets,
    complete: doneSets.length > 0 && doneCount === doneSets.length,
    actual: {
      ...entry.actual,
      sets: doneCount,
    },
  };
}

function getActualValues(entry) {
  const actual = entry.actual || entry;
  const hasDoneSets = Array.isArray(entry.doneSets);

  return {
    sets: hasDoneSets ? countDoneSets(entry) : coerceNumber(actual.sets),
    reps: coerceNumber(actual.reps),
    weight: coerceNumber(actual.weight),
    time: coerceNumber(actual.time),
  };
}

function normalizeExercise(exercise) {
  return {
    id: exercise.id || createId("exercise"),
    name: exercise.name || "Untitled Exercise",
    category: exercise.category || "General",
    sets: coerceNumber(exercise.sets),
    reps: coerceNumber(exercise.reps),
    weight: coerceNumber(exercise.weight),
    time: coerceNumber(exercise.time),
    notes: exercise.notes || "",
  };
}

function planExerciseToEntry(exercise) {
  const setCount = Math.max(0, Math.trunc(coerceNumber(exercise.sets)));

  return {
    id: createId("entry"),
    exerciseId: exercise.id,
    name: exercise.name,
    category: exercise.category,
    planned: {
      sets: exercise.sets,
      reps: exercise.reps,
      weight: exercise.weight,
      time: exercise.time,
    },
    actual: {
      sets: 0,
      reps: exercise.reps,
      weight: exercise.weight,
      time: exercise.time,
    },
    doneSets: createDoneSets(setCount),
    notes: exercise.notes || "",
    complete: false,
  };
}

function createWorkoutFromPlan(plan) {
  return {
    id: createId("workout"),
    planId: plan.id,
    planName: plan.name,
    title: `${todayTitle()} - ${plan.name}`,
    startedAt: new Date().toISOString(),
    entries: plan.exercises.map(planExerciseToEntry),
  };
}

function summarizeEntries(entries) {
  const totalSets = entries.reduce(
    (sum, entry) => sum + getActualValues(entry).sets,
    0,
  );
  const totalReps = entries.reduce((sum, entry) => {
    const actual = getActualValues(entry);
    return sum + coerceNumber(actual.sets) * coerceNumber(actual.reps);
  }, 0);
  const totalVolume = entries.reduce((sum, entry) => {
    const actual = getActualValues(entry);
    return (
      sum +
      coerceNumber(actual.sets) *
        coerceNumber(actual.reps) *
        coerceNumber(actual.weight)
    );
  }, 0);
  const totalTime = entries.reduce((sum, entry) => {
    const actual = getActualValues(entry);
    return sum + coerceNumber(actual.sets) * coerceNumber(actual.time);
  }, 0);

  return {
    exerciseCount: entries.length,
    totalSets,
    totalReps,
    totalVolume,
    totalTime,
    completeCount: entries.filter(
      (entry) =>
        entry.complete ||
        (Array.isArray(entry.doneSets) &&
          entry.doneSets.length > 0 &&
          countDoneSets(entry) === entry.doneSets.length),
    ).length,
  };
}

function summarizeWorkout(workout) {
  return summarizeEntries(workout.entries || []);
}

function summarizePlan(plan) {
  return summarizeEntries(plan.exercises || []);
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  min,
  step,
  placeholder,
  readOnly = false,
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        min={min}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        step={step}
        type={type}
        value={value}
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange, rows = 2, placeholder }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        value={value}
      />
    </label>
  );
}

function IconButton({ label, children, className = "", ...props }) {
  return (
    <button
      aria-label={label}
      className={`icon-button ${className}`}
      title={label}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

function EmptyState({ icon: Icon, title, action }) {
  return (
    <div className="empty-state">
      <Icon aria-hidden="true" size={24} />
      <strong>{title}</strong>
      {action}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PlanForm({ onCreate }) {
  const [draft, setDraft] = useState(emptyPlan);

  function updateField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) return;

    onCreate({
      id: createId("plan"),
      name,
      focus: draft.focus.trim() || "General",
      schedule: draft.schedule.trim() || "Unscheduled",
      notes: draft.notes.trim(),
      exercises: [],
    });
    setDraft(emptyPlan);
  }

  return (
    <form className="plan-form" onSubmit={handleSubmit}>
      <Field
        label="Session"
        onChange={(value) => updateField("name", value)}
        placeholder="Chest and Arms"
        value={draft.name}
      />
      <div className="form-grid two">
        <Field
          label="Focus"
          onChange={(value) => updateField("focus", value)}
          placeholder="Upper body"
          value={draft.focus}
        />
        <Field
          label="Schedule"
          onChange={(value) => updateField("schedule", value)}
          value={draft.schedule}
        />
      </div>
      <TextAreaField
        label="Notes"
        onChange={(value) => updateField("notes", value)}
        placeholder="Goal, weekly split, or coaching cue"
        value={draft.notes}
      />
      <button className="button primary" type="submit">
        <Plus size={18} />
        Create session
      </button>
    </form>
  );
}

function SessionPlansPanel({
  plans,
  selectedPlanId,
  onCreate,
  onDelete,
  onSelect,
  onStart,
}) {
  return (
    <section className="panel plans-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Plan</p>
          <h2>Session Plans</h2>
        </div>
        <ClipboardList aria-hidden="true" size={22} />
      </div>

      <PlanForm onCreate={onCreate} />

      <div className="plan-list">
        {plans.map((plan) => {
          const summary = summarizePlan(plan);
          const isSelected = plan.id === selectedPlanId;

          return (
            <article className={`plan-card ${isSelected ? "is-selected" : ""}`} key={plan.id}>
              <button className="plan-select" onClick={() => onSelect(plan.id)} type="button">
                <span>
                  <strong>{plan.name}</strong>
                  <small>{plan.schedule}</small>
                </span>
                <span className="plan-pill">{summary.exerciseCount} ex</span>
              </button>
              <div className="plan-meta">
                <span>{plan.focus || "General"}</span>
                <span>{summary.totalSets} planned sets</span>
              </div>
              <div className="row-actions">
                <button className="button ghost" onClick={() => onStart(plan)} type="button">
                  <Play size={18} />
                  Start
                </button>
                <IconButton
                  className="danger"
                  label={`Delete ${plan.name}`}
                  onClick={() => onDelete(plan.id)}
                >
                  <Trash2 size={18} />
                </IconButton>
              </div>
            </article>
          );
        })}

        {!plans.length && (
          <EmptyState
            icon={ClipboardList}
            title="Create a session plan"
          />
        )}
      </div>
    </section>
  );
}

function ExerciseForm({ onCreate }) {
  const [draft, setDraft] = useState(emptyExercise);

  function updateField(field, value) {
    setDraft((current) => ({
      ...current,
      [field]: ["sets", "reps", "weight", "time"].includes(field)
        ? coerceNumber(value)
        : value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) return;

    onCreate({
      ...draft,
      id: createId("exercise"),
      name,
      category: draft.category.trim() || "General",
      notes: draft.notes.trim(),
    });
    setDraft(emptyExercise);
  }

  return (
    <form className="exercise-form" onSubmit={handleSubmit}>
      <div className="form-grid exercise">
        <Field
          label="Exercise"
          onChange={(value) => updateField("name", value)}
          placeholder="Incline press"
          value={draft.name}
        />
        <Field
          label="Category"
          onChange={(value) => updateField("category", value)}
          value={draft.category}
        />
        <Field
          label="Sets"
          min="0"
          onChange={(value) => updateField("sets", value)}
          type="number"
          value={draft.sets}
        />
        <Field
          label="Reps"
          min="0"
          onChange={(value) => updateField("reps", value)}
          type="number"
          value={draft.reps}
        />
        <Field
          label="Weight"
          min="0"
          onChange={(value) => updateField("weight", value)}
          step="0.5"
          type="number"
          value={draft.weight}
        />
        <Field
          label="Time"
          min="0"
          onChange={(value) => updateField("time", value)}
          type="number"
          value={draft.time}
        />
      </div>
      <TextAreaField
        label="Notes"
        onChange={(value) => updateField("notes", value)}
        value={draft.notes}
      />
      <button className="button primary" type="submit">
        <Plus size={18} />
        Add exercise
      </button>
    </form>
  );
}

function PlanExerciseEditor({ exercise, onChange, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: exercise.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function updateField(field, value) {
    onChange(exercise.id, {
      ...exercise,
      [field]: ["sets", "reps", "weight", "time"].includes(field)
        ? coerceNumber(value)
        : value,
    });
  }

  return (
    <article
      className={`exercise-editor sortable-card ${isDragging ? "is-dragging" : ""}`}
      ref={setNodeRef}
      style={style}
    >
      <div className="entry-head exercise-card-head">
        <button
          aria-label={`Move ${exercise.name}`}
          className="drag-handle"
          type="button"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" size={19} />
        </button>
        <div className="exercise-title-fields">
          <Field
            label="Exercise"
            onChange={(value) => updateField("name", value)}
            value={exercise.name}
          />
          <Field
            label="Category"
            onChange={(value) => updateField("category", value)}
            value={exercise.category}
          />
        </div>
        <IconButton
          className="danger"
          label={`Remove ${exercise.name}`}
          onClick={() => onDelete(exercise.id)}
        >
          <Trash2 size={18} />
        </IconButton>
      </div>

      <div className="mini-grid">
        <Field
          label="Sets"
          min="0"
          onChange={(value) => updateField("sets", value)}
          type="number"
          value={exercise.sets}
        />
        <Field
          label="Reps"
          min="0"
          onChange={(value) => updateField("reps", value)}
          type="number"
          value={exercise.reps}
        />
        <Field
          label="Weight"
          min="0"
          onChange={(value) => updateField("weight", value)}
          step="0.5"
          type="number"
          value={exercise.weight}
        />
        <Field
          label="Time"
          min="0"
          onChange={(value) => updateField("time", value)}
          type="number"
          value={exercise.time}
        />
      </div>

      <TextAreaField
        label="Exercise notes"
        onChange={(value) => updateField("notes", value)}
        value={exercise.notes}
      />
    </article>
  );
}

function SessionPlanBuilder({
  plan,
  onAddExercise,
  onReorderExercises,
  onStart,
  onUpdateExercise,
  onUpdatePlan,
  onDeleteExercise,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      onReorderExercises(active.id, over.id);
    }
  }

  if (!plan) {
    return (
      <section className="panel builder-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Build</p>
            <h2>Selected Session</h2>
          </div>
          <Pencil aria-hidden="true" size={22} />
        </div>
        <EmptyState icon={ClipboardList} title="Select a session plan" />
      </section>
    );
  }

  const summary = summarizePlan(plan);

  return (
    <section className="panel builder-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Build</p>
          <h2>{plan.name}</h2>
        </div>
        <button className="button primary" onClick={() => onStart(plan)} type="button">
          <Play size={18} />
          Start session
        </button>
      </div>

      <div className="plan-settings">
        <div className="form-grid two">
          <Field
            label="Session name"
            onChange={(value) => onUpdatePlan({ name: value })}
            value={plan.name}
          />
          <Field
            label="Schedule"
            onChange={(value) => onUpdatePlan({ schedule: value })}
            value={plan.schedule}
          />
        </div>
        <div className="form-grid two">
          <Field
            label="Focus"
            onChange={(value) => onUpdatePlan({ focus: value })}
            value={plan.focus}
          />
          <Field
            label="Exercises"
            onChange={() => {}}
            readOnly
            type="text"
            value={`${summary.exerciseCount} planned`}
          />
        </div>
        <TextAreaField
          label="Session notes"
          onChange={(value) => onUpdatePlan({ notes: value })}
          value={plan.notes}
        />
      </div>

      <ExerciseForm onCreate={onAddExercise} />

      <div className="exercise-list sortable-list">
        {plan.exercises.length ? (
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <SortableContext
              items={plan.exercises.map((exercise) => exercise.id)}
              strategy={verticalListSortingStrategy}
            >
              {plan.exercises.map((exercise) => (
                <PlanExerciseEditor
                  exercise={exercise}
                  key={exercise.id}
                  onChange={onUpdateExercise}
                  onDelete={onDeleteExercise}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          <EmptyState icon={ListPlus} title="Add exercises to this session" />
        )}
      </div>
    </section>
  );
}

function WorkoutEntry({ entry, onChange, onRemove }) {
  const setCount = getSetCount(entry);
  const doneSets = normalizeDoneSets(entry.doneSets, setCount);
  const doneCount = doneSets.filter(Boolean).length;
  const isComplete = setCount > 0 && doneCount === setCount;

  function updateActual(field, value) {
    onChange(entry.id, {
      ...entry,
      actual: {
        ...entry.actual,
        sets: doneCount,
        [field]: coerceNumber(value),
      },
    });
  }

  function updateNotes(value) {
    onChange(entry.id, {
      ...entry,
      notes: value,
    });
  }

  function toggleSet(index) {
    const nextDoneSets = doneSets.map((isDone, currentIndex) =>
      currentIndex === index ? !isDone : isDone,
    );

    onChange(entry.id, applyDoneSets(entry, nextDoneSets));
  }

  function toggleAllSets() {
    const shouldComplete = doneCount < setCount;
    const nextDoneSets = doneSets.map(() => shouldComplete);
    onChange(entry.id, applyDoneSets(entry, nextDoneSets));
  }

  return (
    <article className={`session-entry workout-card ${isComplete ? "is-complete" : ""}`}>
      <div className="entry-head workout-card-head">
        <div>
          <span className="entry-category">{entry.category}</span>
          <h3>{entry.name}</h3>
          <div className="planned-line">
            <span>{entry.planned.sets} sets</span>
            <span>{entry.planned.reps} reps</span>
            <span>{entry.planned.weight} lb</span>
            <span>{formatTime(entry.planned.time)}</span>
          </div>
        </div>
        <div className="entry-actions">
          <IconButton
            className={isComplete ? "success active" : "success"}
            label={isComplete ? "Clear sets" : "Check all sets"}
            onClick={toggleAllSets}
          >
            <Check size={18} />
          </IconButton>
          <IconButton
            className="danger"
            label={`Remove ${entry.name}`}
            onClick={() => onRemove(entry.id)}
          >
            <X size={18} />
          </IconButton>
        </div>
      </div>

      <div className="set-progress">
        <div className="set-progress-head">
          <span>Sets done</span>
          <strong>{doneCount}/{setCount}</strong>
        </div>
        <div className="set-check-grid">
          {doneSets.length ? (
            doneSets.map((isDone, index) => (
              <button
                aria-pressed={isDone}
                className={`set-check ${isDone ? "is-done" : ""}`}
                key={`${entry.id}-set-${index}`}
                onClick={() => toggleSet(index)}
                type="button"
              >
                <span className="check-box">
                  {isDone && <Check aria-hidden="true" size={15} />}
                </span>
                <span>Set {index + 1}</span>
              </button>
            ))
          ) : (
            <span className="no-sets">No planned sets</span>
          )}
        </div>
      </div>

      <div className="done-inputs">
        <div className="block-title">
          <Activity aria-hidden="true" size={15} />
          Done values
        </div>
        <div className="mini-grid compact">
          <Field
            label="Reps"
            min="0"
            onChange={(value) => updateActual("reps", value)}
            type="number"
            value={entry.actual.reps}
          />
          <Field
            label="Weight"
            min="0"
            onChange={(value) => updateActual("weight", value)}
            step="0.5"
            type="number"
            value={entry.actual.weight}
          />
          <Field
            label="Time"
            min="0"
            onChange={(value) => updateActual("time", value)}
            type="number"
            value={entry.actual.time}
          />
        </div>
      </div>

      <TextAreaField
        label="Workout note"
        onChange={updateNotes}
        value={entry.notes}
      />
    </article>
  );
}

function ActiveWorkoutPanel({
  activeWorkout,
  isFocused = false,
  onBack,
  selectedPlan,
  onAddExtra,
  onChangeEntry,
  onFinish,
  onRemoveEntry,
  onReset,
  onStartSelected,
  onTitleChange,
}) {
  const summary = activeWorkout ? summarizeWorkout(activeWorkout) : null;

  return (
    <section className={`panel run-panel ${isFocused ? "workout-focus-panel" : ""}`}>
      <div className="panel-heading workout-panel-heading">
        <div>
          <p className="eyebrow">Log</p>
          <h2>{isFocused && activeWorkout ? activeWorkout.planName : "Workout Run"}</h2>
        </div>
        <div className="header-actions">
          {isFocused && (
            <button className="button ghost" onClick={onBack} type="button">
              <ArrowLeft size={18} />
              Planner
            </button>
          )}
          <CalendarClock aria-hidden="true" size={22} />
        </div>
      </div>

      {!activeWorkout ? (
        <EmptyState
          action={
            <button
              className="button primary"
              disabled={!selectedPlan}
              onClick={onStartSelected}
              type="button"
            >
              <Play size={18} />
              Start selected
            </button>
          }
          icon={Dumbbell}
          title={selectedPlan ? `Ready for ${selectedPlan.name}` : "Select a session plan"}
        />
      ) : (
        <>
          <div className="session-toolbar">
            <label className="session-title">
              <span>Workout title</span>
              <input
                onChange={(event) => onTitleChange(event.target.value)}
                value={activeWorkout.title}
              />
            </label>
            <div className="toolbar-actions">
              <button className="button ghost" onClick={onAddExtra} type="button">
                <Plus size={18} />
                Extra
              </button>
              <button className="button ghost" onClick={onReset} type="button">
                <RotateCcw size={18} />
                Reload
              </button>
              <button
                className="button primary"
                disabled={!activeWorkout.entries.length}
                onClick={onFinish}
                type="button"
              >
                <Save size={18} />
                Finish
              </button>
            </div>
          </div>

          <div className="workout-meta-grid">
            <div className="workout-source">
              <span>From session</span>
              <strong>{activeWorkout.planName}</strong>
            </div>
            <div className="workout-source">
              <span>Started</span>
              <strong>{formatDateTime(activeWorkout.startedAt)}</strong>
            </div>
          </div>

          <div className="metrics">
            <Metric label="Exercises" value={summary.exerciseCount} />
            <Metric label="Done" value={`${summary.completeCount}/${summary.exerciseCount}`} />
            <Metric label="Sets" value={summary.totalSets} />
            <Metric label="Volume" value={`${summary.totalVolume.toLocaleString()} lb`} />
          </div>

          <div className={`session-list ${isFocused ? "workout-tile-grid" : ""}`}>
            {activeWorkout.entries.length ? (
              activeWorkout.entries.map((entry) => (
                <WorkoutEntry
                  entry={entry}
                  key={entry.id}
                  onChange={onChangeEntry}
                  onRemove={onRemoveEntry}
                />
              ))
            ) : (
              <EmptyState icon={ListPlus} title="This workout has no exercises" />
            )}
          </div>
        </>
      )}
    </section>
  );
}

function WorkoutResumePanel({ activeWorkout, onResume, selectedPlan, onStartSelected }) {
  const summary = activeWorkout ? summarizeWorkout(activeWorkout) : null;

  return (
    <section className="panel run-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Log</p>
          <h2>Workout Run</h2>
        </div>
        <CalendarClock aria-hidden="true" size={22} />
      </div>

      {activeWorkout ? (
        <div className="resume-panel-body">
          <div>
            <span className="entry-category">In progress</span>
            <h3>{activeWorkout.title}</h3>
            <p>{activeWorkout.planName} · Started {formatDateTime(activeWorkout.startedAt)}</p>
          </div>
          <div className="metrics compact-metrics">
            <Metric label="Done" value={`${summary.completeCount}/${summary.exerciseCount}`} />
            <Metric label="Sets" value={summary.totalSets} />
            <Metric label="Volume" value={`${summary.totalVolume.toLocaleString()} lb`} />
          </div>
          <button className="button primary" onClick={onResume} type="button">
            <Timer size={18} />
            Resume workout
          </button>
        </div>
      ) : (
        <EmptyState
          action={
            <button
              className="button primary"
              disabled={!selectedPlan}
              onClick={onStartSelected}
              type="button"
            >
              <Play size={18} />
              Start selected
            </button>
          }
          icon={Dumbbell}
          title={selectedPlan ? `Ready for ${selectedPlan.name}` : "Select a session plan"}
        />
      )}
    </section>
  );
}

function HistoryPanel({
  logs,
  onDelete,
  eyebrow = "History",
  title = "Workout Logs",
  emptyTitle = "No finished workouts",
}) {
  const [expandedId, setExpandedId] = useState(null);

  return (
    <section className="panel history-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <History aria-hidden="true" size={22} />
      </div>

      {!logs.length ? (
        <EmptyState icon={Clock} title={emptyTitle} />
      ) : (
        <div className="history-list">
          {logs.map((log) => {
            const summary = summarizeWorkout(log);
            const isExpanded = expandedId === log.id;
            const duration = getWorkoutDuration(log);

            return (
              <article className="history-item" key={log.id}>
                <div className="history-row">
                  <button
                    aria-expanded={isExpanded}
                    className="history-summary"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    type="button"
                  >
                    <span>
                      <strong>{log.title}</strong>
                      <small>
                        {log.planName} · {formatDateTime(log.finishedAt || log.startedAt)}
                      </small>
                    </span>
                    <span className="history-metrics">
                      {formatDuration(duration)}
                      <ChevronDown
                        aria-hidden="true"
                        className={isExpanded ? "rotate" : ""}
                        size={17}
                      />
                    </span>
                  </button>
                  <IconButton
                    className="danger"
                    label={`Delete ${log.title}`}
                    onClick={() => onDelete(log.id)}
                  >
                    <Trash2 size={18} />
                  </IconButton>
                </div>

                {isExpanded && (
                  <div className="history-detail">
                    <div className="timeline-grid">
                      <div>
                        <span>Started</span>
                        <strong>{formatDateTime(log.startedAt)}</strong>
                      </div>
                      <div>
                        <span>Finished</span>
                        <strong>{formatDateTime(log.finishedAt)}</strong>
                      </div>
                      <div>
                        <span>Duration</span>
                        <strong>{formatDuration(duration)}</strong>
                      </div>
                    </div>
                    <div className="history-stat-row">
                      <span>{summary.totalSets} sets</span>
                      <span>{summary.totalReps} reps</span>
                      <span>{summary.totalVolume.toLocaleString()} lb</span>
                      <span>{formatTime(summary.totalTime)}</span>
                    </div>
                    {log.entries.map((entry) => {
                      const actual = getActualValues(entry);

                      return (
                        <div className="history-exercise" key={entry.id}>
                          <strong>{entry.name}</strong>
                          <span>
                            {actual.sets} x {actual.reps}
                            {actual.weight ? ` @ ${actual.weight} lb` : ""}
                            {actual.time ? `, ${formatTime(actual.time)}` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function buildCalendarDays(monthCursor) {
  const monthStart = new Date(
    monthCursor.getFullYear(),
    monthCursor.getMonth(),
    1,
  );
  const firstCell = addDays(monthStart, -monthStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(firstCell, index);

    return {
      date,
      dateKey: getDateKey(date),
      isCurrentMonth: date.getMonth() === monthCursor.getMonth(),
      dayNumber: date.getDate(),
    };
  });
}

function groupLogsByDay(logs) {
  return logs.reduce((groups, log) => {
    const dateKey = getDateKey(getWorkoutDate(log));
    const current = groups.get(dateKey) || [];
    groups.set(dateKey, [...current, log]);
    return groups;
  }, new Map());
}

function WorkoutHistoryView({ logs, onDelete }) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const latestDate = logs[0] ? getWorkoutDate(logs[0]) : new Date();
    return new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState(() => {
    const latest = logs[0];
    return latest ? getDateKey(getWorkoutDate(latest)) : getDateKey(new Date());
  });

  const logsByDay = useMemo(() => groupLogsByDay(logs), [logs]);
  const calendarDays = useMemo(
    () => buildCalendarDays(monthCursor),
    [monthCursor],
  );
  const selectedLogs = logsByDay.get(selectedDateKey) || [];
  const selectedDate = selectedDateKey ? new Date(`${selectedDateKey}T00:00:00`) : new Date();

  function moveMonth(offset) {
    setMonthCursor(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  }

  return (
    <div className="history-view">
      <section className="panel calendar-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Calendar</p>
            <h2>{formatMonthLabel(monthCursor)}</h2>
          </div>
          <div className="calendar-actions">
            <button className="button ghost" onClick={() => moveMonth(-1)} type="button">
              Previous
            </button>
            <button className="button ghost" onClick={() => moveMonth(1)} type="button">
              Next
            </button>
          </div>
        </div>

        <div className="calendar-weekdays" aria-hidden="true">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>

        <div className="calendar-grid">
          {calendarDays.map((day) => {
            const dayLogs = logsByDay.get(day.dateKey) || [];
            const hasWorkouts = dayLogs.length > 0;
            const isSelected = day.dateKey === selectedDateKey;

            return (
              <button
                aria-label={`${formatDayLabel(day.date)}, ${dayLogs.length} workouts`}
                className={[
                  "calendar-day",
                  day.isCurrentMonth ? "" : "is-muted",
                  hasWorkouts ? "has-workouts" : "",
                  isSelected ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={day.dateKey}
                onClick={() => setSelectedDateKey(day.dateKey)}
                type="button"
              >
                <span>{day.dayNumber}</span>
                {hasWorkouts && <strong>{dayLogs.length}</strong>}
              </button>
            );
          })}
        </div>
      </section>

      <HistoryPanel
        emptyTitle="No workouts on this day"
        eyebrow="Selected Day"
        logs={selectedLogs}
        onDelete={onDelete}
        title={formatDayLabel(selectedDate)}
      />
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsChecking(true);

    try {
      const { user } = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
          username,
          password,
        },
      });

      onLogin(user);
      setPassword("");
    } catch (error) {
      setError(error.message);
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand login-brand">
          <span className="brand-icon">
            <Dumbbell aria-hidden="true" size={24} />
          </span>
          <div>
            <h1>Workout Tool</h1>
            <p>Sign in</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <Field
            label="Username"
            onChange={setUsername}
            placeholder="admin"
            value={username}
          />
          <Field
            label="Password"
            onChange={setPassword}
            type="password"
            value={password}
          />
          {error && <p className="login-error">{error}</p>}
          <button className="button primary" disabled={isChecking} type="submit">
            <UserRound size={18} />
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}

function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [draft, setDraft] = useState({
    username: "",
    displayName: "",
    password: generateTemporaryPassword(),
  });
  const [error, setError] = useState("");
  const [adminNotice, setAdminNotice] = useState(null);

  useEffect(() => {
    let isMounted = true;

    apiRequest("/api/admin/users")
      .then((data) => {
        if (isMounted) setUsers(data.users || []);
      })
      .catch((error) => {
        if (isMounted) setError(error.message);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    setError("");

    const username = normalizeUsername(draft.username);
    const displayName = draft.displayName.trim() || username;
    const password = draft.password.trim();

    if (!username) {
      setError("Enter a username.");
      return;
    }

    if (users.some((user) => user.username === username)) {
      setError("That username already exists.");
      return;
    }

    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }

    try {
      const { user } = await apiRequest("/api/admin/users", {
        method: "POST",
        body: {
          username,
          displayName,
          password,
        },
      });
      setUsers((current) => [...current, user]);
      setAdminNotice({
        type: "Created",
        username: user.username,
        displayName: user.displayName,
      });
      setDraft({
        username: "",
        displayName: "",
        password: generateTemporaryPassword(),
      });
    } catch (error) {
      setError(error.message);
    }
  }

  function regeneratePassword() {
    updateDraft("password", generateTemporaryPassword());
  }

  async function resetPassword(username) {
    try {
      const { user, temporaryPassword } = await apiRequest(
        `/api/admin/users/${encodeURIComponent(username)}/reset-password`,
        {
          method: "POST",
          body: {},
        },
      );
      setUsers((current) =>
        current.map((account) =>
          account.username === user.username ? { ...account, ...user } : account,
        ),
      );
      setAdminNotice({
        type: "Password reset",
        username: user.username,
        displayName: user.displayName,
        password: temporaryPassword,
      });
    } catch (error) {
      setError(error.message);
    }
  }

  return (
    <div className="admin-view">
      <section className="panel admin-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Admin</p>
            <h2>Create Users</h2>
          </div>
          <UserRound aria-hidden="true" size={22} />
        </div>

        <form className="admin-form" onSubmit={handleCreateUser}>
          <div className="form-grid two">
            <Field
              label="Username"
              onChange={(value) => updateDraft("username", value)}
              placeholder="justin"
              value={draft.username}
            />
            <Field
              label="Display name"
              onChange={(value) => updateDraft("displayName", value)}
              placeholder="Justin"
              value={draft.displayName}
            />
          </div>
          <div className="password-row">
            <Field
              label="Temporary password"
              onChange={(value) => updateDraft("password", value)}
              value={draft.password}
            />
            <button className="button ghost" onClick={regeneratePassword} type="button">
              <RotateCcw size={18} />
              Generate
            </button>
          </div>
          {error && <p className="login-error">{error}</p>}
          <button className="button primary" type="submit">
            <Plus size={18} />
            Create user
          </button>
        </form>

        {adminNotice && (
          <div className="created-user-box">
            <span>{adminNotice.type}</span>
            <strong>{adminNotice.displayName}</strong>
            <code>{adminNotice.username}</code>
            {adminNotice.password && <code>{adminNotice.password}</code>}
          </div>
        )}
      </section>

      <section className="panel admin-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Admin</p>
            <h2>Users</h2>
          </div>
          <ClipboardList aria-hidden="true" size={22} />
        </div>

        <div className="user-list">
          {users.map((account) => (
            <article className="user-card" key={account.username}>
              <div>
                <strong>{account.displayName || account.username}</strong>
                <span>{account.username}</span>
              </div>
              <div className="plan-meta">
                <span>{account.role}</span>
                <span>{formatDateTime(account.createdAt)}</span>
              </div>
              <button
                className="button ghost"
                onClick={() => resetPassword(account.username)}
                type="button"
              >
                <RotateCcw size={18} />
                Reset password
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function AccountPanel({ user }) {
  const [form, setForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handlePasswordChange(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const newPassword = form.newPassword.trim();
    const confirmPassword = form.confirmPassword.trim();

    if (newPassword.length < 8) {
      setError("Use a new password with at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }

    setIsSaving(true);

    try {
      await apiRequest("/api/account/password", {
        method: "POST",
        body: {
          newPassword,
          confirmPassword,
        },
      });
      setForm({
        newPassword: "",
        confirmPassword: "",
      });
      setSuccess("Password updated.");
    } catch (error) {
      setError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="account-view">
      <section className="panel account-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Account</p>
            <h2>{user.displayName || user.username}</h2>
          </div>
          <KeyRound aria-hidden="true" size={22} />
        </div>

        <form className="admin-form" onSubmit={handlePasswordChange}>
          <div className="form-grid two">
            <Field
              label="New password"
              onChange={(value) => updateForm("newPassword", value)}
              type="password"
              value={form.newPassword}
            />
            <Field
              label="Confirm new password"
              onChange={(value) => updateForm("confirmPassword", value)}
              type="password"
              value={form.confirmPassword}
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          {success && <p className="success-message">{success}</p>}
          <button className="button primary" disabled={isSaving} type="submit">
            <Save size={18} />
            Update password
          </button>
        </form>
      </section>
    </div>
  );
}

function WorkoutApp({ user, onLogout }) {
  const [viewMode, setViewMode] = useState("planner");
  const [sessionPlans, setSessionPlansState] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [activeWorkout, setActiveWorkoutState] = useState(null);
  const [workoutLogs, setWorkoutLogsState] = useState([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    let isMounted = true;

    setIsDataLoading(true);
    apiRequest("/api/data")
      .then((data) => {
        if (!isMounted) return;

        const nextSessionPlans = Array.isArray(data.sessionPlans)
          ? data.sessionPlans
          : DEFAULT_SESSION_PLANS;

        setSessionPlansState(nextSessionPlans);
        setActiveWorkoutState(data.activeWorkout || null);
        setWorkoutLogsState(Array.isArray(data.workoutLogs) ? data.workoutLogs : []);
        setSelectedPlanId(nextSessionPlans[0]?.id || null);
        setDataError("");
      })
      .catch((error) => {
        if (isMounted) setDataError(error.message);
      })
      .finally(() => {
        if (isMounted) setIsDataLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [user.username]);

  function persistField(path, body) {
    apiRequest(path, {
      method: "PUT",
      body,
    }).catch((error) => {
      setDataError(error.message);
    });
  }

  function setSessionPlans(update) {
    setSessionPlansState((current) => {
      const next = typeof update === "function" ? update(current) : update;
      persistField("/api/data/session-plans", { sessionPlans: next });
      return next;
    });
  }

  function setActiveWorkout(update) {
    setActiveWorkoutState((current) => {
      const next = typeof update === "function" ? update(current) : update;
      persistField("/api/data/active-workout", { activeWorkout: next });
      return next;
    });
  }

  function setWorkoutLogs(update) {
    setWorkoutLogsState((current) => {
      const next = typeof update === "function" ? update(current) : update;
      persistField("/api/data/workout-logs", { workoutLogs: next });
      return next;
    });
  }

  const selectedPlan = useMemo(
    () => sessionPlans.find((plan) => plan.id === selectedPlanId) || sessionPlans[0] || null,
    [selectedPlanId, sessionPlans],
  );

  const plannedExerciseCount = useMemo(
    () => sessionPlans.reduce((sum, plan) => sum + plan.exercises.length, 0),
    [sessionPlans],
  );

  const recentSummary = useMemo(() => {
    const latest = workoutLogs[0];
    return latest ? summarizeWorkout(latest) : null;
  }, [workoutLogs]);
  const recentWorkoutLogs = useMemo(
    () => workoutLogs.filter((log) => isWithinLastDays(log, 7)),
    [workoutLogs],
  );

  useEffect(() => {
    if (!selectedPlanId && sessionPlans[0]) {
      setSelectedPlanId(sessionPlans[0].id);
    }
  }, [selectedPlanId, sessionPlans]);

  function createPlan(plan) {
    setSessionPlans((current) => [plan, ...current]);
    setSelectedPlanId(plan.id);
  }

  function deletePlan(planId) {
    setSessionPlans((current) => current.filter((plan) => plan.id !== planId));
    if (selectedPlanId === planId) {
      const nextPlan = sessionPlans.find((plan) => plan.id !== planId);
      setSelectedPlanId(nextPlan?.id || null);
    }
  }

  function updateSelectedPlan(patch) {
    if (!selectedPlan) return;
    setSessionPlans((current) =>
      current.map((plan) =>
        plan.id === selectedPlan.id ? { ...plan, ...patch } : plan,
      ),
    );
  }

  function addExerciseToSelected(exercise) {
    if (!selectedPlan) return;
    setSessionPlans((current) =>
      current.map((plan) =>
        plan.id === selectedPlan.id
          ? { ...plan, exercises: [...plan.exercises, normalizeExercise(exercise)] }
          : plan,
      ),
    );
  }

  function updateExerciseInSelected(exerciseId, nextExercise) {
    if (!selectedPlan) return;
    setSessionPlans((current) =>
      current.map((plan) =>
        plan.id === selectedPlan.id
          ? {
              ...plan,
              exercises: plan.exercises.map((exercise) =>
                exercise.id === exerciseId ? normalizeExercise(nextExercise) : exercise,
              ),
            }
          : plan,
      ),
    );
  }

  function deleteExerciseFromSelected(exerciseId) {
    if (!selectedPlan) return;
    setSessionPlans((current) =>
      current.map((plan) =>
        plan.id === selectedPlan.id
          ? {
              ...plan,
              exercises: plan.exercises.filter((exercise) => exercise.id !== exerciseId),
            }
          : plan,
      ),
    );
  }

  function reorderExercisesInSelected(activeId, overId) {
    if (!selectedPlan) return;

    setSessionPlans((current) =>
      current.map((plan) => {
        if (plan.id !== selectedPlan.id) return plan;

        const oldIndex = plan.exercises.findIndex((exercise) => exercise.id === activeId);
        const newIndex = plan.exercises.findIndex((exercise) => exercise.id === overId);

        if (oldIndex === -1 || newIndex === -1) return plan;

        return {
          ...plan,
          exercises: arrayMove(plan.exercises, oldIndex, newIndex),
        };
      }),
    );
  }

  function startWorkout(plan) {
    setSelectedPlanId(plan.id);
    setActiveWorkout(createWorkoutFromPlan(plan));
    setViewMode("workout");
  }

  function updateActiveWorkout(updater) {
    setActiveWorkout((current) => {
      if (!current) return current;
      return updater(current);
    });
  }

  function addExtraExerciseToWorkout() {
    updateActiveWorkout((workout) => ({
      ...workout,
      entries: [
        ...workout.entries,
        planExerciseToEntry({
          id: createId("exercise-extra"),
          name: "Extra Exercise",
          category: "General",
          sets: 3,
          reps: 10,
          weight: 0,
          time: 0,
          notes: "",
        }),
      ],
    }));
  }

  function changeWorkoutEntry(entryId, nextEntry) {
    updateActiveWorkout((workout) => ({
      ...workout,
      entries: workout.entries.map((entry) =>
        entry.id === entryId ? nextEntry : entry,
      ),
    }));
  }

  function removeWorkoutEntry(entryId) {
    updateActiveWorkout((workout) => ({
      ...workout,
      entries: workout.entries.filter((entry) => entry.id !== entryId),
    }));
  }

  function reloadWorkoutFromPlan() {
    if (!activeWorkout) return;
    const plan = sessionPlans.find((item) => item.id === activeWorkout.planId);
    if (plan) {
      setActiveWorkout(createWorkoutFromPlan(plan));
    }
  }

  function finishWorkout() {
    if (!activeWorkout || !activeWorkout.entries.length) return;
    const finishedAt = new Date().toISOString();

    const finished = {
      ...activeWorkout,
      title: activeWorkout.title.trim() || `${todayTitle()} Workout`,
      finishedAt,
    };

    setWorkoutLogs((current) => [
      {
        ...finished,
        durationMs: getWorkoutDuration(finished),
      },
      ...current,
    ]);
    setActiveWorkout(null);
    setViewMode("planner");
  }

  function deleteWorkoutLog(logId) {
    setWorkoutLogs((current) => current.filter((log) => log.id !== logId));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <Dumbbell aria-hidden="true" size={24} />
          </span>
          <div>
            <h1>Workout Tool</h1>
            <p>{formatDateTime(new Date().toISOString())}</p>
          </div>
        </div>
        <div className="topbar-stats">
          <Metric label="Session Plans" value={sessionPlans.length} />
          <Metric label="Exercises" value={plannedExerciseCount} />
          <Metric label="Workout Logs" value={workoutLogs.length} />
          <Metric
            label="Last Volume"
            value={recentSummary ? `${recentSummary.totalVolume.toLocaleString()} lb` : "0 lb"}
          />
          <Metric label="User" value={user.username} />
          <button
            className="button ghost"
            onClick={() =>
              setViewMode((current) => (current === "account" ? "planner" : "account"))
            }
            type="button"
          >
            {viewMode === "account" ? (
              <>
                <ArrowLeft size={18} />
                Planner
              </>
            ) : (
              <>
                <KeyRound size={18} />
                Account
              </>
            )}
          </button>
          {user.role === "admin" && (
            <button
              className="button ghost"
              onClick={() =>
                setViewMode((current) => (current === "admin" ? "planner" : "admin"))
              }
              type="button"
            >
              {viewMode === "admin" ? (
                <>
                  <ArrowLeft size={18} />
                  Planner
                </>
              ) : (
                <>
                  <UserRound size={18} />
                  Admin Panel
                </>
              )}
            </button>
          )}
          <button
            className="button ghost"
            onClick={() =>
              setViewMode((current) => (current === "history" ? "planner" : "history"))
            }
            type="button"
          >
            {viewMode === "history" ? (
              <>
                <ArrowLeft size={18} />
                Planner
              </>
            ) : (
              <>
                <CalendarDays size={18} />
                Workout History
              </>
            )}
          </button>
          <button
            className="button primary"
            disabled={!selectedPlan && !activeWorkout}
            onClick={() =>
              activeWorkout ? setViewMode("workout") : selectedPlan && startWorkout(selectedPlan)
            }
            type="button"
          >
            <Timer size={18} />
            {activeWorkout ? "Resume workout" : "Start selected"}
          </button>
          <button className="button ghost" onClick={onLogout} type="button">
            <LogOut size={18} />
            Log out
          </button>
        </div>
      </header>

      {dataError && <p className="login-error">{dataError}</p>}

      {isDataLoading ? (
        <section className="panel">
          <EmptyState icon={Clock} title="Loading workout data" />
        </section>
      ) : viewMode === "history" ? (
        <WorkoutHistoryView logs={workoutLogs} onDelete={deleteWorkoutLog} />
      ) : viewMode === "account" ? (
        <AccountPanel user={user} />
      ) : viewMode === "admin" && user.role === "admin" ? (
        <AdminPanel />
      ) : viewMode === "workout" && activeWorkout ? (
        <div className="workout-screen">
          <ActiveWorkoutPanel
            activeWorkout={activeWorkout}
            isFocused
            onAddExtra={addExtraExerciseToWorkout}
            onBack={() => setViewMode("planner")}
            onChangeEntry={changeWorkoutEntry}
            onFinish={finishWorkout}
            onRemoveEntry={removeWorkoutEntry}
            onReset={reloadWorkoutFromPlan}
            onTitleChange={(title) =>
              updateActiveWorkout((workout) => ({
                ...workout,
                title,
              }))
            }
            selectedPlan={selectedPlan}
          />
        </div>
      ) : (
        <div className="workspace-grid">
          <SessionPlansPanel
            plans={sessionPlans}
            selectedPlanId={selectedPlan?.id}
            onCreate={createPlan}
            onDelete={deletePlan}
            onSelect={setSelectedPlanId}
            onStart={startWorkout}
          />
          <SessionPlanBuilder
            plan={selectedPlan}
            onAddExercise={addExerciseToSelected}
            onDeleteExercise={deleteExerciseFromSelected}
            onReorderExercises={reorderExercisesInSelected}
            onStart={startWorkout}
            onUpdateExercise={updateExerciseInSelected}
            onUpdatePlan={updateSelectedPlan}
          />
          <div className="side-stack">
            <WorkoutResumePanel
              activeWorkout={activeWorkout}
              onResume={() => setViewMode("workout")}
              onStartSelected={() => selectedPlan && startWorkout(selectedPlan)}
              selectedPlan={selectedPlan}
            />
            <HistoryPanel
              emptyTitle="No workouts in the last seven days"
              eyebrow="Recent"
              logs={recentWorkoutLogs}
              onDelete={deleteWorkoutLog}
              title="Last 7 Days"
            />
          </div>
        </div>
      )}
    </main>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    apiRequest("/api/auth/me")
      .then((data) => {
        if (isMounted) setUser(data.user);
      })
      .catch(() => {
        if (isMounted) setUser(null);
      })
      .finally(() => {
        if (isMounted) setIsAuthLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function handleLogin(nextUser) {
    setUser(nextUser);
  }

  async function handleLogout() {
    await apiRequest("/api/auth/logout", {
      method: "POST",
      body: {},
    }).catch(() => null);
    setUser(null);
  }

  if (isAuthLoading) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <EmptyState icon={Clock} title="Checking session" />
        </section>
      </main>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <WorkoutApp key={user.username} onLogout={handleLogout} user={user} />;
}

createRoot(document.getElementById("root")).render(<App />);
