"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { TeachingContextGuard } from "@/components/teaching-context-guard";
import { sessionHasTeachingContext } from "@/lib/teaching-context-client";

interface Topic {
  id: string;
  title: string;
  description: string | null;
  taught: boolean;
  taughtAt: string | null;
  _count: { contents: number; quizzes: number };
}

export default function PresentPage() {
  const { data: session, status } = useSession();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTaught, setShowTaught] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    if (!sessionHasTeachingContext(session.user)) return;

    let cancelled = false;
    setLoading(true);
    fetch("/api/topics")
      .then(async (r) => {
        const data = (await r.json()) as unknown;
        if (cancelled) return;
        setTopics(Array.isArray(data) ? (data as Topic[]) : []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setTopics([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status, session?.user]);

  const untaughtTopics = topics.filter((t) => !t.taught);
  const taughtTopics = topics.filter((t) => t.taught);
  const displayTopics = showTaught ? taughtTopics : untaughtTopics;

  return (
    <TeachingContextGuard>
      {loading ? (
        <div className="flex justify-center py-20 text-gray-500 font-medium">Loading...</div>
      ) : (
    <div className="max-w-[min(100%,56rem)] mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Present a Topic</h1>
      <p className="text-gray-600 mb-6">
        Choose a topic to present to students. Topics marked as taught <strong>in this class</strong> will be
        hidden by default — the same topic can still be untaught in another class.
      </p>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setShowTaught(false)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            !showTaught
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-900 hover:bg-indigo-50"
          }`}
        >
          Untaught ({untaughtTopics.length})
        </button>
        <button
          onClick={() => setShowTaught(true)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            showTaught
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-900 hover:bg-indigo-50"
          }`}
        >
          Already Taught ({taughtTopics.length})
        </button>
      </div>

      {displayTopics.length === 0 && (
        <p className="text-gray-600 text-center py-8">
          {showTaught
            ? "No topics have been taught yet."
            : "All topics have been taught! Switch to view taught topics."}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayTopics.map((topic) => (
          <Link
            key={topic.id}
            href={topic._count.contents > 0 ? `/present/${topic.id}` : "#"}
            className={`block p-6 bg-white rounded-xl shadow-sm border border-gray-200 transition-all ${
              topic._count.contents > 0
                ? "hover:shadow-md hover:border-indigo-300"
                : "opacity-60 cursor-not-allowed"
            }`}
          >
            <h3 className="text-lg font-semibold text-gray-900">{topic.title}</h3>
            {topic.description && (
              <p className="text-gray-600 text-sm mt-1">{topic.description}</p>
            )}
            <div className="flex gap-3 mt-3 text-xs text-gray-500">
              <span>{topic._count.contents} slides</span>
              <span>{topic._count.quizzes} quiz questions</span>
            </div>
            {topic._count.contents === 0 && (
              <p className="text-amber-700 text-xs mt-2">No content yet — add slides in admin</p>
            )}
          </Link>
        ))}
      </div>
    </div>
      )}
    </TeachingContextGuard>
  );
}
