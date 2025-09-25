/**
 * HSGQ OLT Bot - Main Application
 * A Telegram bot for managing OLT devices (EPON and GPON)
 */
const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');
require('dotenv').config();

// Import configurations
const config = require('./src/config');

// Import handlers
const authHandlers = require('./src/handlers/authHandlers');
const onuHandlers = require('./src/handlers/onuHandlers');
const systemHandlers = require('./src/handlers/systemHandlers');

// Validate environment variables
if (!config.bot?.token) {
    console.error('ERROR: BOT_TOKEN tidak ditemukan di file .env');
    process.exit(1);
}

if (!config.bot?.passChat) {
    console.error('ERROR: PASS_CHAT tidak ditemukan di file .env');
    process.exit(1);
}

// Initialize bot
const bot = new Telegraf(config.bot.token);

// Register authentication handler
bot.command('password', authHandlers.handlePasswordCommand);

// Authentication middleware
bot.use(authHandlers.authMiddleware);

// Logging middleware
bot.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    console.log(`${ctx.updateType} processed in ${ms}ms`);
});

// Basic command handlers
bot.start((ctx) => ctx.reply('Selamat Datang! Ketik /help untuk informasi bantuan'));
bot.help(systemHandlers.handleHelpCommand);
bot.on(message('sticker'), (ctx) => ctx.reply('👍'));
bot.hears('hi', (ctx) => ctx.reply('Hey, ' + ctx.chat.first_name));

// Utility commands
bot.command('delete', systemHandlers.handleDeleteCommand);

// ONU related commands
bot.command('pon', systemHandlers.handlePonCommand);
bot.command('onu', onuHandlers.handleOnuDetailCommand);
bot.command('reboot', onuHandlers.handleRebootCommand);
bot.command('rename', onuHandlers.handleRenameCommand);
bot.command('showall', onuHandlers.handleShowAllCommand);
bot.command('showpon', systemHandlers.handleShowPonCommand);

// System related commands
bot.command('olt', systemHandlers.handleOltSystemCommand);

// Register callback handlers
bot.action(/reboot:(.+)/, onuHandlers.handleRebootConfirmation);
bot.action(/rename:([^:]+):(.+)/, onuHandlers.handleRenameConfirmation);
bot.action('cancel', systemHandlers.handleCancelAction);

// Text search handler (when user types SN/MAC/name directly)
bot.on(message('text'), onuHandlers.handleTextSearch);

// Error handler
bot.catch(systemHandlers.handleBotError);

// Start the bot
console.log('Starting OLT Bot...');
bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));