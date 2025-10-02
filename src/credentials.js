const fs = require('fs');

const authFile = './src/authuserlist.json';
if (!fs.existsSync(authFile)) {
	fs.writeFileSync(authFile, '[]', 'utf-8');
}

const loadAuth = () => {
	try {
		const fileBuffer = fs.readFileSync(authFile);
		const fileContent = fileBuffer.toString().trim();

		if (fileContent === '') {
			fs.writeFileSync(authFile, '[]', 'utf-8');
			return [];
		}

		const contacts = JSON.parse(fileContent);
		return contacts;
	} catch (error) {
		console.error('Error loading auth file:', error.message);
		fs.writeFileSync(authFile, '[]', 'utf-8');
		return [];
	}
}

const saveAuth = (nama, telegramId) => {
	try {
		const contact = {
			nama,
			telegramId
		};
		const contacts = loadAuth();

		const duplikat = contacts.find((contact) => contact.telegramId === telegramId);
		if (!duplikat) {
			contacts.push(contact);
			fs.writeFileSync(authFile, JSON.stringify(contacts, null, 2));
			console.log(`User ${nama} (${telegramId}) berhasil disimpan`);
		}
	} catch (error) {
		console.error('Error saving auth:', error.message);
		throw error;
	}
}

const findAuth = (telegramId) => {
	try {
		const contacts = loadAuth();
		const finding = contacts.find((contact) => contact.telegramId === telegramId);
		if (finding) {
			return true
		} else {
			return false
		}
	} catch (error) {
		console.error('Error finding auth:', error.message);
		return false;
	}
}

module.exports = {
	saveAuth,
	findAuth
}