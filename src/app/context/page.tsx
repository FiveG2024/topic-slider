"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Row = { id: string; code?: string; name?: string };
type TenantRow = { id: string; slug: string; name: string };
type PoolSubject = { id: string; name: string; linkedToCurrentClass: boolean };

export default function ContextPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const isSuper = session?.user?.role === "SUPER_ADMIN";

  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [viewTenantId, setViewTenantId] = useState("");
  const [classes, setClasses] = useState<Row[]>([]);
  const [subjects, setSubjects] = useState<Row[]>([]);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [newClassCode, setNewClassCode] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [adminMsg, setAdminMsg] = useState("");
  const classSelectRef = useRef<HTMLSelectElement>(null);
  const [poolOpen, setPoolOpen] = useState(false);
  const [poolSubjects, setPoolSubjects] = useState<PoolSubject[]>([]);
  const [poolChecked, setPoolChecked] = useState<Set<string>>(new Set());
  const [poolSaving, setPoolSaving] = useState(false);
  const [poolMsg, setPoolMsg] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (!isSuper || status !== "authenticated") return;
    fetch("/api/super/tenants")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: TenantRow[]) => {
        if (Array.isArray(data)) setTenants(data);
      })
      .catch(() => {});
  }, [isSuper, status]);

  useEffect(() => {
    if (session?.user?.superViewTenantId) {
      setViewTenantId(session.user.superViewTenantId);
    } else if (isSuper) {
      setViewTenantId("");
    }
  }, [session?.user?.superViewTenantId, isSuper]);

  const reloadClasses = useCallback(async () => {
    if (isSuper && !session?.user?.superViewTenantId) {
      setClasses([]);
      return;
    }
    const c = await fetch("/api/me/classes");
    if (!c.ok) {
      setClasses([]);
      return;
    }
    const cl = await c.json();
    if (Array.isArray(cl)) setClasses(cl);
  }, [isSuper, session?.user?.superViewTenantId]);

  /** Subjects available for a specific class — empty list before a class is picked. */
  const reloadSubjectsForClass = useCallback(
    async (cid: string) => {
      if (!cid) {
        setSubjects([]);
        return;
      }
      if (isSuper && !session?.user?.superViewTenantId) {
        setSubjects([]);
        return;
      }
      const s = await fetch(`/api/me/subjects?classId=${encodeURIComponent(cid)}`);
      if (!s.ok) {
        setSubjects([]);
        return;
      }
      const su = await s.json();
      if (Array.isArray(su)) setSubjects(su);
    },
    [isSuper, session?.user?.superViewTenantId]
  );

  useEffect(() => {
    if (status !== "authenticated") return;
    reloadClasses().catch(() => {});
  }, [status, reloadClasses]);

  useEffect(() => {
    if (status !== "authenticated") return;
    reloadSubjectsForClass(classId).catch(() => {});
  }, [status, classId, reloadSubjectsForClass]);

  useEffect(() => {
    if (!session?.user) return;
    if (session.user.classId) setClassId(session.user.classId);
    if (session.user.subjectId) setSubjectId(session.user.subjectId);
  }, [session?.user]);

  // If the saved subject is no longer linked to the chosen class, clear it so
  // the picker doesn't show a stale selection.
  useEffect(() => {
    if (!subjectId) return;
    if (subjects.length === 0) return;
    if (!subjects.some((s) => s.id === subjectId)) setSubjectId("");
  }, [subjects, subjectId]);

  const canPickClass = !isSuper || Boolean(viewTenantId);
  const classReady = Boolean(classId);
  const canSubmitForm =
    Boolean(classId && subjectId && (!isSuper || viewTenantId));

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!canPickClass) return;
    const t = window.setTimeout(() => classSelectRef.current?.focus(), 100);
    return () => window.clearTimeout(t);
  }, [status, canPickClass, viewTenantId, isSuper]);

  async function handleSuperTenantChange(e: ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    const t = tenants.find((x) => x.id === id);
    setViewTenantId(id);
    setClassId("");
    setSubjectId("");
    setError("");
    await update({
      superViewTenantId: id || null,
      superViewTenantSlug: t?.slug ?? null,
      classId: null,
      subjectId: null,
    });
    if (!id) {
      setClasses([]);
      setSubjects([]);
      return;
    }
    const c = await fetch("/api/me/classes");
    const cl = c.ok ? await c.json() : [];
    if (Array.isArray(cl)) setClasses(cl);
    setSubjects([]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (isSuper && !viewTenantId) {
      setError("Choose a school site first.");
      return;
    }
    if (!classId || !subjectId) {
      setError("Choose both a class and a subject.");
      return;
    }
    setSaving(true);
    try {
      if (isSuper) {
        const t = tenants.find((x) => x.id === viewTenantId);
        await update({
          superViewTenantId: viewTenantId,
          superViewTenantSlug: t?.slug ?? session?.user?.superViewTenantSlug ?? null,
          classId,
          subjectId,
        });
      } else {
        await update({ classId, subjectId });
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddClass(e: FormEvent) {
    e.preventDefault();
    setAdminMsg("");
    if (!newClassCode.trim()) return;
    const res = await fetch("/api/admin/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: newClassCode.trim(),
        name: newClassName.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAdminMsg(data.error || "Could not add class");
      return;
    }
    setNewClassCode("");
    setNewClassName("");
    await reloadClasses();
    setClassId(data.id);
    setAdminMsg("Class added.");
  }

  /**
   * New pool subjects start unlinked. If a class is selected, link the
   * subject to that class immediately so the teacher can use it right away.
   */
  async function handleAddSubject(e: FormEvent) {
    e.preventDefault();
    setAdminMsg("");
    if (!newSubjectName.trim()) return;
    const res = await fetch("/api/admin/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newSubjectName.trim(),
        classIds: classId ? [classId] : [],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAdminMsg(data.error || "Could not add subject");
      return;
    }
    setNewSubjectName("");
    await reloadSubjectsForClass(classId);
    if (classId) setSubjectId(data.id);
    setAdminMsg(
      classId
        ? "Subject added to pool and linked to this class."
        : "Subject added to pool. Open Subjects (admin) to link it to classes."
    );
  }

  /** Open the pool picker, fetching the current link state for the chosen class. */
  async function openPoolPicker() {
    if (!classId) return;
    setPoolMsg("");
    setPoolOpen(true);
    const res = await fetch(`/api/me/pool/subjects?classId=${encodeURIComponent(classId)}`);
    if (!res.ok) {
      setPoolMsg("Could not load the subject pool.");
      return;
    }
    const data = await res.json();
    const list: PoolSubject[] = Array.isArray(data?.subjects) ? data.subjects : [];
    setPoolSubjects(list);
    setPoolChecked(new Set(list.filter((s) => s.linkedToCurrentClass).map((s) => s.id)));
  }

  function togglePool(id: string) {
    setPoolChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function savePool() {
    if (!classId) return;
    setPoolSaving(true);
    setPoolMsg("");
    try {
      const res = await fetch(`/api/admin/classes/${classId}/subjects`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectIds: [...poolChecked] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPoolMsg(data.error || "Could not save links.");
        return;
      }
      setPoolMsg(
        `Saved. Linked ${data.added ?? 0}, unlinked ${data.removed ?? 0}.`
      );
      await reloadSubjectsForClass(classId);
      setPoolOpen(false);
    } finally {
      setPoolSaving(false);
    }
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex justify-center py-20 text-gray-500 font-medium">Loading...</div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10 sm:py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Class &amp; subject</h1>
      {isSuper ? (
        <p className="text-gray-600 mb-2">
          <span className="font-semibold text-indigo-600">Read-only browse.</span> Choose a school, then{" "}
          <strong className="text-gray-800">class</strong> and <strong className="text-gray-800">subject</strong>{" "}
          so topics and the leaderboard match that section.
        </p>
      ) : (
        <p className="text-gray-600 mb-2">
          Your site:{" "}
          <span className="font-semibold text-indigo-600">{session?.user?.tenantSlug}</span>.{" "}
          <strong className="text-gray-800">Start by choosing your class</strong>, then the subject you&apos;re
          teaching.
        </p>
      )}
      <p className="text-sm text-gray-500 mb-6">
        Tip: use <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-xs font-mono">Tab</kbd>{" "}
        to move through the list, or click the class box first — it opens ready for you.
      </p>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Your teaching context</p>

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm border border-red-200">
            {error}
          </div>
        )}

        {isSuper && (
          <div>
            <label htmlFor="viewTenantId" className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-1">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800">
                0
              </span>
              School site
            </label>
            <select
              id="viewTenantId"
              value={viewTenantId}
              onChange={handleSuperTenantChange}
              required
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900 bg-white"
            >
              <option value="">Select school…</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="classId" className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800">
              1
            </span>
            Class <span className="font-normal text-gray-500">— pick this first</span>
          </label>
          <select
            ref={classSelectRef}
            id="classId"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            required
            disabled={!canPickClass}
            aria-describedby="class-hint"
            className="w-full px-4 py-2.5 border-2 border-indigo-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 text-gray-900 bg-white disabled:opacity-50"
          >
            <option value="">{isSuper && !viewTenantId ? "Select a school first…" : "Select class…"}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
                {c.name ? ` — ${c.name}` : ""}
              </option>
            ))}
          </select>
          <p id="class-hint" className="mt-1.5 text-xs text-gray-500">
            {classes.length === 0 && canPickClass
              ? "No classes yet. Ask an admin to add one, or use the section below if you are an admin."
              : "Opens focused so you can start here right away."}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="subjectId" className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  classReady ? "bg-indigo-100 text-indigo-800" : "bg-gray-100 text-gray-400"
                }`}
              >
                2
              </span>
              Subject
            </label>
            {session?.user?.role === "ADMIN" && !isSuper && classReady && (
              <button
                type="button"
                onClick={openPoolPicker}
                className="text-xs font-medium text-indigo-700 hover:text-indigo-800 underline"
              >
                Link from pool
              </button>
            )}
          </div>
          <select
            id="subjectId"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            required
            disabled={!canPickClass || !classReady}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">
              {!canPickClass
                ? "Select a school first…"
                : !classReady
                  ? "Choose a class first…"
                  : subjects.length === 0
                    ? "No subjects linked to this class yet…"
                    : "Select subject…"}
            </option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {classReady && subjects.length === 0 && (
            <p className="mt-1.5 text-xs text-amber-700">
              {session?.user?.role === "ADMIN" && !isSuper
                ? "This class has no subjects linked from the pool yet. Use “Link from pool” above."
                : "Ask an admin to link subjects from the pool to this class."}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving || !canSubmitForm}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-200 shadow-sm"
        >
          {saving ? "Saving…" : canSubmitForm ? "Save & go to dashboard" : "Choose class and subject to continue"}
        </button>
      </form>

      {session?.user?.role === "ADMIN" && !isSuper && (
        <div className="mt-8 p-5 rounded-xl border border-indigo-300 bg-indigo-50">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Add class or subject (admin)</h2>
          {adminMsg && <p className="text-xs text-gray-600 mb-3">{adminMsg}</p>}
          <div className="grid sm:grid-cols-2 gap-4">
            <form onSubmit={handleAddClass} className="space-y-2">
              <p className="text-xs font-medium text-gray-800">New class</p>
              <input
                value={newClassCode}
                onChange={(e) => setNewClassCode(e.target.value)}
                placeholder="Code (e.g. 111)"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900"
              />
              <input
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder="Name (optional)"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900"
              />
              <button
                type="submit"
                className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg border border-indigo-200"
              >
                Add class
              </button>
            </form>
            <form onSubmit={handleAddSubject} className="space-y-2">
              <p className="text-xs font-medium text-gray-800">New pool subject</p>
              <input
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                placeholder="e.g. Bible Study"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900"
              />
              <p className="text-[11px] text-gray-600 leading-snug">
                Goes into the shared pool. {classId ? "It will be linked to the selected class automatically." : "Pick a class first to link it instantly, or open the pool picker after."}
              </p>
              <button
                type="submit"
                className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg border border-indigo-200 mt-1"
              >
                Add to pool
              </button>
            </form>
          </div>
        </div>
      )}

      {poolOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
          onClick={() => !poolSaving && setPoolOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Link subjects from pool</h3>
              <p className="text-sm text-gray-600 mt-1">
                Pick which shared pool subjects are available for{" "}
                <span className="font-medium">
                  {(() => {
                    const c = classes.find((x) => x.id === classId);
                    return c ? `${c.code}${c.name ? ` — ${c.name}` : ""}` : "this class";
                  })()}
                </span>
                . Unchecking removes the link but does not delete topics.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {poolSubjects.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">
                  The pool is empty. Add a new subject below the form first.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {poolSubjects.map((s) => (
                    <li key={s.id} className="py-2 flex items-center gap-3">
                      <input
                        id={`pool-${s.id}`}
                        type="checkbox"
                        checked={poolChecked.has(s.id)}
                        onChange={() => togglePool(s.id)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <label htmlFor={`pool-${s.id}`} className="text-sm text-gray-900 cursor-pointer flex-1">
                        {s.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {poolMsg && <p className="mt-2 text-xs text-gray-600">{poolMsg}</p>}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPoolOpen(false)}
                disabled={poolSaving}
                className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePool}
                disabled={poolSaving}
                className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {poolSaving ? "Saving…" : "Save links"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
