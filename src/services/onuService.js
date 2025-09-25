/**
 * ONU (Optical Network Unit) related API services
 */
const { apiGet, apiPost, oltType } = require('../utils/api');
const { saveConfiguration } = require('./systemService');

/**
 * Get ONU table data
 * @returns {Promise<Array>} Array of ONU data
 */
const getOnuTable = async () => {
  console.log('[ONU Service] Getting ONU table data');
  let endpoint;
  
  if (oltType && oltType.toUpperCase() === 'EPON') {
    endpoint = '/onutable';
  } else if (oltType && oltType.toUpperCase() === 'GPON') {
    endpoint = '/gponmgmt?form=optical_onu';
  } else {
    endpoint = '/onutable'; // Default
  }
  
  try {
    const result = await apiGet(endpoint);
    
    if (result.data && result.data.data) {
      console.log(`[ONU Service] Retrieved ${result.data.data.length} ONUs`);
      return result.data.data;
    }
    
    return [];
  } catch (error) {
    console.error('[ONU Service] Error getting ONU table:', error.message);
    throw new Error('Tidak dapat mengambil data tabel ONU: ' + error.message);
  }
};

/**
 * Get offline ONU data
 * @returns {Promise<Array>} Array of offline ONU data
 */
const getOfflineOnus = async () => {
  if (oltType && oltType.toUpperCase() === 'GPON') {
    try {
      const result = await apiGet('/ontinfo_table');
      if (result.data && result.data.data) {
        return result.data.data;
      }
    } catch (error) {
      console.error('[ONU Service] Error getting offline ONUs:', error.message);
    }
  }
  return [];
};

/**
 * Get all ONUs, optionally filtered by port
 * @param {number} ponPort Optional PON port filter
 * @returns {Promise<Array>} Array of formatted ONU data
 */
const getAllOnus = async (ponPort = null) => {
  console.log(`[ONU Service] Getting all ONUs${ponPort ? ` for port ${ponPort}` : ''}`);
  let onuList = [];

  try {
    // Handle differently based on OLT type
    if (oltType && oltType.toUpperCase() === 'GPON') {
      onuList = await getGponOnus(ponPort);
    } else {
      onuList = await getEponOnus(ponPort);
    }

    // Ensure all ONUs have valid rstate values
    onuList = normalizeOnuStates(onuList);
    
    // Sort by name
    onuList.sort((a, b) => a.name.localeCompare(b.name));
    
    return onuList;
  } catch (error) {
    console.error(`[ONU Service] Error in getAllOnus:`, error.message);
    throw new Error('Tidak dapat mengambil daftar ONU: ' + error.message);
  }
};

/**
 * Get GPON ONUs with status
 * @param {number} ponPort Optional PON port filter
 * @returns {Promise<Array>} Formatted GPON ONU array
 */
const getGponOnus = async (ponPort = null) => {
  console.log(`[ONU Service] Getting GPON ONUs${ponPort ? ` for port ${ponPort}` : ''}`);
  let onuList = [];
  
  try {
    // Try to use auth endpoint first (prioritize this for GPON)
    if (ponPort !== null) {
      try {
        console.log(`[ONU Service] GPON: Trying auth endpoint for port ${ponPort}`);
        const authResult = await apiGet(`/gponont_mgmt?form=auth&port_id=${ponPort}`);
        
        if (authResult.data && authResult.data.data && Array.isArray(authResult.data.data)) {
          const authData = authResult.data.data;
          console.log(`[ONU Service] GPON: Got ${authData.length} ONUs from auth endpoint`);
          
          if (authData.length > 0) {
            onuList = formatGponOnus(authData);
            console.log(`[ONU Service] GPON: Successfully formatted ${onuList.length} ONUs from auth endpoint`);
            return onuList;
          }
        }
      } catch (error) {
        console.log(`[ONU Service] GPON: Auth endpoint failed, trying standard endpoint: ${error.message}`);
      }
    }
    
    // If auth endpoint fails or is not applicable, use standard endpoint
    const onuData = await getOnuTable();
    let filteredData = onuData;
    
    // Filter by port if specified
    if (ponPort !== null) {
      filteredData = onuData.filter(onu => {
        const onuPortId = parseInt(onu.port_id, 10);
        return onuPortId === parseInt(ponPort, 10);
      });
    }
    
    onuList = formatGponOnus(filteredData);
    
    // Try to enhance with offline ONU data
    try {
      const offlineData = await getOfflineOnus();
      if (offlineData && offlineData.length > 0) {
        let filteredOffline = offlineData;
        
        // Filter offline data by port if needed
        if (ponPort !== null) {
          filteredOffline = offlineData.filter(onu => {
            const onuPortId = parseInt(onu.port_id, 10);
            return onuPortId === parseInt(ponPort, 10);
          });
        }
        
        // Add offline ONUs that aren't already in the list
        const offlineOnus = formatGponOnus(filteredOffline);
        const existingSns = new Set(onuList.map(onu => onu.sn));
        
        for (const onu of offlineOnus) {
          if (!existingSns.has(onu.sn)) {
            onuList.push(onu);
          }
        }
      }
    } catch (error) {
      console.log(`[ONU Service] Error getting offline ONUs: ${error.message}`);
    }
  } catch (error) {
    console.error(`[ONU Service] Error getting GPON ONUs:`, error.message);
  }
  
  return onuList;
};

