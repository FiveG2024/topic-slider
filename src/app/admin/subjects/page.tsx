"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { TeachingContextGuard } from "@/components/teaching-context-guard";
import { AccessRestricted } from "@/components/access-restricted";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { readApiErrorMessage } from "@/lib/api-client";
import {
  SUPER_ADMIN_WRITE_FORBIDDEN_MESSAGE,
  VOLUNTEER_FORBIDDEN_MESSAGE,
} from "@/lib/scope";

type ClassRef = { id: string; code: string; name: string | null };
type SubjectRow = { id: string; name: string; classes: ClassRef[] };
type LinkClassRow = { id: string; code: string; name: string | null; linked: boolean };

export default function AdminSubjectsPoolPage() {
  const { data: session, status: sessionStatus } = useSession();

  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [classes, setClasses] = useState<ClassRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newClassIds, setNewClassIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorClasses, setEditorClasses] = useState<LinkClassRow[]>([]);
  const [editorChecked, setEditorChecked] = useState<Set<string>>(new Set());
  const [editorSaving, setEditorSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setErr(null);
    const [subjRes, classRes] = await Promise.all([
      fetch("/api/admin/subjects"),
      fetch("/api/me/classes"),
    ]);
    if (!subjRes.ok) {
      setErr(await readApiErrorMessage(subjRes, "Could not load pool subjects."));
      setSubjects([]);
      setLoading(false);
      return;
    }
    const subjJson = (await subjRes.json()) as SubjectRow[];
    setSubjects(Array.isArray(subjJson) ? subjJson : []);

    if (classRes.ok) {
      const cls = await classRes.json();
      if (Array.isArray(cls)) {
        setClasses(
          cls.map((c: { id: string; code: string; name: string | null }) => ({
            id: c.id,
            code: c.code,
            name: c.name,
          }))
        );
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (sessionStatus !== "loading" && session?.user?.role === "ADMIN") {
      loadAll().catch(() => setLoading(false));
    }
    if (sessionStatus !== "loading" && session?.user?.role !== "ADMIN") {
      setLoading(false);
    }
  }, [session?.user?.role, sessionStatus, loadAll]);

  const classLabel = useCallback(
    (c: { code: string; name: string | null }) => (c.name ? `${c.code} — ${c.name}` : c.code),
    []
  );

  const sortedClasses = useMemo(
    () => [...classes].sort((a, b) => a.code.localeCompare(b.code)),
    [classes]
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          classIds: [...newClassIds],
        }),
      });
      if (!res.ok) {
        setErr(await readApiErrorMessage(res, "Could not create subject."));
        return;
      }
      setNewName("");
      setNewClassIds(new Set());
      await loadAll();
    } finally {
      setCreating(false);
    }
  }

  async function openEditor(subjectId: string) {
    setEditingId(subjectId);
    setEditorClasses([]);
    setEditorChecked(new Set());
    const res = await fetch(`/api/admin/subjects/${subjectId}/classes`);
    if (!res.ok) {
      setErr(await readApiErrorMessage(res, "Could not load class links."));
      setEditingId(null);
      return;
    }
    const data = await res.json();
    const list: LinkClassRow[] = Array.isArray(data?.classes) ? data.classes : [];
    setEditorClasses(list);
    setEditorChecked(new Set(list.filter((c) => c.linked).map((c) => c.id)));
  }

  function toggleEditor(id: string) {
    setEditorChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveEditor() {
    if (!editingId) return;
    setEditorSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/subjects/${editingId}/classes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classIds: [...editorChecked] }),
      });
      if (!res.ok) {
        setErr(await readApiErrorMessage(res, "Could not save links."));
        return;
      }
      setEditingId(null);
      await loadAll();
    } finally {
      setEditorSaving(false);
    }
  }

  function toggleNewClass(id: string) {
    setNewClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (sessionStatus === "loading") {
    return (
      <TeachingContextGuard>
        <div className="flex justify-center py-20 text-gray-500 font-medium">Loading...</div>
      </TeachingContextGuard>
    );
  }

  if (!session?.user || session.user.role !== "ADMIN") {
    const isSuper = session?.user?.role === "SUPER_ADMIN";
    return (
      <TeachingContextGuard>
        <AccessRestricted
          title={isSuper ? "View-only for platform admins" : "School admin only"}
          description={isSuper ? SUPER_ADMIN_WRITE_FORBIDDEN_MESSAGE : VOLUNTEER_FORBIDDEN_MESSAGE}
          hint={
            isSuper
              ? undefined
              : "Managing the subject pool is limited to school administrators."
          }
        />
      </TeachingContextGuard>
    );
  }

  return (
    <TeachingContextGuard>
      {loading ? (
        <div className="flex justify-center py-20 text-gray-500 font-medium">Loading...</div>
      ) : (
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Subject pool</h1>
              <p className="text-sm text-gray-600 mt-1">
                Subjects live in a shared tenant pool. Link each subject to one or many classes so
                teachers can use it when creating topics.
              </p>
            </div>
            <Link
              href="/admin"
              className="text-sm text-indigo-600 font-medium hover:underline shrink-0"
            >
              ← Admin home
            </Link>
          </div>

          <ApiErrorAlert
            message={err ?? ""}
            className="mb-4"
            onDismiss={err ? () => setErr(null) : undefined}
          />

          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Add a pool subject</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Bible Study"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900"
                  required
                />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">
                  Link to classes (optional — you can do this later)
                </p>
                {sortedClasses.length === 0 ? (
                  <p className="text-xs text-gray-500">No classes yet for this site.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {sortedClasses.map((c) => {
                      const on = newClassIds.has(c.id);
                      return (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => toggleNewClass(c.id)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition ${
                            on
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          {classLabel(c)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {creating ? "Adding…" : "Add to pool"}
              </button>
            </form>
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Pool subjects</h2>
            {subjects.length === 0 ? (
              <p className="text-sm text-gray-500">No active subjects in the pool yet.</p>
            ) : (
              <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                {subjects.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {s.classes.length === 0 ? (
                          <span className="text-amber-700">
                            Not linked to any class — invisible to teachers.
                          </span>
                        ) : (
                          <>
                            Linked to{" "}
                            <span className="text-gray-800">
                              {s.classes.map(classLabel).join(", ")}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditor(s.id)}
                        className="text-sm px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium border border-indigo-200"
                      >
                        Edit class links
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {editingId && (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
              onClick={() => !editorSaving && setEditingId(null)}
            >
              <div
                className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-5 pt-5 pb-3 border-b border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Link classes to{" "}
                    <span className="text-indigo-700">
                      {subjects.find((x) => x.id === editingId)?.name ?? "subject"}
                    </span>
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Unchecking removes the link but doesn’t delete existing topics in that class.
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-3">
                  {editorClasses.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4">No classes available.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {editorClasses.map((c) => (
                        <li key={c.id} className="py-2 flex items-center gap-3">
                          <input
                            id={`edit-${c.id}`}
                            type="checkbox"
                            checked={editorChecked.has(c.id)}
                            onChange={() => toggleEditor(c.id)}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <label
                            htmlFor={`edit-${c.id}`}
                            className="text-sm text-gray-900 cursor-pointer flex-1"
                          >
                            {classLabel(c)}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    disabled={editorSaving}
                    className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEditor}
                    disabled={editorSaving}
                    className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {editorSaving ? "Saving…" : "Save links"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </TeachingContextGuard>
  );
}
