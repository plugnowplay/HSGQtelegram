/**
 * ONU command handlers
 */
const { getAllOnus, getOnuDetail, rebootOnu, changeOnuName } = require('../services/onuService');
const { oltType } = require('../utils/api');

/**
 * Handle /onu command - Display ONU details
 * @param {Object} ctx Telegraf context
 */
const handleOnuCommand = async (ctx) => {
  try {
    const msg = ctx.message.text;
    const msgArray = msg.split(' ');
    msgArray.shift();
    const onuName = msgArray.join(' ');

    if (!onuName || onuName.trim() === '') {
      const deviceType = oltType && oltType.toUpperCase() === 'GPON' ? 
        'Serial Number (SN)' : 'MAC address';
      
      ctx.reply(`Mohon masukkan ${deviceType} atau nama ONU. Contoh: /onu ABCD1234`);
      return;
    }

    console.log(`[Handler] Searching for ONU: ${onuName}`);
    const text = await getOnuDetail(onuName);
    ctx.reply(text);
  } catch (error) {
    console.error('Error in onu command:', error.message);
    ctx.reply('Maaf, terjadi kesalahan saat mencari informasi ONU. Silahkan coba lagi nanti.');
  }
};

/**
 * Handle /reboot command - Reboot an ONU
 * @param {Object} ctx Telegraf context
 */
const handleRebootCommand = async (ctx) => {
  try {
    const msg = ctx.message.text;
    const msgArray = msg.split(' ');
    msgArray.shift();
    const onuName = msgArray.join(' ');

    if (!onuName || onuName.trim() === '') {
      const deviceType = oltType && oltType.toUpperCase() === 'GPON' ? 
        'Serial Number (SN)' : 'MAC address';
      
      ctx.reply(`⚠️ Mohon masukkan ${deviceType} atau nama ONU. Contoh: /reboot ABCD1234`);
      return;
    }

    // Confirm reboot
    const confirmText = `⚠️ KONFIRMASI REBOOT\n\nAnda akan melakukan reboot pada:\n${onuName}\n\nKlik tombol "Reboot" untuk melanjutkan.`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Reboot', callback_data: `reboot:${onuName}` },
          { text: '❌ Batal', callback_data: 'cancel' }
        ]
      ]
    };
    
    await ctx.reply(confirmText, { reply_markup: keyboard });
  } catch (error) {
    ctx.reply('❌ Terjadi kesalahan saat memproses perintah. Silahkan coba lagi nanti.');
  }
};

/**
 * Handle reboot action - Process ONU reboot
 * @param {Object} ctx Telegraf context
 */
const handleRebootAction = async (ctx) => {
  try {
    const onuName = ctx.match[1];
    
    // Show processing message
    await ctx.editMessageText(`⏳ Sedang memproses reboot untuk ${onuName}...`, { reply_markup: { inline_keyboard: [] } });
    
    // Execute reboot
    const result = await rebootOnu(onuName);
    
    // Update message with result
    await ctx.editMessageText(result);
  } catch (error) {
    await ctx.editMessageText('❌ Terjadi kesalahan saat melakukan reboot. Silahkan coba lagi nanti.');
  }
};

/**
 * Handle /showall command - Show all registered ONUs
 * @param {Object} ctx Telegraf context
 */
const handleShowAllCommand = async (ctx) => {
  try {
    // Show loading message
    const loadingMsg = await ctx.reply('⏳ Mengambil data semua ONU...');
    
    // Get all ONUs
    const onuList = await getAllOnus();
    
    if (!onuList || onuList.length === 0) {
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
      await ctx.reply('Tidak ada ONU yang ditemukan.');
      return;
    }
    
    // Delete loading message
    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
    
    // Send summary
    const deviceType = oltType && oltType.toUpperCase() === 'GPON' ? 'ONU' : 'ONU';
    await ctx.reply(`Ditemukan ${onuList.length} ${deviceType}. Mengirim daftar...`);
    
    // Send one message per ONU with delay to avoid throttling
    const delay = 300; // 300ms delay between messages
    
    // Limit maximum number of ONUs to send
    const maxToSend = Math.min(onuList.length, 100); // Max 100 ONUs for safety
    
    // Send data one by one with delay
    for (let i = 0; i < maxToSend; i++) {
      const onu = onuList[i];
      
      // Format simple message with just SN and name
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
    await ctx.reply(`✅ Selesai menampilkan ${maxToSend} ${deviceType}.`);
  } catch (error) {
    ctx.reply(`❌ Terjadi kesalahan: ${error.message}`);
  }
};

/**
 * Handle /rename command - Change ONU name
 * @param {Object} ctx Telegraf context
 */
const handleRenameCommand = async (ctx) => {
  try {
    const msg = ctx.message.text;
    const params = msg.split(' ');
    params.shift(); // Remove the command itself
    
    if (params.length < 2) {
      const deviceType = oltType && oltType.toUpperCase() === 'GPON' ? 
        'SN/Nama ONU' : 'MAC/Nama ONU';
      
      ctx.reply(`⚠️ Format yang benar: /rename ${deviceType} NAMA-BARU`);
      return;
    }
    
    const onuName = params[0];
    const newName = params.slice(1).join(' '); // Allow spaces in the new name
    
    // Confirm rename
    const confirmText = `⚠️ KONFIRMASI RENAME\n\nAnda akan mengubah nama:\n${onuName}\nMenjadi:\n${newName}\n\nKlik tombol "Rename" untuk melanjutkan.`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Rename', callback_data: `rename:${onuName}:${newName}` },
          { text: '❌ Batal', callback_data: 'cancel' }
        ]
      ]
    };
    
    await ctx.reply(confirmText, { reply_markup: keyboard });
  } catch (error) {
    ctx.reply('❌ Terjadi kesalahan saat memproses perintah. Silahkan coba lagi nanti.');
  }
};

/**
 * Handle rename action - Process ONU rename
 * @param {Object} ctx Telegraf context
 */
const handleRenameAction = async (ctx) => {
  try {
    const onuName = ctx.match[1];
    const newName = ctx.match[2];
    
    // Show processing message
    await ctx.editMessageText(`⏳ Sedang mengubah nama ${onuName} menjadi ${newName}...`, { reply_markup: { inline_keyboard: [] } });
    
    // Execute rename
    const result = await changeOnuName(onuName, newName);
    
    // Update message with result
    await ctx.editMessageText(result);
  } catch (error) {
    await ctx.editMessageText('❌ Terjadi kesalahan saat mengubah nama. Silahkan coba lagi nanti.');
  }
};

/**
 * Handle text message - Direct ONU search
 * @param {Object} ctx Telegraf context
 */
const handleTextMessage = async (ctx) => {
  const text = ctx.message.text;
  
  // Skip if this is a command
  if (text.startsWith('/')) {
    return;
  }
  
  // Treat as ONU search
  try {
    const result = await getOnuDetail(text);
    ctx.reply(result);
  } catch (error) {
    ctx.reply('Maaf, terjadi kesalahan saat mencari informasi. Silahkan coba lagi nanti.');
  }
};

module.exports = {
  handleOnuDetailCommand: handleOnuCommand,
  handleRebootCommand,
  handleRebootConfirmation: handleRebootAction,
  handleShowAllCommand,
  handleRenameCommand,
  handleRenameConfirmation: handleRenameAction,
  handleTextSearch: handleTextMessage
};