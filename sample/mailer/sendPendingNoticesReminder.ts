import db from "db"
import { includes, uniq } from "lodash"
import { formatDate } from "src/utils/formatter"
import createNoticeTable from "./createNoticeTable"
import sendMail from "./sendMail"

async function getNotices() {
  // Get the current date and time
  const now = new Date()

  // Calculate the start of today
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0) // Set to 00:00:00.000

  // Calculate the end of the day two days from now
  const endOfTwoDaysFromNow = new Date(now)
  endOfTwoDaysFromNow.setDate(now.getDate() + 2)
  endOfTwoDaysFromNow.setHours(23, 59, 59, 999) // Set to 23:59:59.999

  // Convert dates to BigInt timestamps
  const startOfTodayTimestamp = BigInt(startOfToday.getTime())
  const endOfTwoDaysFromNowTimestamp = BigInt(endOfTwoDaysFromNow.getTime())

  // Query the database
  const notices = await db.notice.findMany({
    where: {
      Status: "Pending",
      responseDueDate: {
        gte: startOfTodayTimestamp, // Greater than or equal to start of today
        lte: endOfTwoDaysFromNowTimestamp, // Less than or equal to end of two days from now
      },
    },
    include: {
      Proceeding: { include: { Company: true } },
    },
  })

  return notices
}

export default async function sendPendingNoticesReminder() {
  console.log("Sending Pending Notices Reminder")

  const pendingNotices = await getNotices()
  const emails = uniq(
    await pendingNotices.flatMap(
      (n) => n.Proceeding.Company.emails?.toLowerCase()?.split(", ") || []
    )
  )
  for (const email of emails) {
    const noticesForEmail = pendingNotices.filter((n) =>
      n.Proceeding?.Company?.emails?.includes(email)
    )
    const noticeData = noticesForEmail.map((n) => ({
      Assessee: n.Proceeding.Company.name,
      "Proceeding Name": n.Proceeding.proceedingName,
      "Notice Section": n.noticeSection,
      "Assessment Year": n.ay,
      "Notice date": formatDate(n.issuedOn),
      "Response date": formatDate(n.responseDueDate),
    }))
    const htmlContent = createNoticeTable(noticeData)
    try {
      await sendMail(email, "Pending Notices Notification", htmlContent)
    } catch (error) {
      console.log("something went wrong for email", email)
      console.error(error)
    }
  }
}
