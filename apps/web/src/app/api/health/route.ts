export async function GET() {
  return Response.json({
    service: "squadron-operations-hub",
    status: "ok",
    timestamp: new Date().toISOString()
  });
}