/**
 * Format GPON ONU data
 * @param {Array} onuData Raw ONU data from API
 * @returns {Array} Formatted ONU data
 */
const formatGponOnus = (onuData) => {
  return onuData.map(onu => {
    // Determine status and rstate
    let rstate;
    let status = '❓';
    
    // Use auth_state if available (from auth endpoint)
    if (onu.auth_state !== undefined) {
      const authState = parseInt(onu.auth_state, 10);
      if (authState === 1) {
        rstate = 1; // online
        status = '✅';
      } else if (authState === 0) {
        rstate = 0; // initial
        status = '⚠️';
      } else {
        rstate = 2; // offline
        status = '❌';
      }
    }
    // Fall back to rstate if available and auth_state is not
    else if (onu.rstate !== undefined) {
      rstate = parseInt(onu.rstate, 10);
      if (rstate === 0) {
        status = '⚠️'; // initial
      } else if (rstate === 1) {
        status = '✅'; // online
      } else if (rstate === 2) {
        status = '❌'; // offline
      } else {
        status = '❓'; // unknown
        rstate = 3;
      }
    } 
    // Last resort: try to determine from run_state
    else if (onu.run_state !== undefined) {
      const runState = onu.run_state.toLowerCase();
      if (runState === 'online' || runState === 'up') {
        rstate = 1;
        status = '✅';
      } else if (runState === 'offline' || runState === 'down') {
        rstate = 2;
        status = '❌';
      } else if (runState === 'initial') {
        rstate = 0;
        status = '⚠️';
      } else {
        rstate = 3;
        status = '❓';
      }
    } else {
      rstate = 3; // unknown
    }
    
    return {
      sn: onu.ont_sn || '-',
      name: onu.ont_name || '-',
      status: status,
      port: `${onu.port_id || '-'}/${onu.ont_id || '-'}`,
      rstate: rstate
    };
  });
};

/**
 * Get EPON ONUs with status
 * @param {number} ponPort Optional PON port filter
 * @returns {Promise<Array>} Formatted EPON ONU array
 */
const getEponOnus = async (ponPort = null) => {
  console.log(`[ONU Service] Getting EPON ONUs${ponPort ? ` for port ${ponPort}` : ''}`);
  let onuList = [];
  
  try {
    const onuData = await getOnuTable();
    let filteredData = onuData;
    
    // Filter by port if specified
    if (ponPort !== null) {
      const ponPortNumber = parseInt(ponPort, 10);
      
      filteredData = onuData.filter(onu => {
        const onuPortId = parseInt(onu.port_id, 10);
        return onuPortId === ponPortNumber;
      });
    }
    
    onuList = formatEponOnus(filteredData);
  } catch (error) {
    console.error(`[ONU Service] Error getting EPON ONUs:`, error.message);
  }
  
  return onuList;
};

/**
 * Format EPON ONU data
 * @param {Array} onuData Raw ONU data from API
 * @returns {Array} Formatted ONU data
 */
const formatEponOnus = (onuData) => {
  return onuData.map(onu => {
    // For EPON devices, check the status directly
    let status = '❓';
    let rstate = 3; // default unknown
    
    // Check for status in lowercase if it exists
    const statusText = (onu.status || '').toLowerCase();
    if (statusText === 'online' || statusText === 'up' || statusText === 'registered') {
      status = '✅'; // online
      rstate = 1;
    } else if (statusText === 'offline' || statusText === 'down') {
      status = '❌'; // offline
      rstate = 2;
    } else if (statusText === 'initial') {
      status = '⚠️'; // initial
      rstate = 0;
    }
    
    return {
      sn: onu.macaddr || onu.sn || '-', // EPON uses MAC address instead of SN
      name: onu.onu_name || onu.ont_name || '-',
      status: status,
      port: `${onu.port_id || '-'}/${onu.onu_id || '-'}`,
      rstate: rstate
    };
  });
};

/**
 * Ensure all ONUs have valid rstate values
 * @param {Array} onuList ONU list to normalize
 * @returns {Array} Normalized ONU list
 */
const normalizeOnuStates = (onuList) => {
  return onuList.map(onu => {
    // If rstate is undefined or not a number, try to determine from status emoji
    if (onu.rstate === undefined || isNaN(Number(onu.rstate))) {
      if (onu.status === '✅') {
        onu.rstate = 1; // online
      } else if (onu.status === '❌') {
        onu.rstate = 2; // offline
      } else if (onu.status === '⚠️') {
        onu.rstate = 0; // initial
      } else {
        onu.rstate = 3; // unknown
      }
    } else {
      // Ensure rstate is stored as a number
      onu.rstate = Number(onu.rstate);
    }
    return onu;
  });
};

/**
 * Get detailed info about a specific ONU
 * @param {string} onuName ONU identifier (SN, MAC, or name)
 * @returns {Promise<string>} Formatted ONU detail text
 */
