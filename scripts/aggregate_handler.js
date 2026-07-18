// TODO
// scripts/decay-occupancy.js
// Run via linux cron, e.g.:
// */5 * * * * cd /path/to/app && node scripts/decay-occupancy.js >> logs/occupancy-decay.log 2>&1

const { PrismaClient } = require("../src/generated");

const prisma = new PrismaClient();

const SESSION_WINDOW_MS = 90 * 60 * 1000; // 90 min, tune per business
const GYM_BATCH_SIZE = 50;

async function decayGymOccupancy(gym, now) {
  // First run for this gym: no watermark yet.
  // Seed it to (now - sessionWindow) so we don't try to decay
  // check-ins from the dawn of time on the first execution.
  const watermark =
    gym.gymMetrics?.occupancyWatermark ??
    new Date(now.getTime() - SESSION_WINDOW_MS);

  // A check-in "ages out" once (timestamp + window) has passed.
  // So we want IN logs whose timestamp falls in:
  //   (watermark - window, now - window]
  const rangeStart = new Date(watermark.getTime() - SESSION_WINDOW_MS);
  const rangeEnd = new Date(now.getTime() - SESSION_WINDOW_MS);

  const expiredCount = await prisma.attendanceLog.count({
    where: {
      gymId: gym.id,
      type: "IN",
      timestamp: {
        gt: rangeStart,
        lte: rangeEnd,
      },
    },
  });

  if (expiredCount === 0) {
    // Still advance the watermark even with zero expirations,
    // otherwise a quiet gym re-scans the same empty range forever.
    await prisma.gymMetrics.upsert({
      where: { gymId: gym.id },
      create: {
        gymId: gym.id,
        currentOccupancy: 0,
        occupancyWatermark: now,
        lastUpdated: now,
      },
      update: {
        occupancyWatermark: now,
        lastUpdated: now,
      },
    });
    return { gymId: gym.id, expiredCount: 0 };
  }

  await prisma.$transaction(async (tx) => {
    const metrics = await tx.gymMetrics.findUnique({
      where: { gymId: gym.id },
    });
    const current = metrics?.currentOccupancy ?? 0;
    const nextOccupancy = Math.max(0, current - expiredCount);

    await tx.gymMetrics.upsert({
      where: { gymId: gym.id },
      create: {
        gymId: gym.id,
        currentOccupancy: 0, // no prior state existed, nothing to decrement from
        occupancyWatermark: now,
        lastUpdated: now,
      },
      update: {
        currentOccupancy: nextOccupancy,
        occupancyWatermark: now,
        lastUpdated: now,
      },
    });
  });

  return { gymId: gym.id, expiredCount };
}

async function run() {
  const startedAt = Date.now();
  const now = new Date();
  let cursor = null;
  let processed = 0;
  let totalExpired = 0;
  const errors = [];

  // Cursor-paginate gyms so this scales past a handful of tenants
  // without loading everything into memory at once.
  while (true) {
    const gyms = await prisma.gym.findMany({
      where: { isDeleted: false },
      take: GYM_BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      include: { gymMetrics: true },
    });

    if (gyms.length === 0) break;

    // Process gyms in this batch concurrently, but isolate failures
    // per-gym so one bad row doesn't kill the whole cron run.
    const results = await Promise.allSettled(
      gyms.map((gym) => decayGymOccupancy(gym, now)),
    );

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        processed += 1;
        totalExpired += result.value.expiredCount;
      } else {
        errors.push({
          gymId: gyms[i].id,
          error: result.reason?.message ?? String(result.reason),
        });
      }
    });

    cursor = gyms[gyms.length - 1].id;
    if (gyms.length < GYM_BATCH_SIZE) break;
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    JSON.stringify({
      job: "decay-occupancy",
      processed,
      totalExpired,
      errorCount: errors.length,
      errors,
      durationMs,
      finishedAt: new Date().toISOString(),
    }),
  );

  if (errors.length > 0) {
    process.exitCode = 1; // non-zero exit so cron/monitoring can flag failed runs
  }
}

run()
  .catch((err) => {
    console.error(
      JSON.stringify({
        job: "decay-occupancy",
        fatal: err?.message ?? String(err),
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
