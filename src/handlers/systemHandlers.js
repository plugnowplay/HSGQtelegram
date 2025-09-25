/**
 * System command handlers
 */
const { getOltSystemInfo, getPonStatus } = require('../services/systemService');
const { getAllOnus } = require('../services/onuService');
const { oltType } = require('../utils/api');
const config = require('../config');

/**
 * Handle /olt command - Display OLT system information
 * @param {Object} ctx Telegraf context
 */
const handleOltCommand = async (ctx) => {
  try {
    const text = await getOltSystemInfo();
    ctx.reply(text);
  } catch (error) {
    console.error('Error in olt command:', error.message);
    ctx.reply('Maaf, terjadi kesalahan saat mengambil informasi sistem OLT.');
  }
};

/**
 * Handle /pon command - Display PON port information
 * @param {Object} ctx Telegraf context
 */
const handlePonCommand = async (ctx) => {
  try {
    const msg = ctx.message.text;
    const msgArray = msg.split(' ');
    msgArray.shift();
    const ponPort = msgArray.join(' ');
    
    if (!ponPort || ponPort.trim() === '') {
      // No port specified, get general info for all ports
      console.log(`[Handler] Getting info for all PON ports`);
      const text = await getPonStatus();
      ctx.reply(text);
    } else {
      // Convert to number and get specific port
      const portNum = parseInt(ponPort.trim(), 10);
      if (isNaN(portNum)) {
        ctx.reply('⚠️ Nomor port PON harus berupa angka. Contoh: /pon 1');
        return;
      }
      
      console.log(`[Handler] Getting info for PON port ${portNum}`);
      await handleSpecificPonPort(ctx, portNum);
    }
  } catch (error) {
    console.error('Error in pon command:', error.message);
    ctx.reply('Maaf, terjadi kesalahan saat mengambil informasi PON. Silahkan coba lagi nanti.');
  }
};

/**
 * Handle request for specific PON port
 * @param {Object} ctx Telegraf context
 * @param {number} ponPort PON port number
 */
