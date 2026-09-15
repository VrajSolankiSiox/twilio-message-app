import { NextRequest, NextResponse } from "next/server";
import { updateCallStatus } from "@/lib/db/calls";

async function handleStatusUpdate(
  sid: string | undefined,
  parentSid: string | undefined,
  status: string | undefined,
  duration?: string
) {
  const targetSid = parentSid || sid;
  if (targetSid && status) {
    await updateCallStatus(targetSid, status, duration);
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    await handleStatusUpdate(
      formData.get("CallSid")?.toString(),
      formData.get("ParentCallSid")?.toString(),
      formData.get("CallStatus")?.toString(),
      formData.get("CallDuration")?.toString()
    );

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("Call status webhook error:", error);
    return new NextResponse("OK", { status: 200 });
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  await handleStatusUpdate(
    params.get("CallSid") ?? undefined,
    params.get("ParentCallSid") ?? undefined,
    params.get("CallStatus") ?? undefined,
    params.get("CallDuration") ?? undefined
  );

  return new NextResponse("OK", { status: 200 });
}