const getOnuDetail = async (onuName) => {
  console.log(`[ONU Service] Getting details for ONU: ${onuName}`);
  try {
    // Get all ONUs first
    const onuTables = await getOnuTable();
    let finding;
    
    // Search strategy differs by OLT type
    if (oltType && oltType.toUpperCase() === 'GPON') {
      finding = onuTables.find((val) => 
        (val.ont_sn && val.ont_sn.toLowerCase() === onuName.toLowerCase()) || 
        (val.ont_name && val.ont_name.toLowerCase() === onuName.toLowerCase())
      );
      
      // If not found, try searching offline ONUs
      if (!finding) {
        try {
          const offlineData = await getOfflineOnus();
          finding = offlineData.find((val) => 
            (val.ont_sn && val.ont_sn.toLowerCase() === onuName.toLowerCase()) || 
            (val.ont_name && val.ont_name.toLowerCase() === onuName.toLowerCase())
          );
          
          // Mark that this is from offline table
          if (finding) {
            finding._fromOfflineTable = true;
          }
        } catch (e) {
          console.error('Failed to search in ontinfo_table:', e.message);
        }
      }
      
      // If we found a GPON ONU, fetch additional detailed info
      if (finding && !finding._fromOfflineTable) {
        try {
          // Try to get base info
          console.log(`[ONU Service] GPON: Getting base info for ONU port/ID: ${finding.port_id}/${finding.ont_id}`);
          const baseInfoResponse = await apiGet(`/gponont_mgmt?form=base&port_id=${finding.port_id}&ont_id=${finding.ont_id}`);
          
          if (baseInfoResponse.data && baseInfoResponse.data.data) {
            // Merge the base info with the basic info
            finding = { ...finding, ...baseInfoResponse.data.data };
            console.log(`[ONU Service] GPON: Successfully fetched base info for ONU`);
          }
          
          // Try to get optical info
          console.log(`[ONU Service] GPON: Getting optical info for ONU port/ID: ${finding.port_id}/${finding.ont_id}`);
          const opticalInfoResponse = await apiGet(`/gponont_mgmt?form=ont_optical&port_id=${finding.port_id}&ont_id=${finding.ont_id}`);
          
          if (opticalInfoResponse.data && opticalInfoResponse.data.data) {
            // Merge the optical info with the existing info
            finding = { ...finding, ...opticalInfoResponse.data.data };
            console.log(`[ONU Service] GPON: Successfully fetched optical info for ONU`);
          }
          
          // Try to get version info
          console.log(`[ONU Service] GPON: Getting version info for ONU port/ID: ${finding.port_id}/${finding.ont_id}`);
          const versionInfoResponse = await apiGet(`/gponont_mgmt?form=ont_version&port_id=${finding.port_id}&ont_id=${finding.ont_id}`);
          
          if (versionInfoResponse.data && versionInfoResponse.data.data) {
            // Merge the version info with the existing info
            finding = { ...finding, ...versionInfoResponse.data.data };
            console.log(`[ONU Service] GPON: Successfully fetched version info for ONU`);
          }
        } catch (e) {
          console.error(`[ONU Service] Error getting GPON ONU detailed info:`, e.message);
        }
      }
    } else {
      // EPON search by MAC address or name
      finding = onuTables.find((val) => 
        (val.macaddr && val.macaddr.toLowerCase() === onuName.toLowerCase()) || 
        (val.onu_name && val.onu_name.toLowerCase() === onuName.toLowerCase())
      );
      
      // If we found an EPON ONU, fetch detailed info from base-info endpoint
      if (finding) {
        try {
          console.log(`[ONU Service] EPON: Getting detailed base info for ONU port/ID: ${finding.port_id}/${finding.onu_id}`);
          const baseInfoResponse = await apiGet(`/onumgmt?form=base-info&port_id=${finding.port_id}&onu_id=${finding.onu_id}`);
          
          if (baseInfoResponse.data && baseInfoResponse.data.data) {
            // Merge the detailed info with the basic info
            finding = { ...finding, ...baseInfoResponse.data.data };
            console.log(`[ONU Service] EPON: Successfully fetched base info for ONU`);
          }
          
          // Also try to get optical diagnostic info
          console.log(`[ONU Service] EPON: Getting optical diagnose info for ONU port/ID: ${finding.port_id}/${finding.onu_id}`);
          const opticalDiagnoseResponse = await apiGet(`/onumgmt?form=optical-diagnose&port_id=${finding.port_id}&onu_id=${finding.onu_id}`);
          
          if (opticalDiagnoseResponse.data && opticalDiagnoseResponse.data.data) {
            // Merge the optical diagnose info with the existing info
            finding = { ...finding, ...opticalDiagnoseResponse.data.data };
            console.log(`[ONU Service] EPON: Successfully fetched optical diagnose info for ONU`);
          }
        } catch (e) {
          console.error(`[ONU Service] Error getting EPON ONU detailed info:`, e.message);
        }
        
        // Also fetch optical diagnose data for more detailed power readings
        try {
          console.log(`[ONU Service] EPON: Getting optical diagnose info for ONU port/ID: ${finding.port_id}/${finding.onu_id}`);
          const opticalResponse = await apiGet(`/onumgmt?form=optical-diagnose&port_id=${finding.port_id}&onu_id=${finding.onu_id}`);
          
          if (opticalResponse.data && opticalResponse.data.data) {
            // Merge the optical info with the current info
            finding = { ...finding, ...opticalResponse.data.data };
            console.log(`[ONU Service] EPON: Successfully fetched optical diagnose info for ONU`);
          }
        } catch (e) {
          console.error(`[ONU Service] Error getting EPON ONU optical diagnose info:`, e.message);
        }
      }
    }
    
    if (finding) {
      return formatOnuDetailText(finding);
    } else {
      return `Maaf, ONU "${onuName}" tidak ditemukan.\n` +
             `Gunakan ${oltType && oltType.toUpperCase() === 'GPON' ? 'Serial Number (SN)' : 'MAC Address'} atau nama ONU untuk pencarian.`;
    }
  } catch (error) {
    console.error(`[ONU Service] Error in getOnuDetail:`, error.message);
    throw new Error('Tidak dapat mengambil detail ONU: ' + error.message);
  }
};

