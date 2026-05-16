import { createHash } from "crypto";
import { ContentKind, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Shown on login backdrop for every school site (`/api/quotes?tenantSlug=…`). */
const DEFAULT_LOGIN_QUOTES = [
  {
    quote:
      "Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.",
    reference: "Philippians 4:6",
    category: "Faith",
  },
  {
    quote: "Trust in the Lord with all your heart and lean not on your own understanding.",
    reference: "Proverbs 3:5",
    category: "Wisdom",
  },
  {
    quote: "Shout for joy to the Lord, all the earth.",
    reference: "Psalm 100:1",
    category: "Worship",
  },
  {
    quote: "Let everything that has breath praise the Lord.",
    reference: "Psalm 150:6",
    category: "Worship",
  },
] as const;

async function seedLoginQuotesForTenant(tenantId: string) {
  for (const q of DEFAULT_LOGIN_QUOTES) {
    const exists = await prisma.quote.findFirst({
      where: { tenantId, reference: q.reference },
    });
    if (!exists) {
      await prisma.quote.create({
        data: { tenantId, ...q },
      });
    }
  }
}

const CLASS_CODES = ["111", "113", "115", "119"];
const SUBJECT_NAMES = ["Bible Study", "Mezmur", "Amharic"];

/** Idempotent marker topic title — if present, rich sample data is assumed seeded. */
const RICH_SAMPLE_TOPIC_TITLE = "Sample: All content types (seed)";

async function seedTenant(
  slug: string,
  name: string,
  adminUser: string,
  volunteerUser: string,
  adminPassword: string,
  volunteerPassword: string
) {
  let tenant = await prisma.tenant.findFirst({
    where: { slug, deletedAt: null },
  });
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { slug, name } });
  } else {
    tenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: { name },
    });
  }

  for (const code of CLASS_CODES) {
    const existing = await prisma.schoolClass.findFirst({
      where: { tenantId: tenant.id, code, deletedAt: null },
    });
    if (!existing) {
      await prisma.schoolClass.create({
        data: { tenantId: tenant.id, code, name: `Class ${code}` },
      });
    }
  }

  for (const subName of SUBJECT_NAMES) {
    const existing = await prisma.subject.findFirst({
      where: { tenantId: tenant.id, name: subName, deletedAt: null },
    });
    if (!existing) {
      await prisma.subject.create({
        data: { tenantId: tenant.id, name: subName },
      });
    }
  }

  // Common Pool defaults: link every seeded subject to every seeded class for
  // this tenant. Idempotent — skipDuplicates avoids re-inserting on re-seed.
  const tenantClasses = await prisma.schoolClass.findMany({
    where: { tenantId: tenant.id, deletedAt: null },
    select: { id: true },
  });
  const tenantSubjects = await prisma.subject.findMany({
    where: { tenantId: tenant.id, deletedAt: null },
    select: { id: true },
  });
  if (tenantClasses.length && tenantSubjects.length) {
    await prisma.subjectClass.createMany({
      data: tenantSubjects.flatMap((s) =>
        tenantClasses.map((c) => ({
          tenantId: tenant.id,
          subjectId: s.id,
          classId: c.id,
        }))
      ),
      skipDuplicates: true,
    });
  }

  await prisma.user.upsert({
    where: {
      tenantId_username: { tenantId: tenant.id, username: adminUser },
    },
    update: { password: adminPassword },
    create: {
      tenantId: tenant.id,
      username: adminUser,
      password: adminPassword,
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: {
      tenantId_username: { tenantId: tenant.id, username: volunteerUser },
    },
    update: { password: volunteerPassword },
    create: {
      tenantId: tenant.id,
      username: volunteerUser,
      password: volunteerPassword,
      role: "VOLUNTEER",
    },
  });

  await seedLoginQuotesForTenant(tenant.id);

  return tenant;
}

/**
 * Production-like fixtures for QA: quotes, students, topics (taught + untaught),
 * all ContentKind values, quizzes, stars, and an unused volunteer invite.
 */
