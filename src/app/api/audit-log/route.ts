import { NextResponse } from "next/server";

import { readAuditLog } from "@/lib/audit-log";

export function GET() {
  return NextResponse.json({ records: readAuditLog() });
}
