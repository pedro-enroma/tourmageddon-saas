/**
 * Telegram Bot API utility for sending notifications
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Format a notification as Telegram HTML message
 */
export function formatTelegramNotification(title: string, body: string, url?: string): string {
  let message = `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(body)}`
  if (url) {
    const fullUrl = url.startsWith('http') ? url : `https://tourmageddon.it${url}`
    message += `\n\n<a href="${fullUrl}">View Details</a>`
  }
  return message
}

interface TelegramResult {
  ok: boolean
  description?: string
}

/**
 * Send a message to a single Telegram chat
 */
async function sendTelegramMessage(chatId: string, text: string): Promise<{ success: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN not configured' }
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })

    const result: TelegramResult = await response.json()

    if (!result.ok) {
      return { success: false, error: result.description || `HTTP ${response.status}` }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Send a message to multiple Telegram chats sequentially (rate-limit safe)
 */
export async function sendTelegramToChats(
  chatIds: string[],
  text: string
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  for (const chatId of chatIds) {
    const result = await sendTelegramMessage(chatId, text)
    if (result.success) {
      sent++
    } else {
      failed++
      console.error(`[Telegram] Failed to send to chat ${chatId}: ${result.error}`)
    }
  }

  return { sent, failed }
}
