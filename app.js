const {
	Telegraf
} = require('telegraf');
const {
	message
} = require('telegraf/filters');
const axios = require('axios');
require('dotenv').config();

// GANTI baris import yang lama dengan yang ini
const {
	ponHSGQ,
	onuDetail,
	oltSystem,
	rebootOnu,
	changeOntName,
	getAllOnu,
	getBadSignalOnus, // <--- TAMBAHKAN INI
	typeOlt
} = require('./src/olt.js');
const {
	saveAuth,
	findAuth
} = require('./src/credentials.js')

if (!process.env.BOT_TOKEN) {
	console.error('ERROR: BOT_TOKEN tidak ditemukan di file .env');
	process.exit(1);
}

if (!process.env.PASS_CHAT) {
	console.error('ERROR: PASS_CHAT tidak ditemukan di file .env');
	process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const passChat = process.env.PASS_CHAT;

bot.command('password', (ctx) => {
	try {
		msg = ctx.message.text
		msgArray = msg.split(' ')
		msgArray.shift()
		passLogin = msgArray.join(' ')

		if (passChat == passLogin) {
			const nama = ctx.chat.first_name;
			const telegramId = ctx.message.from.id;
			const finding = findAuth(telegramId);
			if (finding == true) {
				ctx.reply("Anda telah melakukan inisialisai sebelumnya");
			} else {
				saveAuth(nama, telegramId);
				ctx.reply("Halo " + ctx.chat.first_name + ", Password yang anda masukkan Benar, Silahkan memasukkan perintah /help untuk informasi bantuan");
			}
		} else {
			ctx.reply("Maaf " + ctx.chat.first_name + ", Password Salah ⚠️");
		}
	} catch (error) {
		console.error('Error in password command:', error);
		ctx.reply("Terjadi kesalahan saat memproses password. Silahkan coba lagi.");
	}
});


bot.use((ctx, next) => {
	try {

		let telegramId;

		if (ctx.message && ctx.message.from) {

			telegramId = ctx.message.from.id;
		} else if (ctx.callbackQuery && ctx.callbackQuery.from) {

			telegramId = ctx.callbackQuery.from.id;
		} else {

			return next();
		}

		const finding = findAuth(telegramId)
		if (finding == true) {
			return next();
		} else {

			if (ctx.message) {
				ctx.reply('Maaf Anda bukan anggota ⚠️');
			} else if (ctx.callbackQuery) {
				ctx.answerCbQuery('Maaf Anda bukan anggota ⚠️');
			}
		}
	} catch (error) {
		console.error('Error in middleware:', error);
		if (ctx.message) {
			ctx.reply('Terjadi kesalahan sistem. Silahkan coba lagi.');
		}
	}
});

bot.use(async (ctx, next) => {

	await next()

})

bot.start((ctx) => ctx.reply('Selamat Datang! Ketik /help untuk informasi bantuan'));
bot.help((ctx) => {
	const oltType = process.env.OLT_TYPE || 'Unknown';
	let onuParamExample = '';

	if (oltType.toUpperCase() === 'GPON') {
		onuParamExample = `📡 GPON Mode:
/onu - Contoh: /onu ZTE12345 atau /onu budi`;
	} else if (oltType.toUpperCase() === 'EPON') {
		onuParamExample = `📡 EPON Mode:
/onu - Contoh: /onu 00:11:22:33:44:55 atau /onu budi`;
	} else {
		onuParamExample = `📡 Unknown Mode:
/onu - Gunakan MAC (EPON) atau SN (GPON) atau nama ONU`;
	}

	const helpText = `🤖 Bot OLT HSGQ - Perintah yang tersedia:

/pon - Info status PON ports dan ONU
/olt - Info sistem OLT
/cek - Cek ONU dengan redaman buruk
/onu - Tampilkan detail ONU
/reboot - Reboot ONU
/rename - Ubah nama ONU
/showall - Tampilkan semua ONU yang terdaftar

📡 Tipe OLT saat ini: ${oltType}
•EPON: Menggunakan MAC address
•GPON: Menggunakan Serial Number (SN).`;

	ctx.reply(helpText);
});
bot.on(message('sticker'), (ctx) => ctx.reply(''));
bot.hears('hi', (ctx) => ctx.reply('Hey, ' + ctx.chat.first_name));
bot.command('delete', async (ctx) => {
	let i = 0;
	while (true) {
		try {
			await ctx.deleteMessage(ctx.message.message_id - i++);
		} catch (e) {
			break;
		}
	}
});

bot.command('pon', async (ctx) => {
	try {
		let text = await ponHSGQ();


		ctx.reply(text);
	} catch (error) {

		ctx.reply('Maaf, terjadi kesalahan saat mengambil informasi PON. Silahkan coba lagi nanti.');
	}
});

bot.command('onu', async (ctx) => {
	try {
		let msg = ctx.message.text
		msgArray = msg.split(' ')
		msgArray.shift()
		let onuName = msgArray.join(' ')

		if (!onuName || onuName.trim() === '') {
			const oltType = process.env.OLT_TYPE || 'Unknown';
			let exampleText = '';

			if (oltType.toUpperCase() === 'GPON') {
				exampleText = '/onu HWTC0843129e';
			} else if (oltType.toUpperCase() === 'EPON') {
				exampleText = '/onu 00:1B:44:11:3A:B7';
			} else {
				exampleText = 'MAC address (EPON), Serial Number (GPON), atau nama ONU';
			}

			ctx.reply(`⚠️ Format yang benar: ${exampleText}`);
			return;
		}



		let text = await onuDetail(onuName);


		ctx.reply(text);
	} catch (error) {

		ctx.reply('Maaf, terjadi kesalahan saat mencari informasi ONU. Silahkan coba lagi nanti.');
	}
});

bot.command('olt', async (ctx) => {
	let text;
	try {
		text = await oltSystem();
	} catch (e) {
		text = 'Terjadi kesalahan saat mengambil data sistem OLT';
	}
	ctx.reply(text);
});

bot.command('cek', async (ctx) => {
	try {
		const loadingMsg = await ctx.reply('🔎 Sedang memeriksa redaman seluruh ONU, ini mungkin memerlukan waktu...');

		const badOnus = await getBadSignalOnus();

		await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);

		if (!badOnus || badOnus.length === 0) {
			await ctx.reply('✅ Tidak ditemukan ONU dengan redaman di bawah -25 dBm.');
			return;
		}

		let responseText = `⚠️ Ditemukan ${badOnus.length} ONU dengan redaman buruk (< -25 dBm):\n\n`;

		const identifierLabel = typeOlt && typeOlt.toUpperCase() === 'GPON' ? 'SN' : 'MAC';

		for (const onu of badOnus) {
			responseText += `📛 ${onu.name}\n`;
			responseText += `(${identifierLabel}: ${onu.identifier})\n`;
			responseText += `Signal: ${onu.power} dBm\n\n`;
		}

		await ctx.reply(responseText);

	} catch (error) {
		ctx.reply(`❌ Terjadi kesalahan saat memeriksa redaman: ${error.message}`);
	}
});

