// scripts/decay-occupancy.js
// Run via linux cron, e.g.:
// */10 * * * * cd /path/to/app && node scripts/decay-occupancy.js >> logs/occupancy-decay.log 2>&1

const { PrismaClient } = require("../src/generated");

const prisma = new PrismaClient();

// "Occupancy" = number of members who checked in within this trailing window.
// A check-in ages out of the count once it's older than this — each run just
// recounts from scratch, no incremental decay/watermark bookkeeping needed.
const OCCUPANCY_WINDOW_MS = 90 * 60 * 1000; // 1.5 hours
const GYM_BATCH_SIZE = 50;

async function recomputeGymOccupancy(gym, now) {
  const windowStart = new Date(now.getTime() - OCCUPANCY_WINDOW_MS);

  const occupancy = await prisma.attendanceLog.count({
    where: {
      gymId: gym.id,
      type: "IN",
      timestamp: { gte: windowStart, lte: now },
    },
  });

  await prisma.gymMetrics.upsert({
    where: { gymId: gym.id },
    create: { gymId: gym.id, currentOccupancy: occupancy, lastUpdated: now },
    update: { currentOccupancy: occupancy, lastUpdated: now },
  });

  return { gymId: gym.id, occupancy };
}

async function run() {
  const startedAt = Date.now();
  const now = new Date();
  let cursor = null;
  let processed = 0;
  let totalOccupancy = 0;
  const errors = [];

  // Cursor-paginate gyms so this scales past a handful of tenants
  // without loading everything into memory at once.
  while (true) {
    const gyms = await prisma.gym.findMany({
      where: { isDeleted: false },
      take: GYM_BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true },
    });

    if (gyms.length === 0) break;

    // Process gyms in this batch concurrently, but isolate failures
    // per-gym so one bad row doesn't kill the whole cron run.
    const results = await Promise.allSettled(
      gyms.map((gym) => recomputeGymOccupancy(gym, now)),
    );

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        processed += 1;
        totalOccupancy += result.value.occupancy;
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
      totalOccupancy,
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