async function seedRichSampleContent(tenantId: string) {
  const already = await prisma.topic.findFirst({
    where: { tenantId, title: RICH_SAMPLE_TOPIC_TITLE },
  });
  if (already) {
    console.log(`  (rich sample already seeded for tenant ${tenantId})`);
    return;
  }

  const class111 = await prisma.schoolClass.findFirst({
    where: { tenantId, code: "111", deletedAt: null },
  });
  const class113 = await prisma.schoolClass.findFirst({
    where: { tenantId, code: "113", deletedAt: null },
  });
  const bible = await prisma.subject.findFirst({
    where: { tenantId, name: "Bible Study", deletedAt: null },
  });
  const mezmur = await prisma.subject.findFirst({
    where: { tenantId, name: "Mezmur", deletedAt: null },
  });

  if (!class111 || !class113 || !bible || !mezmur) {
    console.warn("  skip rich sample: missing class 111/113 or Bible Study/Mezmur");
    return;
  }

  const volunteer = await prisma.user.findFirst({
    where: { tenantId, role: "VOLUNTEER" },
  });
  if (!volunteer) {
    console.warn("  skip rich sample: no volunteer user");
    return;
  }

  await seedLoginQuotesForTenant(tenantId);

  const studentSeeds = [
    { firstName: "Liya", lastName: "Gebremariam" },
    { firstName: "Mikael", lastName: "Tesfaye" },
    { firstName: "Sara", lastName: "Haile" },
  ];

  const students: { id: string }[] = [];
  for (const s of studentSeeds) {
    let row = await prisma.student.findFirst({
      where: {
        tenantId,
        classId: class111.id,
        firstName: s.firstName,
        lastName: s.lastName,
        deletedAt: null,
      },
    });
    if (!row) {
      row = await prisma.student.create({
        data: {
          tenantId,
          classId: class111.id,
          firstName: s.firstName,
          lastName: s.lastName,
        },
      });
    }
    students.push(row);
  }

  const topicMain = await prisma.topic.create({
    data: {
      tenantId,
      subjectId: bible.id,
      title: RICH_SAMPLE_TOPIC_TITLE,
      description:
        "Demonstrates TEXT, SLIDE, IMAGE (https), VIDEO (YouTube), and quizzes — safe to delete in production.",
      sortOrder: 0,
    },
  });

  const contentRows: {
    kind: ContentKind;
    title: string;
    body: string;
    sortOrder: number;
  }[] = [
    {
      kind: "TEXT",
      title: "Introduction (markdown text block)",
      sortOrder: 0,
      body: `## Goals for today
- Review the **main idea** and discuss as a group
- Use the *slide* and *media* blocks below in presentation mode

> Discussion: What stood out from last week?

---

### Takeaways
1. Connect the lesson to daily life.
2. Preview the quiz at the end.`,
    },
    {
      kind: "SLIDE",
      title: "Key points (slide-style layout)",
      sortOrder: 1,
      body: `## Big idea
God invites us into **peace** and **trust**.

### Three reminders
- Listen actively
- Ask honest questions
- Encourage one another`,
    },
    {
      kind: "IMAGE",
      title: "Illustration (HTTPS image URL)",
      sortOrder: 2,
      body: "https://picsum.photos/id/1025/1200/800",
    },
    {
      kind: "VIDEO",
      title: "Example video (YouTube link)",
      sortOrder: 3,
      body: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    },
    {
      kind: "TEXT",
      title: "Wrap-up checklist",
      sortOrder: 4,
      body: `Before you leave:
- [ ] Key verse named
- [ ] Next steps for students
- [ ] Prayer

**Optional:** Link to readings for home.`,
    },
  ];

  for (const c of contentRows) {
    await prisma.content.create({
      data: {
        topicId: topicMain.id,
        kind: c.kind,
        title: c.title,
        body: c.body,
        sortOrder: c.sortOrder,
      },
    });
  }

  await prisma.quiz.createMany({
    data: [
      {
        topicId: topicMain.id,
        question: "Sample quiz: What is 2 + 2?",
        options: ["3", "4", "5", "22"],
        answer: 1,
      },
      {
        topicId: topicMain.id,
        question: "Sample quiz: Which city is the capital of France?",
        options: ["London", "Paris", "Berlin", "Madrid"],
        answer: 1,
      },
    ],
  });

  if (students[0] && students[1]) {
    await prisma.star.upsert({
      where: {
        studentId_topicId: { studentId: students[0].id, topicId: topicMain.id },
      },
      update: { points: 5 },
      create: {
        studentId: students[0].id,
        topicId: topicMain.id,
        points: 5,
      },
    });
    await prisma.star.upsert({
      where: {
        studentId_topicId: { studentId: students[1].id, topicId: topicMain.id },
      },
      update: { points: 3 },
      create: {
        studentId: students[1].id,
        topicId: topicMain.id,
        points: 3,
      },
    });
  }

  const taughtAt = new Date("2025-01-15T10:30:00.000Z");
  const topicTaught = await prisma.topic.create({
    data: {
      tenantId,
      subjectId: mezmur.id,
      title: "Sample: Taught topic (seed)",
      description: "Marked taught with a past date — appears as completed in filters.",
      sortOrder: 0,
    },
  });
  // Per-class taught record for the rich sample.
  await prisma.topicClassStatus.upsert({
    where: { topicId_classId: { topicId: topicTaught.id, classId: class113.id } },
    update: { taught: true, taughtAt },
    create: {
      topicId: topicTaught.id,
      classId: class113.id,
      taught: true,
      taughtAt,
    },
  });

  await prisma.content.create({
    data: {
      topicId: topicTaught.id,
      kind: "SLIDE",
      title: "Review slide (taught topic)",
      sortOrder: 0,
      body: "## Review\n\nWe covered **melody** and **meaning** last session.",
    },
  });

  await prisma.content.create({
    data: {
      topicId: topicTaught.id,
      kind: "VIDEO",
      title: "Alternate video host (http allowed for VIDEO)",
      sortOrder: 1,
      body: "https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4",
    },
  });

  await prisma.quiz.create({
    data: {
      topicId: topicTaught.id,
      question: "Quick check: Which option is correct?",
      options: ["First", "Second (correct)", "Third"],
      answer: 1,
    },
  });

  const inviteToken = createHash("sha256")
    .update(`seed-volunteer-invite-${tenantId}`)
    .digest("hex")
    .slice(0, 48);
  const invitePasscode = "123456";
  const passcodeHash = await bcrypt.hash(invitePasscode, 10);
  const existingInvite = await prisma.volunteerInvite.findUnique({
    where: { token: inviteToken },
  });
  if (!existingInvite) {
    await prisma.volunteerInvite.create({
      data: {
        token: inviteToken,
        passcodeHash,
        telegramChatId: null,
        volunteerLabel: "Demo",
        userId: volunteer.id,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        usedAt: null,
      },
    });
  }

  console.log(`  rich sample: topics, contents (TEXT/SLIDE/IMAGE/VIDEO), quizzes, stars, quotes, invite`);
  console.log(
    `  demo volunteer invite → /join?t=${inviteToken}  passcode: ${invitePasscode}`
  );
}

