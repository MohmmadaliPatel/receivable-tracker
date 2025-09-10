import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions, refreshAccessToken } from "@/lib/auth";
import { EmailService } from "@/lib/email-service";
import { prisma } from "@/lib/prisma";

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

    const userDetails = await prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
      include: {
        accounts: true,
      },
    });

    console.log("userDetails", userDetails);
    

    const body = await request.json();

    const filter = {
      fromDate: body.fromDate ? new Date(body.fromDate) : undefined,
      toDate: body.toDate ? new Date(body.toDate) : undefined,
      senders: body.senders || undefined,
    };

    // Get access token and refresh token from the account
    const account = userDetails?.accounts[0];
    let accessToken = account?.access_token;
    const refreshToken = account?.refresh_token;
    const expiresAt = account?.expires_at;

    if (!accessToken) {
      return NextResponse.json({ error: "No access token available" }, { status: 401 });
    }

    // Check if token is expired and refresh if needed
    if (expiresAt && Date.now() >= expiresAt * 1000 && refreshToken) {
      try {
        console.log("Token expired, refreshing...");
        const refreshedTokens = await refreshAccessToken(refreshToken);

        // Update the account in database with new tokens
        if (account.id) {
          await prisma.account.update({
            where: { id: account.id },
            data: {
              access_token: refreshedTokens.accessToken,
              refresh_token: refreshedTokens.refreshToken,
              expires_at: refreshedTokens.expiresAt,
            },
          });
        }

        accessToken = refreshedTokens.accessToken;
        console.log("Token refreshed successfully");
      } catch (refreshError) {
        console.error("Failed to refresh token:", refreshError);
        return NextResponse.json({
          error: "Token refresh failed",
          code: "TOKEN_REFRESH_FAILED",
          message: "Please re-authenticate to continue"
        }, { status: 401 });
      }
    }

    try {
      const result = await EmailService.fetchAndStoreEmailsWithDelta(
        "1.ASoAKcYt2AlRUUCU-j68oSBVZ73YddFguBZJqt63F4yNsI0pAfsqAA.AgABBAIAAABVrSpeuWamRam2jAF1XRQEAwDs_wUA9P879F197zRcJOmY_nLmV4m2wqYfcchO49HCDWNoMccJvrkj3VwT_7GFUhz8PM3_0yrvSjjDFqSFdRMBBBADSQwXdUAxbmoeIiPmmpioNEVBSSRxIAaO9Lt_mhzY_QaJsYGAdEYdKLzv6MJVIJtgkoZhMhN7JeRaNIHhyIzlhBaehPoEQRncwTLbLXbn4rz3MU788iKv-h5chN5OoJbRcDeKdEKqJYOgCiAQSeaXxTYqI4bCaNnfQxot6_7ZRq8s_LMXWG3FtSKXpWJ5rCVF9xN0hBe2nAXRqGQXG1yCbSnB4nc2b4lkXggUUn37y4TXCqsfAl8-G0Xta7aE66g20Fca59cpMZ4vBnbPNwxAiS-kE7hLbc5do1CT40wC82N6EiTWN-o17pt7u2665aN4sSjKPDTrHYMrKJbXuKwyZ5YSb6Oqu1s8PMiFgGcA_Bi42zM38ATFl1x2G_yhVuEOdl55PIlww79IxS2zYDhxIcAq9zXPL4mZhVqh1mADCikQ6H9XkZz9ZbL1p8nlKn6vJEd_OJzVLjfGnhaL9_FpvWfVUHv01ukyetnBXL1PLC-YWn0sDteebpxOCuQ6mMDkcQSo8xmA_pNSW9-guMfzqO_Qr3QUzsMz85ITTuqlMsnFBhDYDv8POzOc5HlVCpFJX-Oco5NgiAufNYxp8n3OzBE_Cj7L8-UCPxO_n0Y_5Nf9QLumbLBPAgWLXztB5QgEKk3pPhDSCR82tYeZyAC6kdeyRQmLakLMmbmEY0zPfY0BRnk8BRBbg9-Pm9VujtjWZzoHAPZ-leBUJJd88uP3MCcL5_Q8UkSrMsamU_23340I9twU9p9yYR6YP5yyHjJR26qco9Sh4bT8BXhFLV_9QLGj0FZSEuOI7Pgr3bARlQ",
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