/**
 * Format ONU detail information as text
 * @param {Object} onu ONU data object
 * @returns {string} Formatted text with ONU details
 */
const formatOnuDetailText = (onu) => {
  // GPON vs EPON handling
  if (oltType && oltType.toUpperCase() === 'GPON') {
    // Handle offline ONU from ontinfo_table
    if (onu._fromOfflineTable) {
      // Status based on rstate
      let statusText = 'Unknown';
      if (onu.rstate === 0) {
        statusText = 'Initial';
      } else if (onu.rstate === 1) {
        statusText = 'Online';
      } else if (onu.rstate === 2) {
        statusText = 'Offline';
      }
      
      // Format text
      let gponDetail = `ONU Name : ${onu.ont_name || '-'}\n`;
      gponDetail += `Description : ${onu.ont_description || '-'}\n`;
      gponDetail += `SN : ${onu.ont_sn || '-'}\n`;
      gponDetail += `ONU Status : ${statusText}\n`;
      gponDetail += `ONU RX Power : ${onu.receive_power || '-'} dBm\n`;
      gponDetail += `Start Time : ${onu.last_u_time || '-'}\n`;
      gponDetail += `Down Time : ${onu.last_d_time || '-'}\n`;
      gponDetail += `Down Cause : ${onu.last_d_cause || '-'}\n`;
      gponDetail += `\nCatatan: Data dari offline table (device tidak aktif)\n`;
      
      return gponDetail;
    } else {
      // Process online GPON ONU
      // [GPON ONU detail formatting implementation]
      // This would be an implementation similar to the existing code but simplified
      return formatGponOnuDetail(onu);
    }
  } else {
    // Process EPON ONU
    // [EPON ONU detail formatting implementation]
    // This would be an implementation similar to the existing code but simplified
    return formatEponOnuDetail(onu);
  }
};

/**
 * Format GPON ONU detail information as text
 * @param {Object} onu ONU data object
 * @returns {string} Formatted text with ONU details
 */
const formatGponOnuDetail = (onu) => {
  try {
    // Get status text
    const statusText = getStatusText(onu.rstate);
    
    // Format version/model info
    let modelText = onu.equipmentid || '-';
    // Add version info if available
    if (onu.ont_version) {
      modelText += ` (Version ID : ${onu.ont_version})`;
    }
    
    // Build the output in the requested format
    let detail = ``;
    detail += `ONT Name : ${onu.ont_name || '-'}\n`;
    detail += `Description : ${onu.ont_description || '-' || 'No-description'}\n`;
    detail += `Tipe ONU : ${modelText}\n`;
    detail += `SN : ${onu.ont_sn || '-'}\n`;
    detail += `ONU Status : ${statusText}\n`;
    detail += `Profil : ${onu.lineprof_name || '-'}\n`;
    detail += `Port : ${onu.port_id || '-'}/${onu.ont_id || '-'}\n`;
    
    // Add temperature if available
    if (onu.work_temperature !== undefined || onu.temperature !== undefined) {
      detail += `ONU Temperature : ${onu.work_temperature || onu.temperature || '-'}\n`;
    }
    
    // Add voltage if available
    if (onu.work_voltage !== undefined) {
      detail += `ONU Voltage : ${onu.work_voltage || '-'}\n`;
    }
    
    // Add TX power if available
    if (onu.transmit_power !== undefined || onu.tx_power !== undefined) {
      detail += `ONU Tx Power : ${onu.transmit_power || onu.tx_power || '-'}\n`;
    }
    
    // Add RX power 
    let rxPower = '-';
    if (onu.receive_power !== undefined) {
      rxPower = onu.receive_power;
    } else if (onu.rx_power !== undefined) {
      rxPower = onu.rx_power;
    }
    detail += `ONU RX Power : ${rxPower}\n`;
    
    // Add timing information
    if (onu.last_u_time) {
      detail += `Start Time : ${onu.last_u_time || '-'}\n`;
    }
    if (onu.last_d_time && onu.last_d_time !== '-') {
      detail += `Down Time : ${onu.last_d_time || '-'}\n`;
    } else {
      detail += `Down Time : -\n`;
    }
    if (onu.last_d_cause && onu.last_d_cause !== '-') {
      detail += `Down Cause : ${onu.last_d_cause || '-'}\n`;
    } else {
      detail += `Down Cause : -\n`;
    }
    
    // Add uptime if available
    if (onu.uptime) {
      detail += `Uptime : ${formatUptimeGpon(onu.uptime)}\n`;
    } else if (onu.running_time) {
      detail += `Uptime : ${formatUptimeGpon(onu.running_time)}\n`;
    } else {
      // Calculate uptime from last_u_time if available
      if (onu.last_u_time && onu.last_u_time !== '-') {
        try {
          const startTime = new Date(onu.last_u_time.replace(/(\d+)\/(\d+)\/(\d+)/, '$3/$2/$1'));
          const now = new Date();
          const uptimeMs = now - startTime;
          const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const mins = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
          const secs = Math.floor((uptimeMs % (1000 * 60)) / 1000);
          detail += `Uptime : ${days} days ${hours} hours ${mins} mins ${secs} secs\n`;
        } catch (e) {
          detail += `Uptime : -\n`;
        }
      }
    }
    
    // Add signal quality conclusion
    detail += `\nKesimpulan : ${getSignalQuality(rxPower)}`;
    
    return detail;
  } catch (error) {
    console.error('[ONU Service] Error formatting GPON ONU detail:', error.message);
    return 'Error formatting ONU detail';
  }
};