async function ensurePlatformTenant() {
  let t = await prisma.tenant.findFirst({
    where: { isPlatform: true, deletedAt: null },
  });
  if (!t) {
    t = await prisma.tenant.create({
      data: {
        slug: "__platform__",
        name: "Platform",
        isPlatform: true,
      },
    });
  }
  return t;
}

async function main() {
  const platform = await ensurePlatformTenant();
  const superAdminPassword = await bcrypt.hash(
    process.env.SUPER_ADMIN_PASSWORD || "superadmin123",
    10
  );
  const superAdminUsername = process.env.SUPER_ADMIN_USERNAME || "superadmin";
  await prisma.user.upsert({
    where: {
      tenantId_username: { tenantId: platform.id, username: superAdminUsername },
    },
    update: { password: superAdminPassword, role: "SUPER_ADMIN" },
    create: {
      tenantId: platform.id,
      username: superAdminUsername,
      password: superAdminPassword,
      role: "SUPER_ADMIN",
    },
  });
  console.log(
    `Platform super admin → sign in with "Platform (super admin)" / ${superAdminUsername} / (password from SUPER_ADMIN_PASSWORD or default)`
  );

  const adminPassword = await bcrypt.hash(
    process.env.ADMIN_PASSWORD || "admin123",
    10
  );
  const volunteerPassword = await bcrypt.hash(
    process.env.VOLUNTEER_PASSWORD || "volunteer123",
    10
  );

  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const volunteerUsername = process.env.VOLUNTEER_USERNAME || "volunteer";

  const sites: { slug: string; name: string; richSample?: boolean }[] = [
    { slug: "demo", name: "Demo (full sample data)", richSample: true },
    { slug: "dc1", name: "DC1" },
    { slug: "dc2", name: "DC2" },
    { slug: "va1", name: "VA1" },
    { slug: "va2", name: "VA2" },
  ];

  for (const s of sites) {
    const tenant = await seedTenant(
      s.slug,
      s.name,
      adminUsername,
      volunteerUsername,
      adminPassword,
      volunteerPassword
    );
    console.log(`Seeded tenant ${s.slug} (${s.name})`);
    if (s.richSample) {
      await seedRichSampleContent(tenant.id);
    }
  }

  console.log("Done. Log in with Site + username + password (same usernames per site).");
  console.log('For full fixtures, use Site "demo" (admin / volunteer same passwords as env defaults).');
  console.log(
    "Super admins: login → Platform (super admin), then Class & subject to pick a school (read-only browse)."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
