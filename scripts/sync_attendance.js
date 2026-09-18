// scripts/sync-attendance.js
// Run via linux cron, e.g.:
// */10 * * * * cd /path/to/app && node scripts/sync-attendance.js >> logs/attendance-sync.log 2>&1

// decay-occupancy.js doesn't need this because Prisma auto-loads
// DATABASE_URL from .env internally, but MACHINE_SERVER /
// MACHINE_SERVER_API_KEY are plain process.env vars this script reads
// itself (no ts-node here, so src/config/env.ts can't be imported
// directly) — cron does not inherit your shell's environment, so this
// has to be explicit or the job silently has no credentials.
require("dotenv").config();

const axios = require("axios");
const { PrismaClient } = require("../src/generated");

const prisma = new PrismaClient();

const GYM_BATCH_SIZE = 50;
const MACHINE_REQUEST_TIMEOUT_MS = 5000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const MACHINE_SERVER = process.env.MACHINE_SERVER;
const MACHINE_SERVER_API_KEY = process.env.MACHINE_SERVER_API_KEY;

if (!MACHINE_SERVER || !MACHINE_SERVER_API_KEY) {
    console.error(
        JSON.stringify({
            job: "sync-attendance",
            fatal: "MACHINE_SERVER / MACHINE_SERVER_API_KEY missing from env",
        }),
    );
    process.exit(1);
}

/**
 * yyyy-MM-dd for the machine API's FromDate/ToDate params.
 *
 * Computed in Asia/Kolkata regardless of the cron host's own timezone, so
 * "today" always matches the gym's actual local calendar day rather than
 * whatever timezone the Node process runs in (commonly UTC on a server).
 * If gyms ever span multiple timezones this needs to become per-gym.
 */
function todayDateString(now) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Converts a machine's raw LogDate into the correct UTC Date instant.
 *
 * Biometric terminals report logs in the device's own local wall-clock
 * time with no timezone marker — e.g. "2024-01-15 08:30:00" — and the
 * device sits on the gym's local network in India (IST, UTC+5:30). Handing
 * that straight to `new Date(...)` would make Node parse it as local time
 * of the *server process* instead (UTC on most hosts/containers), silently
 * shifting every check-in by 5.5 hours while still looking like it worked.
 * This builds the UTC instant explicitly from the IST wall-clock fields.
 *
 * If the device ever sends a string with an explicit offset or 'Z', that's
 * trusted as-is instead of being reinterpreted as IST.
 */
function parseMachineLogDate(logDate) {
    if (typeof logDate !== "string" || logDate.trim() === "") {
        throw new Error(`Unexpected LogDate value: ${JSON.stringify(logDate)}`);
    }

    const trimmed = logDate.trim();

    if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
        const parsed = new Date(trimmed);
        if (Number.isNaN(parsed.getTime())) {
            throw new Error(`Unparseable LogDate: ${trimmed}`);
        }
        return parsed;
    }

    const match = trimmed.match(
        /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
    );

    if (!match) {
        throw new Error(`Unrecognized LogDate format: ${trimmed}`);
    }

    const [year, month, day, hour, minute, second] = match
        .slice(1)
        .map(Number);

    const asIfUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    return new Date(asIfUtcMs - IST_OFFSET_MS);
}

async function getDeviceLogs(serialNumbers, dateStr) {
    const response = await axios.get(`${MACHINE_SERVER}/GetDeviceLogs`, {
        params: {
            APIKey: MACHINE_SERVER_API_KEY,
            SerialNumber: serialNumbers, // whole gym's machines in one request
            FromDate: dateStr,
            ToDate: dateStr,
        },
        timeout: MACHINE_REQUEST_TIMEOUT_MS,
    });

    return response.data.map((log) => ({
        memberCode: Number(log.EmployeeCode),
        logDate: log.LogDate,
    }));
}

async function syncGymAttendance(gym, dateStr) {
    const serialNumbers = gym.machines.map((m) => m.serialNumber);

    const logs = await getDeviceLogs(serialNumbers, dateStr);

    if (logs.length === 0) {
        return { gymId: gym.id, fetched: 0, inserted: 0, skippedLogs: [] };
    }

    const memberCodes = [...new Set(logs.map((log) => log.memberCode))];

    const members = await prisma.member.findMany({
        where: {
            membershipCode: { in: memberCodes },
            gymId: gym.id,
        },
        select: { id: true, membershipCode: true },
    });

    const memberMap = new Map(members.map((m) => [m.membershipCode, m.id]));

    const data = [];
    const skippedLogs = [];

    for (const log of logs) {
        const memberId = memberMap.get(log.memberCode);
        if (!memberId) {
            // No member with this membershipCode at this gym — device log for
            // someone we don't have a record of (e.g. offboarded member whose
            // fingerprint wasn't removed from the terminal yet).
            continue;
        }

        let timestamp;
        try {
            timestamp = parseMachineLogDate(log.logDate);
        } catch (err) {
            // A malformed timestamp from one log entry shouldn't abort the
            // whole gym's sync — skip it and report it, keep going.
            skippedLogs.push({
                memberCode: log.memberCode,
                logDate: log.logDate,
                reason: err.message,
            });
            continue;
        }

        data.push({
            memberId,
            membershipCode: log.memberCode,
            timestamp,
            gymId: gym.id,
            type: "IN",
        });
    }

    if (data.length === 0) {
        return { gymId: gym.id, fetched: logs.length, inserted: 0, skippedLogs };
    }

    // skipDuplicates relies on AttendanceLog's @@unique([membershipCode,
    // gymId, timestamp]) — this is what makes it safe to re-fetch the whole
    // day's logs from the machine on every single tick without ever
    // double-inserting the same check-in.
    const result = await prisma.attendanceLog.createMany({
        data,
        skipDuplicates: true,
    });

    return {
        gymId: gym.id,
        fetched: logs.length,
        inserted: result.count,
        skippedLogs,
    };
}

async function run() {
    const startedAt = Date.now();
    const now = new Date();
    const dateStr = todayDateString(now);

    let cursor = null;
    let processedGyms = 0;
    let totalFetched = 0;
    let totalInserted = 0;
    const errors = [];
    const skippedLogWarnings = [];

    // Cursor-paginate gyms so this scales past a handful of tenants without
    // loading everything into memory at once — same pattern as decay-occupancy.
    while (true) {
        const gyms = await prisma.gym.findMany({
            where: {
                isDeleted: false,
                machines: { some: {} }, // skip gyms with no machine — nothing to sync
            },
            take: GYM_BATCH_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: "asc" },
            select: {
                id: true,
                machines: { select: { serialNumber: true } },
            },
        });

        if (gyms.length === 0) break;

        // Process gyms in this batch concurrently, but isolate failures
        // per-gym so one unreachable machine doesn't kill the whole cron run.
        const results = await Promise.allSettled(
            gyms.map((gym) => syncGymAttendance(gym, dateStr)),
        );

        results.forEach((result, i) => {
            if (result.status === "fulfilled") {
                processedGyms += 1;
                totalFetched += result.value.fetched;
                totalInserted += result.value.inserted;
                if (result.value.skippedLogs.length > 0) {
                    skippedLogWarnings.push({
                        gymId: gyms[i].id,
                        skipped: result.value.skippedLogs,
                    });
                }
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
            job: "sync-attendance",
            processedGyms,
            totalFetched,
            totalInserted,
            errorCount: errors.length,
            errors,
            skippedLogWarnings,
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
                job: "sync-attendance",
                fatal: err?.message ?? String(err),
            }),
        );
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });