/**
 * Authentication utilities for user management
 */
const fs = require('fs');
const config = require('../config');

const authFile = config.paths.authFile;

// Initialize auth file if it doesn't exist
if (!fs.existsSync(authFile)) {
  fs.writeFileSync(authFile, '[]', 'utf-8');
}

/**
 * Load authorized users from auth file
 * @returns {Array} Array of authorized users
 */
const loadAuth = () => {
  try {
    const fileBuffer = fs.readFileSync(authFile);
    const fileContent = fileBuffer.toString().trim();
    
    // Return empty array if file is empty
    if (fileContent === '') {
      fs.writeFileSync(authFile, '[]', 'utf-8');
      return [];
    }
    
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('Error loading auth file:', error.message);
    // Recreate file with empty array if error occurs
    fs.writeFileSync(authFile, '[]', 'utf-8');
    return [];
  }
};

/**
 * Save new user to auth file
 * @param {string} nama User name
 * @param {number} telegramId Telegram user ID
 * @returns {boolean} True if saved successfully
 */
const saveAuth = (nama, telegramId) => {
  try {
    const contact = { nama, telegramId };
    const contacts = loadAuth();
    
    // Check for duplicates
    const existing = contacts.find((contact) => contact.telegramId === telegramId);
    if (!existing) {
      contacts.push(contact);
      fs.writeFileSync(authFile, JSON.stringify(contacts, null, 2));
      console.log(`User ${nama} (${telegramId}) berhasil disimpan`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error saving auth:', error.message);
    return false;
  }
};

/**
 * Find user in auth file by Telegram ID
 * @param {number} telegramId Telegram user ID
 * @returns {boolean} True if user is authorized
 */
const findAuth = (telegramId) => {
  try {
    const contacts = loadAuth();
    const result = contacts.find((contact) => contact.telegramId === telegramId);
    return !!result; // Convert to boolean
  } catch (error) {
    console.error('Error finding auth:', error.message);
    return false;
  }
};

module.exports = {
  loadAuth,
  saveAuth,
  findAuth
};