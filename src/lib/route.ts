import { NextResponse } from "next/server";

/**
 * Wraps a route handler so that an unexpected throw still answers in the error
 * shape the README documents.
 *
 * Without this, a failure inside a handler — most realistically `db()` being
 * unable to reach MongoDB — escapes to Next, which replies 500 with an empty
 * body. Every client in this app then calls `res.json()` on that empty body and
 * throws, so the user sees a dead form rather than a message.
 *
 * A database that cannot be reached is 503 (the service is temporarily
 * unavailable and the request is worth retrying); anything else is 500.
 */
export function withErrors<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      const unreachable =
        err instanceof Error &&
        (err.name === "MongooseServerSelectionError" ||
          err.name === "MongoServerSelectionError");

      console.error("Unhandled route error:", err);

      return unreachable
        ? NextResponse.json(
            {
              error: "DATABASE_UNAVAILABLE",
              message:
                "Could not reach the database. Please try again in a moment.",
            },
            { status: 503 }
          )
        : NextResponse.json(
            {
              error: "INTERNAL",
              message: "The server could not complete the request.",
            },
            { status: 500 }
          );
    }
  };
}
