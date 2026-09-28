import { NextRequest, NextResponse } from "next/server";
import { jobsStore, ownerSafeJob, purgeExpiredJobs, type PrintJob, type PrintStatus } from "@/lib/jobs";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const shopId = request.nextUrl.searchParams.get("shopId");
  if (!shopId) return jsonError("shopId is required");

  const jobs = purgeExpiredJobs()
    .filter((job) => job.shopId === shopId)
    .map(ownerSafeJob);

  return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const shopId = typeof body.shopId === "string" ? body.shopId : "";
    const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 180) : "private-document.pdf";
    const fileSize = typeof body.fileSize === "string" ? body.fileSize.slice(0, 32) : "—";
    const pages = Number(body.pages);
    const copies = Number(body.copies);
    const color = Boolean(body.color);
    const duplex = color ? false : Boolean(body.duplex);

    if (!shopId || !Number.isInteger(pages) || pages < 1 || pages > 5000) return jsonError("Invalid print job");
    if (!Number.isInteger(copies) || copies < 1 || copies > 20) return jsonError("Copies must be between 1 and 20");

    const rate = color ? 10 : duplex ? 1.5 : 2;
    const amount = Math.ceil(pages * copies * rate);
    const id = `GP-${Math.floor(1000 + Math.random() * 9000)}`;
    const job: PrintJob = {
      id,
      shopId,
      fileName,
      fileSize,
      pages,
      copies,
      color,
      duplex,
      amount,
      status: "QUEUED",
      createdAt: Date.now(),
    };

    purgeExpiredJobs();
    jobsStore().unshift(job);

    // Customer needs the receipt fields only; the source file is not stored or returned.
    return NextResponse.json({ job: ownerSafeJob(job) }, { status: 201 });
  } catch {
    return jsonError("Could not create print job");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, status } = await request.json() as { id?: string; status?: PrintStatus };
    if (!id || !["QUEUED", "PRINTED", "PAID"].includes(status ?? "")) return jsonError("Invalid update");

    const job = jobsStore().find((item) => item.id === id);
    if (!job) return jsonError("Job not found", 404);

    job.status = status as PrintStatus;
    if (job.status === "PRINTED") job.printedAt = Date.now();

    return NextResponse.json({ job: ownerSafeJob(job) });
  } catch {
    return jsonError("Could not update job");
  }
}
