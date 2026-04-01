import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export interface Badge {
  id: string;
  label: string;
  description: string;
  earned: boolean;
  icon: string;
}

export interface GamificationData {
  streak: number;
  todayCount: number;
  totalSamplingRecords: number;
  totalSampledProducts: number;
  avgEstimationErrorAbs: number | null;
  weeklyActivity: { date: string; count: number }[];
  badges: Badge[];
  categoryProgress: { category: string; total: number; sampled: number; pct: number }[];
}

export async function GET() {
  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Weekly activity — last 7 days
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const recentRecords = await prisma.samplingRecord.findMany({
      where: { sampledAt: { gte: sevenDaysAgo } },
      select: { sampledAt: true },
      orderBy: { sampledAt: "asc" },
    });

    // Build day → count map
    const dayCountMap: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      dayCountMap[d.toISOString().slice(0, 10)] = 0;
    }
    for (const r of recentRecords) {
      const day = r.sampledAt.toISOString().slice(0, 10);
      if (day in dayCountMap) dayCountMap[day] = (dayCountMap[day] ?? 0) + 1;
    }
    const weeklyActivity = Object.entries(dayCountMap).map(([date, count]) => ({ date, count }));

    const todayCount = dayCountMap[todayStr] ?? 0;

    // Streak — consecutive days ending today (or yesterday) with ≥1 record
    const allRecords = await prisma.samplingRecord.findMany({
      select: { sampledAt: true },
      orderBy: { sampledAt: "desc" },
    });
    const distinctDays = [...new Set(allRecords.map((r) => r.sampledAt.toISOString().slice(0, 10)))];
    const allDays = distinctDays.map((day) => ({ day }));
    let streak = 0;
    const checkDate = new Date(now);
    checkDate.setHours(0, 0, 0, 0);
    // Allow streak to include today or carry from yesterday
    for (const { day } of allDays) {
      const dayStr = typeof day === "string" ? day : new Date(day).toISOString().slice(0, 10);
      const checkStr = checkDate.toISOString().slice(0, 10);
      if (dayStr === checkStr) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        // If first check is not today, only allow yesterday gap
        if (streak === 0 && checkStr > dayStr) {
          // today has no records, try yesterday
          checkDate.setDate(checkDate.getDate() - 1);
          const newCheckStr = checkDate.toISOString().slice(0, 10);
          if (dayStr === newCheckStr) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }

    // Totals
    const totalSamplingRecords = await prisma.samplingRecord.count();
    const totalSampledProducts = await prisma.product.count({
      where: { samplingRecords: { some: {} } },
    });

    // Avg absolute estimation error
    const profilesWithError = await prisma.productPackagingProfile.findMany({
      where: { estimationErrorPct: { not: null } },
      select: { estimationErrorPct: true },
    });
    const avgEstimationErrorAbs =
      profilesWithError.length > 0
        ? profilesWithError.reduce((sum, p) => sum + Math.abs(p.estimationErrorPct!), 0) /
          profilesWithError.length
        : null;

    // Category progress
    const allProducts = await prisma.product.findMany({
      where: { category: { not: null } },
      select: { category: true, samplingRecords: { select: { id: true }, take: 1 } },
    });
    const catMap: Record<string, { total: number; sampled: number }> = {};
    for (const p of allProducts) {
      const cat = p.category!;
      if (!catMap[cat]) catMap[cat] = { total: 0, sampled: 0 };
      catMap[cat].total++;
      if (p.samplingRecords.length > 0) catMap[cat].sampled++;
    }
    const categoryProgress = Object.entries(catMap)
      .map(([category, { total, sampled }]) => ({
        category,
        total,
        sampled,
        pct: total > 0 ? Math.round((sampled / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    // Badges
    const badges: Badge[] = [
      {
        id: "first_weighing",
        label: "Erste Wiegung",
        description: "Erste Stichprobe erfasst",
        earned: totalSamplingRecords >= 1,
        icon: "⚖",
      },
      {
        id: "ten_records",
        label: "Fleißig",
        description: "10 Stichproben erfasst",
        earned: totalSamplingRecords >= 10,
        icon: "📦",
      },
      {
        id: "fifty_records",
        label: "Profi",
        description: "50 Stichproben erfasst",
        earned: totalSamplingRecords >= 50,
        icon: "🏆",
      },
      {
        id: "hundred_records",
        label: "Experte",
        description: "100 Stichproben erfasst",
        earned: totalSamplingRecords >= 100,
        icon: "🎖",
      },
      {
        id: "streak_3",
        label: "3-Tage-Serie",
        description: "3 Tage in Folge gewogen",
        earned: streak >= 3,
        icon: "🔥",
      },
      {
        id: "streak_7",
        label: "Wochensieger",
        description: "7 Tage in Folge gewogen",
        earned: streak >= 7,
        icon: "🌟",
      },
      {
        id: "accurate",
        label: "Treffsicher",
        description: "Durchschnittlicher Schätzfehler unter 15%",
        earned: avgEstimationErrorAbs !== null && avgEstimationErrorAbs < 15,
        icon: "🎯",
      },
      {
        id: "category_done",
        label: "Kategorie vollständig",
        description: "Alle Produkte einer Kategorie gemessen",
        earned: categoryProgress.some((c) => c.total > 0 && c.sampled === c.total),
        icon: "✅",
      },
    ];

    const data: GamificationData = {
      streak,
      todayCount,
      totalSamplingRecords,
      totalSampledProducts,
      avgEstimationErrorAbs:
        avgEstimationErrorAbs !== null
          ? Math.round(avgEstimationErrorAbs * 10) / 10
          : null,
      weeklyActivity,
      badges,
      categoryProgress,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("Gamification error:", error);
    return NextResponse.json({ error: "Failed to load gamification data" }, { status: 500 });
  }
}
