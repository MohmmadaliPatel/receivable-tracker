import createNoticeTable, {
  createGstAdditionalNoticeTable,
  createGstNoticeTable,
  GstAdditionalNoticeData,
  GstNoticeData,
  NoticeData,
} from "./createNoticeTable"
import sendMail from "./sendMail"

export default async function sendNewNoticesEmail(to: string, data: NoticeData) {
  console.log(`📧 Preparing to send email to: ${to} with ${data?.length || 0} notices`)

  // Validate email address
  if (!to || typeof to !== "string" || !to.includes("@")) {
    console.error(`❌ Invalid email address: ${to}`)
    throw new Error(`Invalid email address provided: ${to}`)
  }

  // Validate data
  if (!data || !Array.isArray(data) || data.length === 0) {
    console.error(`❌ Invalid or empty notice data for email: ${to}`, data)
    throw new Error(`No valid notice data provided for email: ${to}`)
  }

  try {
    const htmlContent = createNoticeTable(data)
    console.log(`✅ Email template created successfully for: ${to}`)

    const result = await sendMail(
      to,
      "The income-tax department has issued new notices",
      htmlContent
    )
    console.log(`✅ Email sent successfully to: ${to}`)

    return result
  } catch (error) {
    console.error(`❌ Failed to send email to: ${to}`, error)
    throw error
  }
}

export async function sendNewGstNoticesEmail(to: string, data: GstNoticeData) {
  const htmlContent = createGstNoticeTable(data)
  return sendMail(to, "The GST department has issued new notices", htmlContent)
}

export async function sendNewGstAdditionalNoticeEmail(to: string, data: GstAdditionalNoticeData) {
  const htmlContent = createGstAdditionalNoticeTable(data)
  return sendMail(to, "The GST department has issued new additional notices", htmlContent)
}
