/**
 * OLT System related API services
 */
const { apiGet, oltType } = require('../utils/api');

/**
 * Get OLT system information
 * @returns {Promise<string>} Formatted system info text
 */
const getOltSystemInfo = async () => {
  console.log('[System Service] Getting OLT system information');
  
  try {
    // Get system information
    const systemResp = await apiGet('/board?info=system');
    
    console.log('[System Service] System response structure:', 
      JSON.stringify({
        hasData: !!systemResp.data,
        dataKeys: systemResp.data ? Object.keys(systemResp.data) : [],
        hasDataData: systemResp.data && !!systemResp.data.data,
        dataDataKeys: systemResp.data && systemResp.data.data ? Object.keys(systemResp.data.data) : []
      })
    );
    
    // Get time information
    const timeResp = await apiGet('/time?form=info');
    
    console.log('[System Service] Time response structure:', 
      JSON.stringify({
        hasData: !!timeResp.data,
        dataKeys: timeResp.data ? Object.keys(timeResp.data) : [],
        hasDataData: timeResp.data && !!timeResp.data.data,
        dataDataKeys: timeResp.data && timeResp.data.data ? Object.keys(timeResp.data.data) : []
      })
    );
    
    if (!systemResp.data || !systemResp.data.data) {
      throw new Error('Invalid system response data');
    }
    
    const info = systemResp.data.data;
    
    // Detect OLT type from response
    const typeText = detectOltType(info);
    
    // Initialize time and uptime values
    let currentTime = 'Unknown';
    let uptimeText = 'Unknown';
    
    // Extract time and uptime from time response if available
    if (timeResp.data && timeResp.data.data) {
      const timeData = timeResp.data.data;
      
      // Debug time data
      console.log('[System Service] Time data:', JSON.stringify(timeData));
      
      // Format time [year, month, day, hour, minute, second]
      if (Array.isArray(timeData.time_now) && timeData.time_now.length >= 6) {
        const [year, month, day, hour, minute, second] = timeData.time_now;
        currentTime = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
      }
      
      // Process uptime information
      let uptimeFound = false;
      
      // Direct check for array format in uptime field
      if (Array.isArray(timeData.uptime) && timeData.uptime.length === 4) {
        console.log('[System Service] Found uptime as direct array:', JSON.stringify(timeData.uptime));
        const [days, hours, minutes, seconds] = timeData.uptime;
        if (!isNaN(days) && !isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
          let result = '';
          if (days > 0) result += `${days} days `;
          if (hours > 0) result += `${hours} hours `;
          if (minutes > 0) result += `${minutes} minutes `;
          result += `${seconds} seconds`;
          uptimeText = result;
          uptimeFound = true;
        }
      }
    }
    
    // Debug: Log full info objects
    console.log('[System Service] System info data:', JSON.stringify(info));
    
    // Try to extract uptime directly from system info if not found in time response
    if (uptimeText === 'Unknown') {
      // Check for uptime in system info (some OLT models store it there)
      const systemUptime = info.uptime || info.runtime || info.running_time || info.up_time;
      if (systemUptime) {
        console.log('[System Service] Found uptime in system info:', systemUptime);
        uptimeText = formatUptime(systemUptime);
      }
    }
    
    // Format device type to be human-readable
    let deviceTypeText = 'Unknown';
    if (info.device_type !== undefined) {
      // Map numeric device types to readable names
      if (info.device_type === 1 || info.device_type === '1') {
        deviceTypeText = 'EPON';
      } else if (info.device_type === 2 || info.device_type === '2') {
        deviceTypeText = 'GPON';
      } else {
        // If it's not a known numeric type, use the original value
        deviceTypeText = info.device_type;
      }
    }
    
    // Build information text
    const lines = [
      `OLT System Info (${typeText})`,
      '------------------------',
      `Vendor: ${info.vendor || 'Unknown'}`,
      `Device Model: ${info.product_name || info.device_model || 'Unknown'}`,
      `Firmware Version: ${info.fw_ver || 'Unknown'}`,
      `MAC Address: ${info.macaddr || info.mac || 'Unknown'}`,
      `Serial Number: ${info.sn || info.serial_no || 'Unknown'}`,
      `Device Type: ${deviceTypeText}`,
      `PON Ports: ${info.ponports || 'Unknown'}`,
      `Current Time: ${currentTime}`,
      `Uptime: ${uptimeText}`,
    ];
    
    // Add warning if configured type doesn't match actual type
    if (oltType && typeText !== 'Unknown' && oltType.toUpperCase() !== typeText) {
      lines.push('');
      lines.push('⚠️ WARNING: Configured OLT type does not match actual device!');
    }
    
    return lines.join('\n');
  } catch (error) {
    console.error(`[System Service] Error getting OLT system info:`, error.message);
    return 'Maaf, tidak dapat terhubung ke perangkat OLT untuk mengambil info sistem.';
  }
};

