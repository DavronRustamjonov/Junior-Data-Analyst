const fetch = require("node-fetch");

exports.handler = async function(event, context) {
  const { name, email, message } = JSON.parse(event.body);

  const telegramToken = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.CHAT_ID;

  const text = `📩 New message!\n\n👤 Name: ${name}\n📧 Email: ${email}\n💬 Message: ${message}`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" })
    });

    const data = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (err) {
    console.error("Telegram error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false })
    };
  }
};