/**
 * Format uptime value into readable text for GPON ONTs
 * @param {any} uptime Uptime value (could be string, number, or array)
 * @returns {string} Formatted uptime text
 */
const formatUptimeGpon = (uptime) => {
  if (!uptime) {
    return '-';
  }
  
  // Handle array format like [days, hours, minutes, seconds]
  if (Array.isArray(uptime)) {
    const days = parseInt(uptime[0], 10) || 0;
    const hours = parseInt(uptime[1], 10) || 0;
    const minutes = parseInt(uptime[2], 10) || 0;
    const seconds = parseInt(uptime[3], 10) || 0;
    
    return `${days} days ${hours} hours ${minutes} mins ${seconds} secs`;
  }
  
  // Handle string format like "3 days, 14:25:36"
  if (typeof uptime === 'string') {
    // Handle comma-separated format like "1,12,31,47" (days,hours,minutes,seconds)
    if (uptime.includes(',')) {
      const parts = uptime.split(',');
      
      // Check if we likely have days,hours,minutes,seconds format
      if (parts.length === 4) {
        const days = parseInt(parts[0], 10) || 0;
        const hours = parseInt(parts[1], 10) || 0;
        const minutes = parseInt(parts[2], 10) || 0;
        const seconds = parseInt(parts[3], 10) || 0;
        
        if (!isNaN(days) && !isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
          return `${days} days ${hours} hours ${minutes} mins ${seconds} secs`;
        }
      }
    }
    
    // If it's already formatted, just return it
    if (uptime.includes('day') || uptime.includes('hour') || 
        uptime.includes('minute') || uptime.includes('second')) {
      return uptime.replace('minutes', 'mins').replace('seconds', 'secs');
    }
    
    // Try to parse time format like "14:25:36"
    const timeParts = uptime.split(':');
    if (timeParts.length === 3) {
      const hours = parseInt(timeParts[0], 10) || 0;
      const minutes = parseInt(timeParts[1], 10) || 0;
      const seconds = parseInt(timeParts[2], 10) || 0;
      
      return `0 days ${hours} hours ${minutes} mins ${seconds} secs`;
    }
    
    // Try to convert string to number (seconds)
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
    
    return `${days} days ${hours} hours ${minutes} mins ${remainingSeconds} secs`;
  }
  
  // If we couldn't handle the format, return as is
  return String(uptime);
}

/**
 * Format EPON ONU detail information as text
 * @param {Object} onu ONU data object
 * @returns {string} Formatted text with ONU details
 */