/**
 * Get PON port status information
 * @param {number} ponPort Optional port to filter
 * @returns {Promise<string>} Formatted port status text
 */
const getPonStatus = async (ponPort = null) => {
  console.log(`[System Service] Getting PON status${ponPort ? ` for port ${ponPort}` : ''}`);
  
  try {
    // Use the same endpoint for both OLT types
    const resp = await apiGet('/board?info=pon');
    
    if (!resp.data || !resp.data.data || !Array.isArray(resp.data.data)) {
      throw new Error('Invalid response data');
    }
    
    const info = resp.data.data;
    
    // Build text with validation for each PON port
    let ponInfo = `Info Jumlah & Status Onu (${oltType || 'Unknown'})\n`;
    
    // Filter ports if requested
    let filteredInfo = info;
    if (ponPort !== null) {
      const portNumber = parseInt(ponPort, 10);
      filteredInfo = info.filter(port => {
        const portId = parseInt(port.port_id, 10);
        return portId === portNumber;
      });
      
      if (filteredInfo.length === 0) {
        ponInfo += `\nTidak ada PON port ${ponPort} yang ditemukan.\n`;
      }
    }
    
    // Format port information
    for (const port of filteredInfo) {
      if (port && port.port_id !== undefined) {
        // Different format for EPON and GPON
        if (oltType && oltType.toUpperCase() === 'EPON') {
          ponInfo += `    EPON ${port.port_id} = online : ${port.online || 0}, offline : ${port.offline || 0}\n`;
        } else {
          ponInfo += `    PON ${port.port_id} = online : ${port.online || 0}, offline : ${port.offline || 0}\n`;
        }
      }
    }
    
    // Add offline device information if available
    const offlineInfo = await getOfflineDeviceInfo(ponPort);
    if (offlineInfo) {
      ponInfo += offlineInfo;
    }
    
    return ponInfo;
  } catch (error) {
    console.error(`[System Service] Error getting PON status:`, error.message);
    return 'Maaf, tidak dapat terhubung ke perangkat OLT untuk mengambil info PON.';
  }
};

/**
 * Get offline device information
 * @param {number} ponPort Optional port to filter
 * @returns {Promise<string>} Formatted offline device info
 */
const getOfflineDeviceInfo = async (ponPort = null) => {
  try {
    let offlineResp;
    let onuData = [];
    
    if (oltType && oltType.toUpperCase() === 'GPON') {
      // For GPON use /ontinfo_table
      offlineResp = await apiGet('/ontinfo_table');
      
      if (offlineResp.data && offlineResp.data.data) {
        onuData = offlineResp.data.data;
        
        // Filter by port if needed
        if (ponPort !== null) {
          const portNumber = parseInt(ponPort, 10);
          onuData = onuData.filter(onu => {
            const onuPortId = parseInt(onu.port_id, 10);
            return onuPortId === portNumber;
          });
        }
        
        // Filter ONU by rstate
        const offlineONUs = onuData.filter(onu => onu.rstate === 2);
        const initialONUs = onuData.filter(onu => onu.rstate === 0);
        
        if (offlineONUs.length > 0 || initialONUs.length > 0) {
          let result = '\nDevice Offline\n';
          
          // Show offline ONUs
          for (const onu of offlineONUs) {
            const onuName = onu.ont_name || 'Unknown';
            result += `${onu.ont_sn || 'Unknown'} - ${onuName}\n`;
          }
          
          // Show initial ONUs
          for (const onu of initialONUs) {
            const onuName = onu.ont_name || 'Unknown';
            result += `${onu.ont_sn || 'Unknown'} - ${onuName}\n`;
          }
          
          return result;
        } else if (ponPort !== null) {
          return `\nTidak ada device offline di PON port ${ponPort}.\n`;
        }
      }
    } else {
      // For EPON use /onutable
      offlineResp = await apiGet('/onutable');
      
      if (offlineResp.data && offlineResp.data.data) {
        onuData = offlineResp.data.data;
        
        // Filter by port if needed
        if (ponPort !== null) {
          const portNumber = parseInt(ponPort, 10);
          onuData = onuData.filter(onu => {
            const onuPortId = parseInt(onu.port_id, 10);
            return onuPortId === portNumber;
          });
        }
        
        // Filter ONUs that are offline
        const offlineONUs = onuData.filter(onu => {
          const status = (onu.status || '').toLowerCase();
          return status && status !== 'online' && status !== 'up' && status !== 'registered';
        });
        
        if (offlineONUs.length > 0) {
          let result = '\nDevice Offline\n';
          
          for (const onu of offlineONUs) {
            const onuName = onu.onu_name || 'Unknown';
            result += `${onu.macaddr || 'Unknown'} - ${onuName}\n`;
          }
          
          return result;
        } else if (ponPort !== null) {
          return `\nTidak ada device offline di PON port ${ponPort}.\n`;
        }
      }
    }
    
    return '';
  } catch (error) {
    console.error(`[System Service] Error getting offline device info:`, error.message);
    return '\nTidak dapat mengambil informasi device offline.\n';
  }
};

