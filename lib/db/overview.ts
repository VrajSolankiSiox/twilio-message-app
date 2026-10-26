import { getDb } from "@/lib/mongodb";
import { organizationQuery } from "@/lib/org-context";

export interface DayPoint {
  date: string;
  inbound: number;
  outbound: number;
}

export interface OverviewMetrics {
  organizationName?: string;
  messages: {
    total: number;
    inbound: number;
    outbound: number;
    today: number;
    last7Days: number;
  };
  conversations: {
    total: number;
    open: number;
    closed: number;
    stopped: number;
  };
  calls: { total: number; last7Days: number };
  campaigns: {
    total: number;
    sending: number;
    paused: number;
    draft: number;
    completed: number;
    interrupted: number;
  };
  invoices: { total: number; outstandingUsd: number };
  daily: DayPoint[];
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function metricInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

export async function getOverviewMetrics(): Promise<OverviewMetrics> {
  const db = await getDb();
  const org = organizationQuery();
  const now = new Date();
  const today = startOfUtcDay(now);
  const weekStart = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

  const [messageRows, conversationRows, callCount, callsWeek, campaignRows, invoiceRows] =
    await Promise.all([
      db
        .collection("messages")
        .aggregate<{
          _id: { day: string; direction: string };
          count: number;
        }>([
          { $match: { ...org, dateCreated: { $gte: weekStart } } },
          {
            $group: {
              _id: {
                day: {
                  $dateToString: { format: "%Y-%m-%d", date: "$dateCreated" },
                },
                direction: "$direction",
              },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray(),
      db
        .collection("conversations")
        .aggregate<{
          total: number;
          closed: number;
          stopped: number;
        }>([
          { $match: org },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              closed: {
                $sum: { $cond: [{ $ifNull: ["$closedAt", false] }, 1, 0] },
              },
              stopped: {
                $sum: { $cond: [{ $eq: ["$hasStopInbound", true] }, 1, 0] },
              },
            },
          },
        ])
        .toArray(),
      db.collection("calls").countDocuments(org),
      db.collection("calls").countDocuments({
        ...org,
        createdAt: { $gte: weekStart },
      }),
      db
        .collection("campaigns")
        .aggregate<{
          campaignCount: number;
          sending: number;
          paused: number;
          draft: number;
          completed: number;
          interrupted: number;
        }>([
          { $match: org },
          {
            $group: {
              _id: null,
              campaignCount: { $sum: 1 },
              sending: { $sum: { $cond: [{ $eq: ["$status", "sending"] }, 1, 0] } },
              paused: { $sum: { $cond: [{ $eq: ["$status", "paused"] }, 1, 0] } },
              draft: { $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] } },
              completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
              interrupted: { $sum: { $cond: [{ $eq: ["$status", "interrupted"] }, 1, 0] } },
            },
          },
        ])
        .toArray(),
      db
        .collection("invoices")
        .aggregate<{ total: number; outstandingUsd: number }>([
          { $match: org },
          {
            $project: {
              lineTotal: {
                $sum: {
                  $map: {
                    input: { $ifNull: ["$data.lineItems", []] },
                    as: "line",
                    in: {
                      $multiply: [
                        { $ifNull: ["$$line.qty", 0] },
                        { $ifNull: ["$$line.rate", 0] },
                      ],
                    },
                  },
                },
              },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              outstandingUsd: { $sum: "$lineTotal" },
            },
          },
        ])
        .toArray(),
    ]);

  const totals = await db
    .collection("messages")
    .aggregate<{ _id: string; count: number }>([
      { $match: org },
      { $group: { _id: "$direction", count: { $sum: 1 } } },
    ])
    .toArray();

  const byDirection = new Map(totals.map((row) => [row._id, row.count]));
  const inbound = byDirection.get("inbound") ?? 0;
  const outbound = byDirection.get("outbound") ?? 0;

  const dailyMap = new Map<string, DayPoint>();
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
    const key = day.toISOString().slice(0, 10);
    dailyMap.set(key, { date: key, inbound: 0, outbound: 0 });
  }
  let last7Days = 0;
  let todayCount = 0;
  const todayKey = today.toISOString().slice(0, 10);
  for (const row of messageRows) {
    last7Days += row.count;
    const point = dailyMap.get(row._id.day);
    if (point) {
      if (row._id.direction === "inbound") point.inbound += row.count;
      else point.outbound += row.count;
    }
    if (row._id.day === todayKey) todayCount += row.count;
  }

  const conv = conversationRows[0];
  const totalConversations = conv?.total ?? 0;
  const closed = conv?.closed ?? 0;

  return {
    messages: {
      total: inbound + outbound,
      inbound,
      outbound,
      today: todayCount,
      last7Days,
    },
    conversations: {
      total: totalConversations,
      open: Math.max(0, totalConversations - closed),
      closed,
      stopped: conv?.stopped ?? 0,
    },
    calls: { total: callCount, last7Days: callsWeek },
    campaigns: {
      total: metricInt(campaignRows[0]?.campaignCount),
      sending: metricInt(campaignRows[0]?.sending),
      paused: metricInt(campaignRows[0]?.paused),
      draft: metricInt(campaignRows[0]?.draft),
      completed: metricInt(campaignRows[0]?.completed),
      interrupted: metricInt(campaignRows[0]?.interrupted),
    },
    invoices: {
      total: metricInt(invoiceRows[0]?.total),
      outstandingUsd: metricInt(invoiceRows[0]?.outstandingUsd),
    },
    daily: [...dailyMap.values()],
  };
}
