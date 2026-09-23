export async function POST() {
  return Response.json(
    { error: "This legacy endpoint is retired. Use the signed-in health workspace." },
    { status: 410, headers: { "cache-control": "no-store" } },
  );
}
