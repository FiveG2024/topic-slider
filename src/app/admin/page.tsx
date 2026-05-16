"use client";

import { useCallback, useEffect, useState } from "react";
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
import { sessionDisplayName } from "@/lib/user-display";

type TopicUserRef = { username: string; displayName: string | null; role: string };

interface Topic {
  id: string;
  title: string;
  description: string | null;
  taught: boolean;
  taughtAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { contents: number; quizzes: number };
  createdBy?: TopicUserRef | null;
  updatedBy?: TopicUserRef | null;
}

type CatRow = { id: string; code?: string; name?: string };

export default function AdminPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [classes, setClasses] = useState<CatRow[]>([]);
  const [subjects, setSubjects] = useState<CatRow[]>([]);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const reloadClasses = useCallback(async () => {
    const c = await fetch("/api/me/classes");
    if (!c.ok) return;
    const cl = await c.json();
    if (Array.isArray(cl)) setClasses(cl);
  }, []);

  const reloadSubjectsForClass = useCallback(async (cid: string) => {
    if (!cid) {
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
  }, []);

  useEffect(() => {
    if (session?.user) {
      reloadClasses().catch(() => {});
    }
  }, [session?.user, reloadClasses]);

  useEffect(() => {
    if (session?.user?.classId) setClassId(session.user.classId);
    if (session?.user?.subjectId) setSubjectId(session.user.subjectId);
  }, [session?.user?.classId, session?.user?.subjectId]);

  useEffect(() => {
    reloadSubjectsForClass(classId).catch(() => {});
  }, [classId, reloadSubjectsForClass]);

  useEffect(() => {
    if (!subjectId) return;
    if (subjects.length === 0) return;
    if (!subjects.some((s) => s.id === subjectId)) setSubjectId("");
  }, [subjects, subjectId]);

  const fetchTopics = useCallback(async () => {
    setPageError("");
    const res = await fetch("/api/topics");
    if (!res.ok) {
      setTopics([]);
      setLoading(false);
      setPageError(await readApiErrorMessage(res, "Could not load topics."));
      return;
    }
    const data = await res.json();
    setTopics(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!session?.user?.classId || !session?.user?.subjectId) return;
    setLoading(true);
    fetchTopics();
  }, [session?.user?.classId, session?.user?.subjectId, fetchTopics]);

  async function handleCreateTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !classId || !subjectId) return;
    setPageError("");

    const res = await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, classId, subjectId }),
    });
    if (!res.ok) {
      setPageError(await readApiErrorMessage(res, "Could not create the topic."));
      return;
    }

    setTitle("");
    setDescription("");
    fetchTopics();
  }

  async function handleDeleteTopic(id: string) {
    if (!confirm("Delete this topic and all its content?")) return;
    setPageError("");
    const res = await fetch(`/api/topics/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setPageError(await readApiErrorMessage(res, "Could not delete the topic."));
      return;
    }
    fetchTopics();
  }

  async function handleToggleTaught(id: string, currentlyTaught: boolean) {
    setPageError("");
    const res = await fetch(`/api/topics/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taught: !currentlyTaught }),
    });
    if (!res.ok) {
      setPageError(await readApiErrorMessage(res, "Could not update the topic."));
      return;
    }
    fetchTopics();
  }

  if (sessionStatus === "loading") {
    return (
      <TeachingContextGuard>
        <div className="flex justify-center py-20 text-gray-500">Loading...</div>
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
              : "Use Present or Students from the menu for teaching tools you’re allowed to use."
          }
        />
      </TeachingContextGuard>
    );
  }

  return (
    <TeachingContextGuard>
      {loading ? (
        <div className="flex justify-center py-20 text-gray-500">Loading...</div>
      ) : (
        <div className="max-w-5xl mx-auto px-4 py-8">
          <ApiErrorAlert
            message={pageError}
            className="mb-6"
            onDismiss={pageError ? () => setPageError("") : undefined}
          />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Panel</h1>
          <p className="text-sm text-gray-600 mb-6">
            Topics here belong to your current <strong>subject</strong> and are shared across every class
            it&apos;s linked to. The <em>taught</em> badge below tracks just <strong>this class</strong> (
            <Link href="/context" className="text-indigo-600 font-medium hover:underline">
              change context
            </Link>
            ).
          </p>

          <div className="mb-6 p-4 rounded-xl border border-gray-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">Archive & restore</h2>
              <p className="text-sm text-gray-600 mt-1">
                Safely archive classes, subjects, students, or the whole site (recoverable).
              </p>
            </div>
            <Link
              href="/admin/archive"
              className="shrink-0 bg-gray-100 hover:bg-gray-200 text-gray-900 text-sm font-medium px-4 py-2 rounded-lg text-center border border-gray-300"
            >
              Open archive tools
            </Link>
          </div>

          <div className="mb-6 p-4 rounded-xl border border-gray-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">Subject pool</h2>
              <p className="text-sm text-gray-600 mt-1">
                Manage shared pool subjects and link them to one or many classes.
              </p>
            </div>
            <Link
              href="/admin/subjects"
              className="shrink-0 bg-gray-100 hover:bg-gray-200 text-gray-900 text-sm font-medium px-4 py-2 rounded-lg text-center border border-gray-300"
            >
              Manage subject pool
            </Link>
          </div>

          <div className="mb-6 p-4 rounded-xl border border-gray-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">Activity log</h2>
              <p className="text-sm text-gray-600 mt-1">
                Who changed topics, slides, quizzes, Jeopardy, and invites — with timestamps.
              </p>
            </div>
            <Link
              href="/admin/audit"
              className="shrink-0 bg-white hover:bg-gray-50 text-gray-900 text-sm font-medium px-4 py-2 rounded-lg text-center border border-gray-300"
            >
              View activity log
            </Link>
          </div>

          <div className="mb-8 p-4 rounded-xl border border-indigo-200 bg-indigo-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">Volunteer one-time invite</h2>
              <p className="text-sm text-gray-600 mt-1">
                Generate a single-use link and passcode to copy and send to a volunteer.
              </p>
            </div>
            <Link
              href="/admin/volunteer-access"
              className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg text-center border border-indigo-700"
            >
              Open invite tool
            </Link>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Topic</h2>
            <form onSubmit={handleCreateTopic} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Class</label>
                  <select
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  >
                    <option value="">Select…</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}
                        {c.name ? ` — ${c.name}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
                  <select
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    required
                    disabled={!classId}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 disabled:opacity-50"
                  >
                    <option value="">
                      {!classId
                        ? "Pick a class first…"
                        : subjects.length === 0
                          ? "No subjects linked to this class"
                          : "Select…"}
                    </option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {classId && subjects.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      <Link href="/admin/subjects" className="underline font-medium">
                        Manage the subject pool
                      </Link>{" "}
                      to link subjects to this class.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Topic title"
                  required
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900"
                />
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-2 rounded-lg transition-colors whitespace-nowrap"
                >
                  Add Topic
                </button>
              </div>
            </form>
          </div>

          <div className="space-y-4">
            {topics.length === 0 && (
              <p className="text-gray-500 text-center py-8">No topics for this class and subject yet.</p>
            )}
            {topics.map((topic) => (
              <div
                key={topic.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-start justify-between gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900">{topic.title}</h3>
                    {topic.taught && (
                      <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
                        Taught
                      </span>
                    )}
                  </div>
                  {topic.description && (
                    <p className="text-gray-600 text-sm mb-2">{topic.description}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    {topic._count.contents} content slide(s) · {topic._count.quizzes} quiz question(s)
                  </p>
                  <div className="text-xs text-gray-500 mt-2 space-y-0.5">
                    {topic.createdBy ? (
                      <p>
                        Created by <span className="font-medium">{sessionDisplayName(topic.createdBy)}</span> ·{" "}
                        {new Date(topic.createdAt).toLocaleString()}
                      </p>
                    ) : (
                      <p>Created · {new Date(topic.createdAt).toLocaleString()}</p>
                    )}
                    <p>
                      Last updated{" "}
                      {topic.updatedBy ? (
                        <span className="font-medium">{sessionDisplayName(topic.updatedBy)}</span>
                      ) : (
                        "—"
                      )}{" "}
                      · {new Date(topic.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                  <button
                    type="button"
                    onClick={() => handleToggleTaught(topic.id, topic.taught)}
                    className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      topic.taught
                        ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                        : "bg-green-100 text-green-700 hover:bg-green-200"
                    }`}
                  >
                    {topic.taught ? "Mark Untaught" : "Mark Taught"}
                  </button>
                  <Link
                    href={`/admin/topics/${topic.id}`}
                    className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors border border-indigo-200"
                  >
                    Edit Content
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDeleteTopic(topic.id)}
                    className="bg-red-100 text-red-700 hover:bg-red-200 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </TeachingContextGuard>
  );
}
