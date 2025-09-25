/**
 * API utilities for working with OLT API
 */
const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');

// Extract OLT configuration
const { url: baseUrl, username, password, type: oltType } = config.olt;

// Generate authentication tokens
const md5Key = crypto.createHash('md5').update(username + ":" + password).digest("hex");
const base64Password = Buffer.from(password, 'utf8').toString('base64');

// Token management
let xToken = "";
let tokenExpiration = 0; // Timestamp for token expiration

/**
 * Get authentication token, refreshing if expired
 * @returns {string} Valid authentication token
 */
const getToken = async () => {
  const currentTime = Date.now();
  
  // Return existing token if it's still valid
  if (xToken && currentTime < tokenExpiration) {
    return xToken;
  }
  
  console.log('[API] Obtaining new authentication token');
  
  try {
    const loginUrl = `${baseUrl}/userlogin?form=login`;
    console.log('[API] Sending login request to:', loginUrl);
    
    const response = await axios({
      method: 'post',
      url: loginUrl,
      data: {
        method: "set",
        param: {
          name: username,
          key: md5Key,
          value: base64Password,
          captcha_v: "",
          captcha_f: ""
        }
      }     
    });
    
    console.log('[API] Login response status:', response.status);
    console.log('[API] Response headers:', Object.keys(response.headers).join(', '));
    
    // Get token from response headers (x-token)
    const newToken = response.headers["x-token"];
    if (newToken) {
      xToken = newToken;
      // Set token expiration to 30 minutes (1800000 ms) as in original code
      tokenExpiration = currentTime + 1800000;
      console.log('[API] Token acquired successfully:', newToken.substring(0, 10) + '...');
      return xToken;
    } else {
      console.warn('[API] No token found in response headers');
      throw new Error('No token found in response headers');
    }
  } catch (error) {
    console.error('[API] Error getting token:', error.message);
    throw error;
  }
};

/**
 * Make API request with token refresh capability
 * @param {Function} apiCall Function that makes the actual API call
 * @param {number} maxRetries Maximum number of retry attempts
 * @returns {Promise} API response
 */
const handleTokenFailure = async (apiCall, maxRetries = 2) => {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    attempt++;
    
    try {
      // Ensure we have a valid token
      await getToken();
      
      // Execute the API call
      const result = await apiCall();
      
      // Check if token has failed
      if (result?.data?.message === "Token Check Failed") {
        if (attempt < maxRetries) {
          console.log(`[API] Token check failed, refreshing token (attempt ${attempt})`);
          xToken = "";
          continue;
        } else {
          throw new Error('Token authentication failed after maximum retries');
        }
      }
      
      // If we reach here, call was successful
      return result;
    } catch (error) {
      if (attempt < maxRetries) {
        console.log(`[API] Request failed, retrying (attempt ${attempt})`);
        // Wait 1 second before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      throw error;
    }
  }
  
  throw new Error('All API request attempts failed');
};

/**
 * Make a GET request to the OLT API
 * @param {string} endpoint API endpoint path
 * @returns {Promise} API response
 */
const apiGet = async (endpoint) => {
  return handleTokenFailure(async () => {
    return await axios.get(`${baseUrl}${endpoint}`, {
      headers: { "X-Token": xToken }
    });
  });
};

/**
 * Make a POST request to the OLT API
 * @param {string} endpoint API endpoint path
 * @param {Object} data Request payload
 * @returns {Promise} API response
 */
const apiPost = async (endpoint, data) => {
  return handleTokenFailure(async () => {
    return await axios({
      method: 'post',
      url: `${baseUrl}${endpoint}`,
      headers: {
        "X-Token": xToken,
        "Content-Type": "application/json"
      },
      data
    });
  });
};

module.exports = {
  getToken,
  apiGet,
  apiPost,
  handleTokenFailure,
  oltType
};