const formatEponOnuDetail = (onu) => {
  try {
    // Get status text
    const statusText = getStatusText(onu.status || onu.auth_state || onu.rstate);
    
    // Format version/model info
    let modelText = onu.extmodel || onu.sn_model || onu.model || onu.model_id || '-';
    
    // Add vendor if available
    if (onu.vendor) {
      modelText = `${onu.vendor} ${modelText}`;
    }
    
    // Add version info if available
    if (onu.software_ver || onu.fw_ver || onu.version || onu.soft_version || onu.software_version) {
      modelText += ` (Version ID : ${onu.software_ver || onu.fw_ver || onu.version || onu.soft_version || onu.software_version})`;
    }
    
    // Add hardware version if available
    if (onu.hardware_ver) {
      modelText += ` HW: ${onu.hardware_ver}`;
    }
    
    // Build the output in the requested format
    let detail = ``;
    detail += `ONU Name : ${onu.onu_name || '-'}\n`;
    detail += `Description : ${onu.onu_desc || onu.description || '-' || 'No-description'}\n`;
    detail += `Tipe ONU : ${modelText}\n`;
    detail += `Mac : ${onu.macaddr || onu.mac || '-'}\n`;
    detail += `Status : ${statusText}\n`;
    detail += `Port ID : ${onu.port_id || '-'}/${onu.onu_id || '-'}\n`;
    detail += `Distance : ${onu.distance || onu.onu_distance || '-'} M\n`;
    
    // Add temperature if available - prioritize optical-diagnose data
    if (onu.work_temprature !== undefined) {
      detail += `ONU Temperature : ${onu.work_temprature.trim() || '-'}\n`;
    } else if (onu.temperature !== undefined || onu.onu_temperature !== undefined) {
      detail += `ONU Temperature : ${onu.temperature || onu.onu_temperature || '-'} °C\n`;
    }
    
    // Add voltage if available - prioritize optical-diagnose data
    if (onu.work_voltage !== undefined) {
      detail += `ONU Voltage : ${onu.work_voltage.trim() || '-'}\n`;
    } else if (onu.voltage !== undefined || onu.onu_voltage !== undefined) {
      detail += `ONU Voltage : ${onu.voltage || onu.onu_voltage || '-'} V\n`;
    }
    
    // Add transmit bias current if available (from optical-diagnose)
    if (onu.transmit_bias !== undefined) {
      detail += `Transmit Bias : ${onu.transmit_bias.trim() || '-'}\n`;
    }
    
    // Add TX power if available - prioritize optical-diagnose data
    if (onu.transmit_power !== undefined) {
      detail += `ONU Tx Power : ${onu.transmit_power.trim() || '-'}\n`;
    } else if (onu.tx_power !== undefined || onu.tx_optical_power !== undefined) {
      const txPower = onu.tx_power || onu.tx_optical_power || '-';
      detail += `ONU Tx Power : ${txPower} dBm\n`;
    }
    
    // Add RX power and determine signal quality - prioritize optical-diagnose data
    let rxPower = '-';
    if (onu.receive_power !== undefined) {
      rxPower = onu.receive_power.trim();
    } else if (onu.rx_optical_power !== undefined) {
      rxPower = onu.rx_optical_power;
    } else if (onu.rx_power !== undefined) {
      rxPower = onu.rx_power;
    }
    detail += `ONU RX Power : ${rxPower} dBm\n`;
    
    // Add timing information
    if (onu.start_time || onu.last_up_time || onu.last_u_time) {
      detail += `Start Time : ${onu.start_time || onu.last_up_time || onu.last_u_time || '-'}\n`;
    }
    
    // Add down time information with fallback to "-"
    if (onu.down_time && onu.down_time !== '-' || onu.last_down_time && onu.last_down_time !== '-' || onu.last_d_time && onu.last_d_time !== '-') {
      detail += `Down Time : ${onu.down_time || onu.last_down_time || onu.last_d_time || '-'}\n`;
    } else {
      detail += `Down Time : -\n`;
    }
    
    // Add down cause information with fallback to "-"
    if (onu.down_cause && onu.down_cause !== '-' || onu.last_down_cause && onu.last_down_cause !== '-' || onu.last_d_cause && onu.last_d_cause !== '-') {
      detail += `Down Cause : ${onu.down_cause || onu.last_down_cause || onu.last_d_cause || '-'}\n`;
    } else {
      detail += `Down Cause : -\n`;
    }
    
    // Add device capability information if available (from base-info endpoint)
    let deviceInfo = [];
    
    if (onu.dev_type) {
      deviceInfo.push(`Type: ${onu.dev_type}`);
    }
    
    if (onu.geports > 0) {
      deviceInfo.push(`Ports: ${onu.geports}`);
    }
    
    if (onu.voip > 0) {
      deviceInfo.push(`VoIP: ${onu.voip}`);
    }
    
    if (onu.wlan > 0) {
      deviceInfo.push(`WLAN: ${onu.wlan === 1 ? 'Yes' : 'No'}`);
    }
    
    if (onu.usb > 0) {
      deviceInfo.push(`USB: ${onu.usb === 1 ? 'Yes' : 'No'}`);
    }
    
    if (deviceInfo.length > 0) {
      detail += `Device Info : ${deviceInfo.join(', ')}\n`;
    }
    
    // Add uptime if available
    if (onu.uptime || onu.running_time) {
      detail += `Uptime : ${formatUptimeGpon(onu.uptime || onu.running_time)}\n`;
    } else if (onu.online_time) {
      detail += `Uptime : ${formatUptimeGpon(onu.online_time)}\n`;
    } else if (onu.last_up_time || onu.last_u_time || onu.start_time) {
      // Calculate uptime from start_time if available
      try {
        const timeString = onu.last_up_time || onu.last_u_time || onu.start_time;
        if (timeString && timeString !== '-') {
          // Handle various date formats
          let startTime;
          if (timeString.includes('/')) {
            startTime = new Date(timeString.replace(/(\d+)\/(\d+)\/(\d+)/, '$3/$2/$1'));
          } else {
            startTime = new Date(timeString);
          }
          
          const now = new Date();
          const uptimeMs = now - startTime;
          const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const mins = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
          const secs = Math.floor((uptimeMs % (1000 * 60)) / 1000);
          detail += `Uptime : ${days} days ${hours} hours ${mins} mins ${secs} secs\n`;
        } else {
          detail += `Uptime : -\n`;
        }
      } catch (e) {
        detail += `Uptime : -\n`;
      }
    }
    
    // Add signal quality conclusion
    detail += `\nKesimpulan : ${getSignalQuality(rxPower)}`;
    
    return detail;
  } catch (error) {
    console.error('[ONU Service] Error formatting EPON ONU detail:', error.message);
    return 'Error formatting ONU detail';
  }
};

/**
 * Get text representation of ONU status based on rstate
 * @param {number|string} rstate ONU state value or status string
 * @returns {string} Status text
 */
const getStatusText = (rstate) => {
  // Handle direct status string first
  if (typeof rstate === 'string') {
    const status = rstate.toLowerCase();
    if (status === 'online' || status === 'up' || status === 'true') return 'Online';
    if (status === 'offline' || status === 'down' || status === 'false') return 'Offline';
    if (status === 'initial') return 'Initial';
    // Return the original status if it doesn't match any of our expected values
    return rstate;
  }
  
  // Handle numeric status codes
  if (rstate === 0) return 'Initial';
  if (rstate === 1) return 'Online';
  if (rstate === 2) return 'Offline';
  return 'Unknown';
};