/**
 * Detect OLT type from system info
 * @param {Object} info System info object
 * @returns {string} Detected OLT type
 */
const detectOltType = (info) => {
  // Try to determine type from device model or other fields
  const model = (info.product_name || info.device_model || '').toLowerCase();
  const vendor = (info.vendor || '').toLowerCase();
  
  if (model.includes('epon') || vendor.includes('epon')) {
    return 'EPON';
  } else if (model.includes('gpon') || vendor.includes('gpon')) {
    return 'GPON';
  } else if (model.includes('olt')) {
    // Check software version for clues
    const swVersion = (info.sys_ver || info.software_version || '').toLowerCase();
    if (swVersion.includes('epon')) {
      return 'EPON';
    } else if (swVersion.includes('gpon')) {
      return 'GPON';
    }
  }
  
  // If device_type exists, use that
  if (info.device_type) {
    const deviceType = info.device_type.toString().toLowerCase();
    if (deviceType === '1' || deviceType === 'epon' || deviceType.includes('epon')) {
      return 'EPON';
    } else if (deviceType === '2' || deviceType === 'gpon' || deviceType.includes('gpon')) {
      return 'GPON';
    }
  }
  
  return 'Unknown';
};

/**
 * Format uptime value into readable text
 * @param {number} uptime Uptime value in seconds
 * @returns {string} Formatted uptime text
 */
const formatUptime = (uptime) => {
  if (!uptime) {
    return 'Unknown';
  }
  
  // Handle string format like "3 days, 14:25:36"
  if (typeof uptime === 'string') {
    console.log('[System Service] Formatting string uptime:', uptime);
    
    // Handle comma-separated format like "1,12,31,47" (days,hours,minutes,seconds)
    if (uptime.includes(',')) {
      console.log('[System Service] Detected comma-separated format');
      const parts = uptime.split(',');
      
      // Check if we likely have days,hours,minutes,seconds format
      if (parts.length === 4) {
        const days = parseInt(parts[0], 10);
        const hours = parseInt(parts[1], 10);
        const minutes = parseInt(parts[2], 10);
        const seconds = parseInt(parts[3], 10);
        
        if (!isNaN(days) && !isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
          console.log('[System Service] Parsed as days,hours,minutes,seconds:', days, hours, minutes, seconds);
          let result = '';
          if (days > 0) result += `${days} days `;
          if (hours > 0) result += `${hours} hours `;
          if (minutes > 0) result += `${minutes} minutes `;
          result += `${seconds} seconds`;
          return result;
        }
      }
    }
    
    // If it's already formatted, just return it
    if (uptime.includes('day') || uptime.includes('hour') || 
        uptime.includes('minute') || uptime.includes('second')) {
      return uptime;
    }
    
    // Try to parse time format like "14:25:36"
    const timeParts = uptime.split(':');
    if (timeParts.length === 3) {
      const hours = parseInt(timeParts[0], 10);
      const minutes = parseInt(timeParts[1], 10);
      const seconds = parseInt(timeParts[2], 10);
      
      let result = '';
      if (hours > 0) result += `${hours} hours `;
      if (minutes > 0) result += `${minutes} minutes `;
      result += `${seconds} seconds`;
      return result;
    }
    
    // Try to convert string to number
    if (!isNaN(uptime)) {
      uptime = parseFloat(uptime);
    } else {
      return uptime; // Return as is if we can't parse it
    }
  }
  
  // Handle numeric format (seconds)
  if (typeof uptime === 'number' && !isNaN(uptime)) {
    const seconds = Math.floor(uptime);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    let result = '';
    if (days > 0) result += `${days} days `;
    if (hours > 0) result += `${hours} hours `;
    if (minutes > 0) result += `${minutes} minutes `;
    result += `${remainingSeconds} seconds`;
    
    return result;
  }
  
  // If we couldn't handle the format, return as is
  return String(uptime);
};

/**
 * Save OLT system configuration
 * @returns {Promise<string>} Result message
 */
const saveConfiguration = async () => {
  console.log('[System Service] Saving OLT configuration');
  
  try {
    // Both EPON and GPON use the same endpoint
    const endpoint = '/system_save';
    
    const response = await apiGet(endpoint);
    
    if (response.data && 
        (response.data.message === 'Success' || 
         response.data.message === 'success' || 
         response.data.code === 1 ||
         response.data.status === 'success')) {
      return 'Konfigurasi berhasil disimpan.';
    } else {
      return `Gagal menyimpan konfigurasi. Pesan: ${response.data?.message || 'Unknown error'}`;
    }
  } catch (error) {
    console.error(`[System Service] Error saving configuration:`, error.message);
    throw new Error('Tidak dapat menyimpan konfigurasi: ' + error.message);
  }
};

module.exports = {
  getOltSystemInfo,
  getPonStatus,
  saveConfiguration
};