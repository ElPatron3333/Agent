import { NextResponse } from "next/server";

import { readAuditLog } from "@/lib/audit-log";

const SESSION_COOKIE_NAME = "smithii_agent_session";

export function GET(request: Request) {
  const sessionId = sessionIdFromRequest(request);
  if (!sessionId) {
    return NextResponse.json({ records: [] });
  }

  return NextResponse.json({
    records: readAuditLog().filter((record) => record.sessionId === sessionId),
  });
}

function sessionIdFromRequest(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  const sessionCookie = cookies
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));

  return sessionCookie?.slice(`${SESSION_COOKIE_NAME}=`.length) ?? null;
}
