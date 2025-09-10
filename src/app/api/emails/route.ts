import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { EmailService } from "@/lib/email-service";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!)
      : 50;
    const offset = searchParams.get("offset")
      ? parseInt(searchParams.get("offset")!)
      : 0;
    const fromDate = searchParams.get("fromDate")
      ? new Date(searchParams.get("fromDate")!)
      : undefined;
    const toDate = searchParams.get("toDate")
      ? new Date(searchParams.get("toDate")!)
      : undefined;
    const sender = searchParams.get("sender") || undefined;

    const result = await EmailService.getStoredEmailsForUser(session.user.id, {
      limit,
      offset,
      fromDate,
      toDate,
      sender,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching emails:", error);
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    console.log("session", session);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check for token refresh error
    if ((session as any).error === "RefreshAccessTokenError") {
      return NextResponse.json({
        error: "Token refresh failed",
        code: "TOKEN_REFRESH_FAILED",
        message: "Please re-authenticate to continue"
      }, { status: 401 });
    }

    // Get access token from session (JWT strategy)
    const accessToken = session.accessToken;

    if (!accessToken) {
      return NextResponse.json({ error: "No access token available" }, { status: 401 });
    }

    const body = await request.json();

    const filter = {
      fromDate: body.fromDate ? new Date(body.fromDate) : undefined,
      toDate: body.toDate ? new Date(body.toDate) : undefined,
      senders: body.senders || undefined,
    };

    try {
      const result = await EmailService.fetchAndStoreEmailsWithDelta(
        accessToken,
        session.user.id,
        filter,
        body.limit || 100
      );

      return NextResponse.json({
        success: true,
        message: `Fetched ${result.fetched} emails and stored ${result.stored} new emails`,
        data: result,
      });
    } catch (error: any) {
      console.error("Error fetching and storing emails:", error);

      // Check if it's a token expiration error
      if (error.message?.includes('expired') ||
          error.message?.includes('InvalidAuthenticationToken') ||
          error.message?.includes('401')) {
        return NextResponse.json({
          error: "Access token expired",
          code: "TOKEN_EXPIRED",
          message: "Please re-authenticate to continue fetching emails"
        }, { status: 401 });
      }

      return NextResponse.json(
        { error: "Failed to fetch and store emails" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Unexpected error in POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