const handleSpecificPonPort = async (ctx, ponPort) => {
  // Send initial loading message
  const loadingMsg = await ctx.reply(`⏳ Mengambil data ONU untuk PON port ${ponPort}...`);
  
  // Get all ONUs for this port
  const onuList = await getAllOnus(ponPort);
  
  if (!onuList || onuList.length === 0) {
    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
    await ctx.reply(`Tidak ada ONU yang ditemukan di PON port ${ponPort}.`);
    return;
  }
  
  // Delete loading message
  await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
  
  // Debug information
  console.log(`[Handler] Retrieved ${onuList.length} ONUs for port ${ponPort}`);
  
  // Count ONUs based on rstate and status emoji
  const onlineONUs = onuList.filter(onu => 
    Number(onu.rstate) === 1 || 
    (onu.rstate === undefined && onu.status === '✅')
  ).length;
  
  const offlineONUs = onuList.filter(onu => 
    Number(onu.rstate) === 2 || 
    (onu.rstate === undefined && onu.status === '❌')
  ).length;
  
  const initialONUs = onuList.filter(onu => 
    Number(onu.rstate) === 0 || 
    (onu.rstate === undefined && onu.status === '⚠️')
  ).length;
  
  const unknownONUs = onuList.filter(onu => 
    Number(onu.rstate) === 3 ||
    (onu.rstate === undefined && onu.status === '❓')
  ).length;
  
  console.log(`[Handler] Counts: Online=${onlineONUs}, Offline=${offlineONUs}, Initial=${initialONUs}, Unknown=${unknownONUs}`);
  
  // Build status message
  const deviceType = oltType && oltType.toUpperCase() === 'GPON' ? 'ONU' : 'ONU';
  let statusMessage = `PON ${ponPort} - Ditemukan ${onuList.length} ${deviceType}\n`;
  
  // Add status counts if any
  if (onlineONUs > 0) {
    statusMessage += `Online: ${onlineONUs}`;
  }
  
  if (offlineONUs > 0) {
    if (onlineONUs > 0) statusMessage += ' | ';
    statusMessage += `Offline: ${offlineONUs}`;
  }
  
  if (initialONUs > 0) {
    if (onlineONUs > 0 || offlineONUs > 0) statusMessage += ' | ';
    statusMessage += `Initial: ${initialONUs}`;
  }
  
  if (unknownONUs > 0) {
    if (onlineONUs > 0 || offlineONUs > 0 || initialONUs > 0) statusMessage += ' | ';
    statusMessage += `Unknown: ${unknownONUs}`;
  }
  
  // If no specific status counts, show 'Unknown status'
  if (onlineONUs === 0 && offlineONUs === 0 && initialONUs === 0 && unknownONUs === 0) {
    statusMessage += 'Status: Unknown';
  }
  
  statusMessage += `\n\nMengirim daftar ONU`;
  
  await ctx.reply(statusMessage);
  
  // Send one message per ONU with delay to avoid throttling
  const delay = 300; // 300ms delay between messages
  
  // Limit maximum number of ONUs to send
  const maxToSend = Math.min(onuList.length, 100); // Max 100 ONUs for safety
  
  // Send data one by one with delay
  for (let i = 0; i < maxToSend; i++) {
    const onu = onuList[i];
    
    // Format message with SN and name
    const message = `${onu.sn} - ${onu.name}`;
    
    await ctx.reply(message);
    
    // Add delay except for last item
    if (i < maxToSend - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Show message if some ONUs were omitted
  if (onuList.length > maxToSend) {
    await ctx.reply(`⚠️ Hanya menampilkan ${maxToSend} dari ${onuList.length} ${deviceType} untuk menghindari flood.`);
  }
  
  // Send completion message
  await ctx.reply(`✅ Selesai menampilkan data ONU untuk PON port ${ponPort}.`);
};

/**
 * Handle /showpon command - Show ONUs on specific PON port with grouping
 * @param {Object} ctx Telegraf context
 */
const handleShowPonCommand = async (ctx) => {
  try {
    const msg = ctx.message.text;
    const msgArray = msg.split(' ');
    msgArray.shift();
    const ponPort = msgArray.join(' ');

    if (!ponPort || ponPort.trim() === '') {
      ctx.reply('⚠️ Mohon masukkan nomor port PON. Contoh: /showpon 1');
      return;
    }

    // Convert to number
    const portNum = parseInt(ponPort.trim(), 10);
    if (isNaN(portNum)) {
      ctx.reply('⚠️ Nomor port PON harus berupa angka. Contoh: /showpon 1');
      return;
    }

    // Send initial loading message
    const loadingMsg = await ctx.reply(`⏳ Mengambil data ONU untuk PON port ${portNum}...`);
    
    // Get all ONUs for this port
    const onuList = await getAllOnus(portNum);
    
    if (!onuList || onuList.length === 0) {
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
      await ctx.reply(`Tidak ada ONU yang ditemukan di PON port ${portNum}.`);
      return;
    }
    
    // Delete loading message
    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
    
    // Count ONUs by status
    const onlineONUs = onuList.filter(onu => 
      Number(onu.rstate) === 1 || 
      (onu.rstate === undefined && onu.status === '✅')
    ).length;
    
    const offlineONUs = onuList.filter(onu => 
      Number(onu.rstate) === 2 || 
      (onu.rstate === undefined && onu.status === '❌')
    ).length;
    
    const initialONUs = onuList.filter(onu => 
      Number(onu.rstate) === 0 || 
      (onu.rstate === undefined && onu.status === '⚠️')
    ).length;
    
    // Send summary
    const deviceType = oltType && oltType.toUpperCase() === 'GPON' ? 'ONU' : 'ONU';
    await ctx.reply(`PON Port ${portNum} - Ditemukan ${onuList.length} ${deviceType}\nOnline: ${onlineONUs} | Offline: ${offlineONUs}${initialONUs > 0 ? ` | Initial: ${initialONUs}` : ''}\n\nMengirim daftar...`);
    
    // Group ONUs by status
    const onlineList = onuList.filter(onu => 
      Number(onu.rstate) === 1 || 
      (onu.rstate === undefined && onu.status === '✅')
    );
    
    const offlineList = onuList.filter(onu => 
      Number(onu.rstate) === 2 || 
      (onu.rstate === undefined && onu.status === '❌')
    );
    
    const initialList = onuList.filter(onu => 
      Number(onu.rstate) === 0 || 
      (onu.rstate === undefined && onu.status === '⚠️')
    );
    
    // Send online ONUs
    if (onlineList.length > 0) {
      let onlineMessage = `✅ ONLINE (${onlineList.length}):\n`;
      for (const onu of onlineList) {
        onlineMessage += `${onu.sn} (${onu.name})\n`;
      }
      await ctx.reply(onlineMessage);
    }
    
    // Send offline ONUs
    if (offlineList.length > 0) {
      let offlineMessage = `❌ OFFLINE (${offlineList.length}):\n`;
      for (const onu of offlineList) {
        offlineMessage += `${onu.sn} (${onu.name})\n`;
      }
      await ctx.reply(offlineMessage);
    }
    
    // Send initial ONUs
    if (initialList.length > 0) {
      let initialMessage = `⚠️ INITIAL (${initialList.length}):\n`;
      for (const onu of initialList) {
        initialMessage += `${onu.sn} (${onu.name})\n`;
      }
      await ctx.reply(initialMessage);
    }
    
    // Send completion message
    await ctx.reply(`✅ Selesai menampilkan data ONU untuk PON port ${portNum}.`);
  } catch (error) {
    console.error('Error in showpon command:', error.message);
    ctx.reply(`❌ Terjadi kesalahan: ${error.message}`);
  }
};

/**
 * Handle /help command - Display available commands
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
 * Handle /delete command - Delete previous messages
 * @param {Object} ctx Telegraf context
 */
const handleDeleteCommand = async (ctx) => {
  let i = 0;
  while(true) {
    try {
      await ctx.deleteMessage(ctx.message.message_id - i++);
    } catch(e) {
      break;
    }
  }
};

/**
 * Handle cancel action - Cancel operations
 * @param {Object} ctx Telegraf context
 */
const handleCancelAction = async (ctx) => {
  await ctx.editMessageText('❌ Operasi dibatalkan.', { reply_markup: { inline_keyboard: [] } });
};

/**
 * Handle bot errors
 * @param {Error} err Error object
 * @param {Object} ctx Telegraf context
 */
const handleBotError = (err, ctx) => {
  console.error('Bot error:', err);
  
  // If error is due to unknown command
  if (err.message && err.message.includes('Unknown command')) {
    ctx.reply('Perintah tidak dikenal. Ketik /help untuk melihat daftar perintah yang tersedia.');
  } else {
    // Other errors, also direct to help
    ctx.reply('Terjadi kesalahan. Ketik /help untuk melihat daftar perintah yang tersedia.');
  }
};

module.exports = {
  handleOltSystemCommand: handleOltCommand,
  handlePonCommand,
  handleShowPonCommand,
  handleHelpCommand,
  handleDeleteCommand,
  handleCancelAction,
  handleBotError
};