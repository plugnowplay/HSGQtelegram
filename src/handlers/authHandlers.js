/**
 * Auth and common handlers
 */
const { saveAuth, findAuth } = require('../utils/auth');
const config = require('../config');

/**
 * Handle /password command - Authenticate user
 * @param {Object} ctx Telegraf context
 */
const handlePasswordCommand = (ctx) => {
  try {
    const msg = ctx.message.text;
    const msgArray = msg.split(' ');
    msgArray.shift();
    const passLogin = msgArray.join(' ');

    if (config.bot.passChat === passLogin) {
      const nama = ctx.chat.first_name;
      const telegramId = ctx.message.from.id;
      
      if (findAuth(telegramId)) {
        ctx.reply("Anda telah melakukan inisialisai sebelumnya");
      } else {
        saveAuth(nama, telegramId);
        ctx.reply(`Halo ${nama}, Password yang anda masukkan Benar, Silahkan memasukkan perintah /help untuk informasi bantuan`);
      }
    } else {
      ctx.reply(`Maaf ${ctx.chat.first_name}, Password Salah 🤭🤭🤭🤭`);
    }
  } catch (error) {
    console.error('Error in password command:', error);
    ctx.reply("Terjadi kesalahan saat memproses password. Silahkan coba lagi.");
  }
};

/**
 * Auth middleware - Check if user is authorized
 * @param {Object} ctx Telegraf context
 * @param {Function} next Next middleware function
 */
const authMiddleware = (ctx, next) => {
  try {
    // Get user ID from message or callback query
    let telegramId;
    
    if (ctx.message && ctx.message.from) {
      // For regular messages
      telegramId = ctx.message.from.id;
    } else if (ctx.callbackQuery && ctx.callbackQuery.from) {
      // For callback queries (button clicks)
      telegramId = ctx.callbackQuery.from.id;
    } else {
      // Skip auth check for updates that don't have user ID
      return next();
    }
    
    if (findAuth(telegramId)) {
      return next();
    } else {
      // For regular messages, send a reply
      if (ctx.message) {
        ctx.reply('Maaf Anda bukan anggota 🤭');
      } 
      // For callback queries, answer with notification
      else if (ctx.callbackQuery) {
        ctx.answerCbQuery('Maaf Anda bukan anggota 🤭');
      }
    }
  } catch (error) {
    console.error('Error in auth middleware:', error);
    if (ctx.message) {
      ctx.reply('Terjadi kesalahan sistem. Silahkan coba lagi.');
    }
  }
};

/**
 * Handle /help command - Show help information
 * @param {Object} ctx Telegraf context
 */
const handleHelpCommand = (ctx) => {
  const oltType = config.olt.type || 'Unknown';
  
  let onuParamExample = '';
  if (oltType.toUpperCase() === 'GPON') {
    onuParamExample = `📡 GPON Mode:
/onu - Contoh: /onu ZTE12345 atau /onu BUDI`;
  } else if (oltType.toUpperCase() === 'EPON') {
    onuParamExample = `📡 EPON Mode:
/onu - Contoh: /onu 00:11:22:33:44:55 atau /onu BUDI`;
  } else {
    onuParamExample = `📡 Unknown Mode:
/onu - Gunakan MAC (EPON) atau SN (GPON) atau nama ONU`;
  }
  
  const helpText = `🤖 Bot OLT HSGQ - Perintah yang tersedia:

/pon - Info status PON ports dan device offline.
/pon [angaka] - Tampilkan semua ONU pada port 1,2,3,4.
/olt - Info sistem OLT.
/onu - Detail info ONU.
/reboot - Reboot ONU.
/rename - Ubah nama ONU.
/showall - Tampilkan semua ONU yang terdaftar

⚡ PENCARIAN CEPAT:
Ketik langsung SN/MAC/Nama tanpa command!
Contoh: langsung ketik "ZTE12345" atau "11:22:33:44:55:66" atau "BUDI"

📡 Tipe OLT saat ini: ${oltType}
• EPON: Menggunakan MAC address
• GPON: Menggunakan Serial Number (SN).`;
  
  ctx.reply(helpText);
};

/**
 * Handle cancel action - Cancel operations
 * @param {Object} ctx Telegraf context
 */
const handleCancelAction = async (ctx) => {
  await ctx.editMessageText('❌ Operasi dibatalkan.', { reply_markup: { inline_keyboard: [] } });
};

/**
 * Handle /start command - Welcome new user
 * @param {Object} ctx Telegraf context
 */
const handleStartCommand = (ctx) => {
  ctx.reply('Selamat Datang! Ketik /help untuk informasi bantuan');
};

module.exports = {
  handlePasswordCommand,
  authMiddleware
};