bot.command('reboot', async (ctx) => {
	try {
		let msg = ctx.message.text;
		msgArray = msg.split(' ');
		msgArray.shift();
		let onuName = msgArray.join(' ');

		if (!onuName || onuName.trim() === '') {
			const oltType = process.env.OLT_TYPE || 'Unknown';
			let exampleText = '';

			if (oltType.toUpperCase() === 'GPON') {
				exampleText = '/reboot HWTC0843129e';
			} else if (oltType.toUpperCase() === 'EPON') {
				exampleText = '/reboot 00:1B:44:11:3A:B7';
			} else {
				exampleText = 'MAC address (EPON), Serial Number (GPON), atau nama ONU';
			}

			ctx.reply(`⚠️ Format yang benar: ${exampleText}`);
			return;
		}


		const confirmText = `⚠️ KONFIRMASI REBOOT\n\nAnda akan melakukan reboot pada:\n${onuName}\n\nKlik tombol "Reboot" untuk melanjutkan.`;

		const keyboard = {
			inline_keyboard: [
				[{
						text: '✅Reboot',
						callback_data: `reboot:${onuName}`
					},
					{
						text: '❌Batal',
						callback_data: 'cancel'
					}
				]
			]
		};

		await ctx.reply(confirmText, {
			reply_markup: keyboard
		});
	} catch (error) {
		ctx.reply('❌Terjadi kesalahan saat memproses perintah. Silahkan coba lagi nanti.');
	}
});


bot.action(/reboot:(.+)/, async (ctx) => {
	try {
		const onuName = ctx.match[1];


		await ctx.editMessageText(`⏳Sedang memproses reboot untuk ${onuName}...`, {
			reply_markup: {
				inline_keyboard: []
			}
		});


		const result = await rebootOnu(onuName);


		await ctx.editMessageText(result);
	} catch (error) {
		await ctx.editMessageText('⏳Terjadi kesalahan saat melakukan reboot. Silahkan coba lagi nanti.');
	}
});