/**
 * Determine signal quality based on RX power level
 * @param {string|number} rxPower RX power in dBm
 * @returns {string} Signal quality assessment
 */
const getSignalQuality = (rxPower) => {
  if (rxPower === '-' || rxPower === undefined) {
    return 'Tidak dapat menentukan kualitas sinyal';
  }
  
  // Convert to number if it's a string
  const power = typeof rxPower === 'string' ? parseFloat(rxPower) : rxPower;
  
  // Check if conversion failed
  if (isNaN(power)) {
    return 'Tidak dapat menentukan kualitas sinyal';
  }
  
  // Evaluate signal quality based on power level
  if (power >= -10) {
    return 'Hasil pengukuran SANGAT BAIK';
  } else if (power >= -17) {
    return 'Hasil pengukuran BAIK';
  } else if (power >= -20) {
    return 'Hasil pengukuran CUKUP';
  } else if (power >= -24) {
    return 'Hasil pengukuran KURANG BAIK';
  } else if (power >= -27) {
    return 'Hasil pengukuran BURUK';
  } else {
    return 'Hasil pengukuran Sangat BURUK';
  }
};

/**
 * Reboot an ONU
 * @param {string} onuName ONU identifier (SN, MAC, or name)
 * @returns {Promise<string>} Result message
 */
const rebootOnu = async (onuName) => {
  console.log(`[ONU Service] Initiating reboot for ONU: ${onuName}`);
  
  try {
    const searchTerm = onuName.trim().toLowerCase();
    let finding;
    
    if (oltType && oltType.toUpperCase() === 'GPON') {
      // GPON reboot process
      // Step 1: Find ONU in regular table
      const onuTables = await getOnuTable();
      let finding = onuTables.find((val) => 
        (val.ont_sn && val.ont_sn.toLowerCase() === searchTerm) || 
        (val.ont_name && val.ont_name.toLowerCase() === searchTerm)
      );
      
      // Step 2: Always get the identifier from ontinfo_table
      const offlineData = await getOfflineOnus();
      const offlineOnu = offlineData.find((val) => 
        (val.ont_sn && val.ont_sn.toLowerCase() === searchTerm) || 
        (val.ont_name && val.ont_name.toLowerCase() === searchTerm)
      );
      
      // If ONU not found in either table
      if (!finding && !offlineOnu) {
        return `Maaf, ONU "${onuName}" tidak ditemukan.\nGunakan Serial Number atau nama ONU untuk pencarian.`;
      }
      
      // Prioritize using finding from regular table for ONU details,
      // but get the identifier from offline table
      if (!finding) finding = offlineOnu;
      
      // Get identifier exclusively from ontinfo_table
      const identifier = offlineOnu ? offlineOnu.identifier : null;
      
      if (!identifier) {
        console.log(`[ONU Service] Warning: No identifier found in ontinfo_table for ${onuName}`);
      }
      
      console.log(`[ONU Service] GPON: Performing reboot for ONU identifier: ${identifier}`);
      
      const rebootResponse = await apiPost('/gponont_mgmt?form=info', {
        method: "set",
        param: {
          identifier: parseInt(identifier),
          flags: 4,
          ont_name: "",
          ont_description: ""
        }
      });
      
      if (rebootResponse.data && (
        rebootResponse.data.message === 'Success' || 
        rebootResponse.data.message === 'success' || 
        rebootResponse.data.code === 1)) {
        return `✅ Perintah reboot berhasil dikirim ke ONU ${finding.ont_name}\n` +
               `Serial Number: ${finding.ont_sn || '-'}\n` +
               `ONU akan reboot dalam beberapa saat.`;
      } else {
        return `❌ Gagal melakukan reboot ONU ${finding.ont_name}.\n` +
               `Pesan: ${rebootResponse.data?.message || 'Unknown error'}`;
      }
    } else {
      // EPON reboot process
      const onuTables = await getOnuTable();
      finding = onuTables.find((val) => 
        (val.macaddr && val.macaddr.toLowerCase() === searchTerm) || 
        (val.onu_name && val.onu_name.toLowerCase() === searchTerm)
      );
      
      if (!finding) {
        return `Maaf, ONU "${onuName}" tidak ditemukan.\nGunakan MAC Address atau nama ONU untuk pencarian.`;
      }
      
      console.log(`[ONU Service] EPON: Performing reboot for ONU port/ID: ${finding.port_id}/${finding.onu_id}`);
      
      const rebootResponse = await apiPost('/onumgmt?form=config', {
        method: "set",
        param: {
          port_id: finding.port_id,
          onu_id: finding.onu_id,
          flags: 1,
          fec_mode: 1
        }
      });
      
      if (rebootResponse.data && (
        rebootResponse.data.message === 'Success' || 
        rebootResponse.data.message === 'success' || 
        rebootResponse.data.status === 'success' ||
        rebootResponse.data.code === 1)) {
        return `✅ Perintah reboot berhasil dikirim ke ONU ${finding.onu_name}\n` +
               `MAC Address: ${finding.macaddr || '-'}\n` +
               `ONU akan reboot dalam beberapa saat.`;
      } else {
        return `❌ Gagal melakukan reboot ONU ${finding.onu_name}.\n` +
               `Pesan: ${rebootResponse.data?.message || 'Unknown error'}`;
      }
    }
  } catch (error) {
    console.error(`[ONU Service] Error in rebootOnu:`, error.message);
    return `❌ Terjadi kesalahan saat reboot ONU: ${error.message}`;
  }
};

