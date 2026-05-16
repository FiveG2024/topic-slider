import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export const metadata = {
  title: "Help & guide — Mahibere Kidusan",
  description: "How to use the classroom app for volunteers, school admins, and platform operators.",
};

function Section({
  id,
  title,
  eyebrow,
  children,
}: {
  id: string;
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold text-gray-900">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

function Sub({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3
      id={id}
      className="scroll-mt-24 pt-4 text-base font-semibold text-gray-900 first:pt-0"
    >
      {children}
    </h3>
  );
}

export default async function HelpPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const isAdmin = role === "ADMIN";
  const isSuper = role === "SUPER_ADMIN";
  const isVolunteer = role === "VOLUNTEER";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <div className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Help &amp; about</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          User guide
        </h1>
        <p className="mt-3 text-base text-gray-600">
          Quick reference for <strong className="text-gray-800">volunteers</strong>,{" "}
          <strong className="text-gray-800">school administrators</strong>, and{" "}
          <strong className="text-gray-800">platform operators</strong>. Jump to a topic below, or read the
          feature walkthroughs for day-to-day tasks.
        </p>
      </div>

      <nav
        aria-label="On this page"
        className="mb-10 rounded-xl border border-indigo-200 bg-indigo-50/80 p-4 text-sm"
      >
        <p className="font-semibold text-gray-900 mb-2">Jump to</p>
        <ul className="grid gap-1.5 text-indigo-700 sm:grid-cols-2">
          <li>
            <a href="#everyone" className="font-medium hover:underline">
              Everyone — overview
            </a>
          </li>
          <li>
            <a href="#classes-context" className="font-medium hover:underline">
              Classes &amp; subjects
            </a>
          </li>
          <li>
            <a href="#students" className="font-medium hover:underline">
              Students
            </a>
          </li>
          <li>
            <a href="#topics-present" className="font-medium hover:underline">
              Topics &amp; Present
            </a>
          </li>
          <li>
            <a href="#leaderboard" className="font-medium hover:underline">
              Leaderboard &amp; stars
            </a>
          </li>
          <li>
            <a href="#volunteers" className="font-medium hover:underline">
              Volunteers
            </a>
          </li>
          {isAdmin && (
            <li>
              <a href="#school-admin" className="font-medium hover:underline">
                School admin
              </a>
            </li>
          )}
          {isAdmin && (
            <li>
              <a href="#subject-pool" className="font-medium hover:underline">
                Subject pool
              </a>
            </li>
          )}
          {isSuper && (
            <li>
              <a href="#platform" className="font-medium hover:underline">
                Platform admin
              </a>
            </li>
          )}
          <li>
            <a href="#about" className="font-medium hover:underline">
              About &amp; features
            </a>
          </li>
        </ul>
        <p className="mt-3 text-xs text-gray-600">
          Your role:{" "}
          <span className="font-semibold capitalize text-gray-800">
            {role.toLowerCase().replaceAll("_", " ")}
          </span>
          {isVolunteer && " — see Volunteers plus shared sections above."}
          {isAdmin && " — see School admin for invites, archive, and audit."}
          {isSuper && " — classroom editing is read-only; use a school admin account to change lesson data."}
        </p>
      </nav>

      <div className="space-y-8">
        <Section id="everyone" title="Everyone — first steps" eyebrow="Basics">
          <>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Home</strong> (
                <Link href="/dashboard" className="text-indigo-600 hover:underline">
                  Dashboard
                </Link>
                ) — shortcuts to Present, Students, Leaderboard, Help, and Admin (if you have access).
              </li>
              <li>
                <strong>Class &amp; subject</strong> — tells the app which class section and subject you are
                working in. Almost everything (topics, students, stars) is filtered by this choice. The
                header shows your current site and class when they are set.
              </li>
              <li>
                <strong>Present</strong> — open a topic and run slides, quizzes, or a Jeopardy-style board.
              </li>
              <li>
                <strong>Students</strong> — roster for the <em>selected class</em>; add names or import a list.
              </li>
              <li>
                <strong>Leaderboard</strong> — star totals from quizzes; compare &quot;this subject&quot; vs
                &quot;whole class.&quot;
              </li>
            </ul>
            <p className="text-gray-600">
              If a page says you need context, open{" "}
              <Link href="/context" className="font-semibold text-indigo-600 hover:underline">
                Class &amp; subject
              </Link>{" "}
              first.
            </p>
          </>
        </Section>

        <Section id="classes-context" title="Classes & subjects — how to set up" eyebrow="Class & subject page">
          <>
            <p>
              Open{" "}
              <Link href="/context" className="font-semibold text-indigo-600 hover:underline">
                Class &amp; subject
              </Link>{" "}
              whenever you need to switch section or subject.
            </p>
            <Sub>Platform admins (super)</Sub>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Choose <strong>School site</strong> first (read-only browsing for that school).
              </li>
              <li>
                Pick <strong>Class</strong>, then <strong>Subject</strong>.
              </li>
              <li>
                Click <strong>Save &amp; go to dashboard</strong>.
              </li>
            </ol>
            <Sub>Volunteers &amp; school admins</Sub>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Select your <strong>Class</strong> (e.g. section code <code className="rounded bg-gray-100 px-1 text-xs">111</code>
                ).
              </li>
              <li>
                Then select <strong>Subject</strong>. The dropdown only lists subjects that an admin has{" "}
                <strong>linked from the shared pool</strong> to that class — so the same class in two sites can
                offer different subjects without duplicating the catalog.
              </li>
              <li>
                Click <strong>Save &amp; go to dashboard</strong>. Your header pill updates with site and class.
              </li>
            </ol>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-3 text-sm text-gray-800">
              <p className="font-semibold text-gray-900">New: Common Pool subjects</p>
              <p className="mt-1">
                Subjects no longer live inside a single class. Each site has a <strong>shared pool</strong> of
                subjects (e.g. <em>Bible Study</em>, <em>Mezmur</em>), and any subject can be linked to one or
                many classes. If a subject is missing from the dropdown, it just means it has not been linked
                to that class yet — ask an admin to use the pool picker.
              </p>
            </div>
            <Sub>Adding new classes or pool subjects (school admin only)</Sub>
            <p>
              On the same page, scroll to <strong>Add class or subject (admin)</strong> (light blue card):
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>New class</strong> — enter a short <strong>code</strong> (e.g. <code className="rounded bg-gray-100 px-1 text-xs">111</code>
                ) and optional display name, then <strong>Add class</strong>.
              </li>
              <li>
                <strong>New pool subject</strong> — enter a name (e.g. &quot;Bible Study&quot;), then{" "}
                <strong>Add to pool</strong>. It goes into the tenant-wide pool. If a class is already
                selected, it is linked to that class automatically; otherwise link it later from the pool
                picker.
              </li>
              <li>
                <strong>Link from pool</strong> — when a class is selected, admins see a small{" "}
                <em>Link from pool</em> button next to the Subject field. Open it to check which existing
                subjects should appear for this class.
              </li>
            </ul>
            <p className="text-gray-600">
              For the full pool view across every class, go to{" "}
              <Link href="/admin/subjects" className="text-indigo-600 hover:underline">
                Admin → Subject pool
              </Link>
              . Volunteers cannot add or link subjects; ask your school admin.
            </p>
          </>
        </Section>

        <Section id="students" title="Students — roster for your class" eyebrow="Students page">
          <>
            <p>
              Go to{" "}
              <Link href="/students" className="font-semibold text-indigo-600 hover:underline">
                Students
              </Link>{" "}
              after your <strong>Class &amp; subject</strong> is set. The list only includes students for the
              <strong> class</strong> you selected (subject does not split rosters).
            </p>
            <Sub>Add one student</Sub>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Under <strong>Add Student</strong>, enter <strong>First name</strong> and{" "}
                <strong>Last name</strong>.
              </li>
              <li>
                Click <strong>Add Student</strong>. They appear in the table with star totals.
              </li>
            </ol>
            <Sub>Bulk import (spreadsheet or photo)</Sub>
            <p>
              Use the <strong>Import students</strong> area below the form (when shown):
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Spreadsheet</strong> — upload <code className="rounded bg-gray-100 px-1 text-xs">.csv</code>,{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">.xlsx</code>, or{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">.xls</code>. Two columns (first / last) or one
                column (&quot;First Last&quot;) work; preview before confirming import.
              </li>
              <li>
                <strong>Photo</strong> — optional tab to upload a class list image; the app tries to read names
                (review the preview carefully before importing).
              </li>
            </ul>
            <Sub>Remove a student</Sub>
            <p>
              Click <strong>Remove</strong> on a row to <strong>archive</strong> that student (they disappear
              from the normal list). A school admin can restore archived students from{" "}
              <Link href="/admin/archive" className="text-indigo-600 hover:underline">
                Admin → Archive &amp; restore
              </Link>
              .
            </p>
          </>
        </Section>

        <Section id="topics-present" title="Topics, Present & quizzes" eyebrow="Lessons">
          <>
            <p>
              <strong>Topics</strong> (lessons) are created under{" "}
              <Link href="/admin" className="font-semibold text-indigo-600 hover:underline">
                Admin
              </Link>{" "}
              — <strong>school admins only</strong>. Each topic belongs to the class and subject chosen on the
              Admin page (match your teaching context or pick from the filters there).
            </p>
            <Sub>Create a topic (admin)</Sub>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Open <Link href="/admin" className="text-indigo-600 hover:underline">Admin</Link>, set{" "}
                <strong>Class</strong> and <strong>Subject</strong> if the dropdowns differ from your session.
                The Subject menu only shows subjects already linked to the chosen class.
              </li>
              <li>
                Enter a <strong>title</strong> and optional description, then <strong>Add Topic</strong>.
              </li>
              <li>
                Open the topic to add <strong>content</strong> (text, slides, images, video),{" "}
                <strong>quizzes</strong>, and optional <strong>Jeopardy</strong> boards.
              </li>
            </ol>
            <p className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-gray-800">
              <strong className="text-amber-900">Heads up:</strong> if the subject you need isn&apos;t in the
              dropdown, it just hasn&apos;t been linked to this class yet. Go to{" "}
              <Link href="/admin/subjects" className="text-indigo-700 hover:underline font-semibold">
                Admin → Subject pool
              </Link>{" "}
              or use the <em>Link from pool</em> button on{" "}
              <Link href="/context" className="text-indigo-700 hover:underline">
                Class &amp; subject
              </Link>{" "}
              to add it, then come back here to create the topic.
            </p>
            <Sub>Present (volunteer or admin)</Sub>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Go to{" "}
                <Link href="/present" className="text-indigo-600 hover:underline">
                  Present
                </Link>
                . Pick an <strong>untaught</strong> topic (or switch to taught topics if you need a repeat).
              </li>
              <li>
                Walk through slides; if the topic has a quiz or Jeopardy, follow the on-screen flow.
              </li>
              <li>
                After quizzes, assign <strong>stars</strong> to students as prompted — they feed the
                leaderboard.
              </li>
            </ol>
          </>
        </Section>

        <Section id="leaderboard" title="Leaderboard & stars" eyebrow="Stars">
          <>
            <p>
              <Link href="/leaderboard" className="font-semibold text-indigo-600 hover:underline">
                Leaderboard
              </Link>{" "}
              ranks students by total stars for the current <strong>class</strong>.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>This subject</strong> — only stars earned on topics in your current subject.
              </li>
              <li>
                <strong>All-time (class)</strong> — every star in that class across all subjects.
              </li>
              <li>
                The top student in each view gets a small badge (e.g. &quot;Session leader&quot; / &quot;All-time
                leader&quot;) when they have stars.
              </li>
            </ul>
          </>
        </Section>

        <Section id="volunteers" title="Volunteers" eyebrow="Substitute teachers & helpers">
          <>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Signing in</strong> — use the invite link and 6-digit passcode from your school admin (
                <Link href="/join" className="text-indigo-600 hover:underline">
                  Sign in with link &amp; passcode
                </Link>{" "}
                on the login page). You may appear as{" "}
                <code className="rounded bg-gray-100 px-1 text-xs">volunteer+YourName</code>.
              </li>
              <li>
                Use <strong>Class &amp; subject</strong>, <strong>Present</strong>,{" "}
                <strong>Students</strong>, and <strong>Leaderboard</strong> as described above. You cannot add
                classes, subjects, or new topics; ask an admin for curriculum setup.
              </li>
              <li>
                Lost access? Ask a <strong>school administrator</strong> for a new invite.
              </li>
            </ul>
          </>
        </Section>

        {isAdmin && (
          <Section id="school-admin" title="School administrators" eyebrow="Your site / DC">
            <>
              <Sub>Admin panel & topics</Sub>
              <p>
                <Link href="/admin" className="font-semibold text-indigo-600 hover:underline">
                  Admin
                </Link>{" "}
                — manage topics, content, quizzes, and Jeopardy for each class/subject. See{" "}
                <a href="#topics-present" className="text-indigo-600 hover:underline">
                  Topics &amp; Present
                </a>{" "}
                above.
              </p>
              <Sub id="subject-pool">Subject pool (Common Pool model)</Sub>
              <p>
                <Link href="/admin/subjects" className="font-semibold text-indigo-600 hover:underline">
                  Admin → Subject pool
                </Link>{" "}
                is where you curate the tenant-wide list of subjects and decide which classes can use each one.
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  <strong>Add a pool subject</strong> — give it a name, then optionally tick the classes it
                  should appear in (you can change this any time).
                </li>
                <li>
                  <strong>Edit class links</strong> — every subject row shows the classes it&apos;s linked to.
                  Open the editor to check or uncheck classes. Unchecking only removes the link — existing
                  topics in that class are kept; you just won&apos;t be able to create new ones with that pair
                  until you re-link.
                </li>
                <li>
                  <strong>From the class side</strong> — on{" "}
                  <Link href="/context" className="text-indigo-600 hover:underline">
                    Class &amp; subject
                  </Link>{" "}
                  pick a class and use <em>Link from pool</em> for a quick checkbox picker.
                </li>
                <li>
                  <strong>Same subject, multiple classes</strong> — link <em>Bible Study</em> to 111, 113,
                  and 115 once; topics, quizzes, and stars stay separate per class, but the subject definition
                  is shared.
                </li>
              </ul>
              <Sub>Volunteer invites</Sub>
              <p>
                <Link href="/admin/volunteer-access" className="font-semibold text-indigo-600 hover:underline">
                  Admin → Volunteer one-time invite
                </Link>
                : pick the volunteer user, enter their display name, set how many hours the invite stays valid,
                then generate <strong>link + passcode</strong> to send (SMS, email, etc.).
              </p>
              <Sub>Archive & audit</Sub>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <Link href="/admin/archive" className="text-indigo-600 hover:underline">
                    Archive &amp; restore
                  </Link>{" "}
                  — restore archived students, classes, subjects, or tenant-level items when your deployment
                  supports it.
                </li>
                <li>
                  <Link href="/admin/audit" className="text-indigo-600 hover:underline">
                    Audit log
                  </Link>{" "}
                  — review admin actions (invites, topics, etc.) for accountability.
                </li>
              </ul>
            </>
          </Section>
        )}

        {isSuper && (
          <Section id="platform" title="Platform administrators" eyebrow="Multi-site operators">
            <>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong>Platform</strong> (
                  <Link href="/super" className="text-indigo-600 hover:underline">
                    Platform
                  </Link>
                  ) — create and manage <strong>school sites</strong> (tenants), not individual lessons.
                </li>
                <li>
                  To preview a school&apos;s data, use <strong>Class &amp; subject</strong> to pick that site,
                  then class and subject. Editing topics or students in that mode is blocked; sign in as a
                  school admin to change content.
                </li>
                <li>
                  <strong>System portal</strong> — separate URL/login for super-admin access to the whole
                  platform (not the regular school login screen).
                </li>
              </ul>
            </>
          </Section>
        )}

        <Section id="about" title="About this app & features" eyebrow="Mahibere Kidusan / MK Educator">
          <>
            <p>
              <span className="font-abyssinica text-lg text-gray-900">ማህበረ ቅዱሳን</span>
              <span className="text-gray-600">
                {" "}
                — Mahibere Kidusan / MK Educator: a classroom companion for presentations, quizzes, and simple
                gamification (stars) in Sunday school and similar settings.
              </span>
            </p>
            <Sub>What the app includes</Sub>
            <ul className="list-disc space-y-1.5 pl-5 text-gray-700">
              <li>
                <strong>Multi-site</strong> — many school &quot;sites&quot; (e.g. DCs) on one deployment, with
                data kept separate.
              </li>
              <li>
                <strong>Classes &amp; subjects</strong> — organize teaching by section and track (e.g. Mezmur,
                Bible Study). Subjects live in a <strong>shared pool</strong> and are linked to one or many
                classes, so the same subject can be taught across sections without duplicating the catalog.
              </li>
              <li>
                <strong>Topics</strong> — lesson units with slides, text, images, and embedded video.
              </li>
              <li>
                <strong>Quizzes &amp; Jeopardy</strong> — interactive review; stars can be awarded after
                quizzes.
              </li>
              <li>
                <strong>Students</strong> — per-class roster, manual add, CSV/Excel import, optional photo
                import.
              </li>
              <li>
                <strong>Leaderboard</strong> — subject-scoped or class-wide star totals.
              </li>
              <li>
                <strong>Roles</strong> — volunteers (teach with invites), school admins (full curriculum and
                roster management), platform admins (sites only, read-only in classrooms).
              </li>
            </ul>
            <p className="text-gray-600">
              Technical setup (database, URLs, environment variables) is handled by whoever deploys the app. For
              that, contact your project owner or IT contact.
            </p>
            <p>
              <Link href="/dashboard" className="font-semibold text-indigo-600 hover:underline">
                ← Back to dashboard
              </Link>
            </p>
          </>
        </Section>
      </div>
    </div>
  );
}