bot.action('cancel', async (ctx) => {
	await ctx.editMessageText('❌Operasi dibatalkan.', {
		reply_markup: {
			inline_keyboard: []
		}
	});
});


bot.command('showall', async (ctx) => {
	try {

		const loadingMsg = await ctx.reply('⏳Mengambil data semua ONU...');


		const onuList = await getAllOnu();

		if (!onuList || onuList.length === 0) {
			await ctx.reply('Tidak ada ONU yang ditemukan.');
			return;
		}


		await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);


		const deviceType = typeOlt && typeOlt.toUpperCase() === 'GPON' ? 'ONU' : 'ONU';
		await ctx.reply(`Ditemukan ${onuList.length} ${deviceType}. Mengirim daftar...`);


		const chunkSize = 25;
		for (let i = 0; i < onuList.length; i += chunkSize) {
			const chunk = onuList.slice(i, i + chunkSize);
			let message = chunk
				.map(onu => `${onu.status} ${onu.sn} - ${onu.name}`)
				.join('\n');

			await ctx.reply(message);
		}


		await ctx.reply(`✅ Selesai menampilkan ${onuList.length} ${deviceType}.`);

	} catch (error) {
		ctx.reply(`⚠️Terjadi kesalahan: ${error.message}`);
	}
});


bot.command('rename', async (ctx) => {
	try {
		let msg = ctx.message.text;
		let params = msg.split(' ');
		params.shift();

		if (params.length < 2) {
			const oltType = process.env.OLT_TYPE || 'Unknown';
			let exampleText = '';

			if (oltType.toUpperCase() === 'GPON') {
				exampleText = '/rename NAMA NAMA-BARU';
			} else if (oltType.toUpperCase() === 'EPON') {
				exampleText = '/rename 00:11:22:33:44:55 NAMA-BARU';
			} else {
				exampleText = '/rename [NAMA] [NAMA BARU]';
			}

			ctx.reply(`⚠️ Format yang benar: ${exampleText}`);
			return;
		}

		const onuName = params[0];
		const newName = params.slice(1).join(' ');


		const confirmText = `⚠️ KONFIRMASI RENAME\n\nAnda akan mengubah nama:\n${onuName}\nMenjadi:\n${newName}\n\nKlik tombol "Rename" untuk melanjutkan.`;

		const keyboard = {
			inline_keyboard: [
				[{
						text: '✅Rename',
						callback_data: `rename:${onuName}:${newName}`
					},
					{
						text: '❌Batal',
						callback_data: 'cancel'
					}
				]
			]
		};

		await ctx.reply(confirmText, {
			reply_markup: keyboard
		});
	} catch (error) {
		ctx.reply('❌Terjadi kesalahan saat memproses perintah. Silahkan coba lagi nanti.');
	}
});


bot.action(/rename:([^:]+):(.+)/, async (ctx) => {
	try {
		const onuName = ctx.match[1];
		const newName = ctx.match[2];


		await ctx.editMessageText(`⏳Sedang mengubah nama ${onuName} menjadi ${newName}...`, {
			reply_markup: {
				inline_keyboard: []
			}
		});


		const result = await changeOntName(onuName, newName);


		await ctx.editMessageText(result);
	} catch (error) {
		await ctx.editMessageText('❌Terjadi kesalahan saat mengubah nama. Silahkan coba lagi nanti.');
	}
});


bot.on(message('text'), async (ctx) => {
	const text = ctx.message.text;


	if (text.startsWith('/')) {

		ctx.reply('Perintah tidak dikenal. Ketik /help untuk melihat daftar perintah yang tersedia.');
		return;
	}


	try {
		let result = await onuDetail(text);

		ctx.reply(result);
	} catch (error) {
		ctx.reply('Maaf, terjadi kesalahan saat mencari informasi. Silahkan coba lagi nanti.');
	}
});


bot.catch((err, ctx) => {



	if (err.message && err.message.includes('Unknown command')) {
		ctx.reply('Perintah tidak dikenal. Ketik /help untuk melihat daftar perintah yang tersedia.');
	} else {

		ctx.reply('Terjadi kesalahan. Ketik /help untuk melihat daftar perintah yang tersedia.');
	}
});

bot.launch();