/**
 * Change ONU name
 * @param {string} onuName Current ONU identifier (SN, MAC, or name)
 * @param {string} newName New name for the ONU
 * @returns {Promise<string>} Result message
 */
const changeOnuName = async (onuName, newName) => {
  console.log(`[ONU Service] Changing name for ONU ${onuName} to ${newName}`);
  
  try {
    const searchTerm = onuName.trim().toLowerCase();
    let finding;
    
    if (oltType && oltType.toUpperCase() === 'GPON') {
      // GPON rename process
      // Step 1: Find ONU in regular table
      const onuTables = await getOnuTable();
      let finding = onuTables.find((val) => 
        (val.ont_sn && val.ont_sn.toLowerCase() === searchTerm) || 
        (val.ont_name && val.ont_name.toLowerCase() === searchTerm)
      );
      
      // Step 2: Always get the identifier from ontinfo_table
      const offlineData = await getOfflineOnus();
      const offlineOnu = offlineData.find((val) => 
        (val.ont_sn && val.ont_sn.toLowerCase() === searchTerm) || 
        (val.ont_name && val.ont_name.toLowerCase() === searchTerm)
      );
      
      // If ONU not found in either table
      if (!finding && !offlineOnu) {
        return `Maaf, ONU "${onuName}" tidak ditemukan.\nGunakan Serial Number atau nama ONU untuk pencarian.`;
      }
      
      // Prioritize using finding from regular table for ONU details,
      // but get the identifier from offline table
      if (!finding) finding = offlineOnu;
      
      // Get identifier exclusively from ontinfo_table
      const identifier = offlineOnu ? offlineOnu.identifier : null;
      
      if (!identifier) {
        console.log(`[ONU Service] Warning: No identifier found in ontinfo_table for ${onuName}`);
      }
      
      console.log(`[ONU Service] GPON: Changing name for ONU identifier: ${identifier}`);
      
      const renameResponse = await apiPost('/gponont_mgmt?form=info', {
        method: "set",
        param: {
          identifier: parseInt(identifier),
          flags: 8,
          ont_name: newName,
          ont_description: ""
        }
      });
      
      if (renameResponse.data && (
        renameResponse.data.message === 'Success' || 
        renameResponse.data.message === 'success' || 
        renameResponse.data.code === 1)) {
        // After successful name change, save the configuration
        try {
          const saveResult = await saveConfiguration();
          return `✅ Berhasil mengubah nama ONU dari "${finding.ont_name}" menjadi "${newName}"\n` +
                 `Serial Number: ${finding.ont_sn || '-'}\n\n` +
                 `${saveResult}`;
        } catch (saveError) {
          return `✅ Berhasil mengubah nama ONU dari "${finding.ont_name}" menjadi "${newName}"\n` +
                 `Serial Number: ${finding.ont_sn || '-'}\n\n` +
                 `⚠️ Peringatan: ${saveError.message}`;
        }
      } else {
        return `❌ Gagal mengubah nama ONU ${finding.ont_name}.\n` +
               `Pesan: ${renameResponse.data?.message || 'Unknown error'}`;
      }
    } else {
      // EPON rename process
      const onuTables = await getOnuTable();
      finding = onuTables.find((val) => 
        (val.macaddr && val.macaddr.toLowerCase() === searchTerm) || 
        (val.onu_name && val.onu_name.toLowerCase() === searchTerm)
      );
      
      if (!finding) {
        return `Maaf, ONU "${onuName}" tidak ditemukan.\nGunakan MAC Address atau nama ONU untuk pencarian.`;
      }
      
      console.log(`[ONU Service] EPON: Changing name for ONU port/ID: ${finding.port_id}/${finding.onu_id}`);
      
      const renameResponse = await apiPost('/onumgmt?form=config', {
        method: "set",
        param: {
          fec_mode: 1,
          flags: 8,
          port_id: finding.port_id,
          onu_id: finding.onu_id,
          onu_name: newName
        }
      });
      
      if (renameResponse.data && (
        renameResponse.data.message === 'Success' || 
        renameResponse.data.message === 'success' || 
        renameResponse.data.status === 'success' ||
        renameResponse.data.code === 1)) {
        // After successful name change, save the configuration
        try {
          const saveResult = await saveConfiguration();
          return `✅ Berhasil mengubah nama ONU dari "${finding.onu_name}" menjadi "${newName}"\n` +
                 `MAC Address: ${finding.macaddr || '-'}\n\n` +
                 `${saveResult}`;
        } catch (saveError) {
          return `✅ Berhasil mengubah nama ONU dari "${finding.onu_name}" menjadi "${newName}"\n` +
                 `MAC Address: ${finding.macaddr || '-'}\n\n` +
                 `⚠️ Peringatan: ${saveError.message}`;
        }
      } else {
        return `❌ Gagal mengubah nama ONU ${finding.onu_name}.\n` +
               `Pesan: ${renameResponse.data?.message || 'Unknown error'}`;
      }
    }
  } catch (error) {
    console.error(`[ONU Service] Error in changeOnuName:`, error.message);
    return `❌ Terjadi kesalahan saat mengubah nama ONU: ${error.message}`;
  }
};

module.exports = {
  getAllOnus,
  getOnuDetail,
  rebootOnu,
  changeOnuName
};