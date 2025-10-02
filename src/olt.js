const axios = require('axios');
const crypto = require('crypto');
const {
	message
} = require('telegraf/filters');

require('dotenv').config()

const olt = process.env.OLT_URL;
const typeOlt = process.env.OLT_TYPE;

if (!olt) {
	process.exit(1);
}

if (!typeOlt) {} else if (!['EPON', 'GPON'].includes(typeOlt.toUpperCase())) {

}

const userName = process.env.UNAME;
const userPwd = process.env.UPASS;

let key = crypto.createHash('md5').update(userName + ":" + userPwd).digest("hex");
let passwordValue = Buffer.from(userPwd, 'utf8').toString('base64');

var xToken = "";
var tokenExpiration = 0;


const getToken = async () => {
	console.log('[getToken] Attempting to get a new token');
	let resp;
	try {
		console.log('[getToken] Sending login request to:', olt + "/userlogin?form=login");
		resp = await axios({
			method: 'post',
			url: olt + "/userlogin?form=login",
			data: {
				method: "set",
				param: {
					name: userName,
					key: key,
					value: passwordValue,
					captcha_v: "",
					captcha_f: ""
				}
			}
		})
		console.log('[getToken] Login response status:', resp.status);
	} catch (e) {
		console.error('[getToken] Error during login request:', e.message);
		throw new Error(e.message)
	}

	const newToken = resp.headers["x-token"];
	if (newToken) {
		console.log('[getToken] New token obtained, first 10 chars:', newToken.substring(0, 10) + '...');
		xToken = newToken;
		tokenExpiration = Date.now() + (30 * 60 * 1000);
		console.log('[getToken] Token expiration set to:', new Date(tokenExpiration).toISOString());
	} else {
		console.warn('[getToken] No token found in response headers');
	}

	return newToken;
}

const ensureValidToken = async () => {
	console.log('[ensureValidToken] Checking token validity');
	if (!xToken) {
		console.log('[ensureValidToken] Token is empty, getting new token');
		await getToken();
	} else if (Date.now() > tokenExpiration) {
		console.log('[ensureValidToken] Token expired at', new Date(tokenExpiration).toISOString());
		console.log('[ensureValidToken] Current time is', new Date().toISOString());
		console.log('[ensureValidToken] Getting new token...');
		await getToken();
	} else {
		console.log('[ensureValidToken] Token is valid until', new Date(tokenExpiration).toISOString());
	}
	return xToken;
}

const handleTokenFailure = async (apiCall, maxRetries = 2) => {
	let lastError;
	console.log('[handleTokenFailure] Starting API call with retry mechanism, max retries:', maxRetries);

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		console.log(`[handleTokenFailure] Attempt ${attempt}/${maxRetries}`);
		try {
			console.log('[handleTokenFailure] Ensuring valid token');
			await ensureValidToken();

			console.log('[handleTokenFailure] Executing API call');
			const result = await apiCall();
			console.log('[handleTokenFailure] API call completed, status:', result?.status);

			if (result && result.data && result.data.message === 'Token Check Failed') {
				console.log('[handleTokenFailure] Received "Token Check Failed" message');
				if (attempt < maxRetries) {
					console.log(`[handleTokenFailure] Token check failed, attempt ${attempt}/${maxRetries}, refreshing token...`);
					xToken = "";
					tokenExpiration = 0;
					continue;
				} else {
					console.error('[handleTokenFailure] Token authentication failed after maximum retries');
					throw new Error('Token authentication failed after multiple retries');
				}
			}

			console.log('[handleTokenFailure] API call successful');
			return result;

		} catch (error) {
			lastError = error;
			console.error('[handleTokenFailure] Error in API call:', error.message);
			if (attempt < maxRetries) {
				console.log(`[handleTokenFailure] API call failed, attempt ${attempt}/${maxRetries}, retrying...`);
				xToken = "";
				tokenExpiration = 0;
				console.log('[handleTokenFailure] Waiting 1 second before retry');
				await new Promise(resolve => setTimeout(resolve, 1000));
			} else {
				console.error('[handleTokenFailure] Maximum retries reached, giving up');
			}
		}
	}

	console.error('[handleTokenFailure] All attempts failed, throwing last error');
	throw lastError;
}


const onuTable = async () => {
	try {
		console.log('Merefresh daftar ONU yang belum terotorisasi...');
		if (typeOlt && typeOlt.toUpperCase() === 'GPON') {
			await handleTokenFailure(async () => {
				return await axios.get(olt + '/gponont_mgmt?form=auth&port_id=0', {
					headers: {
						"X-Token": xToken
					}
				});
			});
		} else if (typeOlt && typeOlt.toUpperCase() === 'EPON') {
			await handleTokenFailure(async () => {
				return await axios.get(olt + `/onu_allow_list?t=${Date.now()}`, {
					headers: {
						"X-Token": xToken
					}
				});
			});
		}
		console.log('Refresh selesai.');
	} catch (e) {
		console.error('Gagal merefresh daftar ONU:', e.message);
		// Lanjutkan eksekusi meskipun refresh gagal
	}
	console.log('[onuTable] Getting ONU table data');
	let endpoint;
	if (typeOlt && typeOlt.toUpperCase() === 'EPON') {
		console.log('[onuTable] Using EPON endpoint');
		endpoint = olt + '/onutable';
	} else if (typeOlt && typeOlt.toUpperCase() === 'GPON') {
		console.log('[onuTable] Using GPON endpoint');
		endpoint = olt + '/ontinfo_table';
	} else {
		console.log('[onuTable] OLT type not specified, using default endpoint');
		endpoint = olt + '/onutable';
	}

	console.log('[onuTable] Using endpoint:', endpoint);

	try {
		console.log('[onuTable] Making API request');
		const result = await handleTokenFailure(async () => {
			return await axios.get(endpoint, {
				headers: {
					"X-Token": xToken
				}
			});
		});

		console.log('[onuTable] API request successful');
		if (result.data && result.data.data) {
			console.log('[onuTable] Retrieved', result.data.data.length, 'ONUs');
			if (result.data.data.length > 0) {
			}
		} else {
			console.log('[onuTable] No ONU data in response');
		}

		return result.data.data;

	} catch (error) {
		console.error('[onuTable] Error getting ONU table:', error.message);
		throw new Error('Tidak dapat mengambil data tabel ONU: ' + error.message);
	}
}


const ponHSGQ = async () => {
    let text;
    let endpoint = olt + '/board?info=pon';

    try {
        const resp = await handleTokenFailure(async () => {
            return await axios.get(endpoint, {
                headers: {
                    "X-Token": xToken
                }
            });
        });

        const info = resp.data.data;

        if (!info || !Array.isArray(info) || info.length === 0) {
            return 'Maaf, tidak ada data PON yang tersedia';
        }

        let ponInfo = `Info Jumlah & Status Onu (${typeOlt || 'Unknown'})\n`;

        for (let i = 0; i < info.length; i++) {
            if (info[i] && info[i].port_id !== undefined) {
                if (typeOlt && typeOlt.toUpperCase() === 'EPON') {
                    ponInfo += `    EPON ${info[i].port_id} = online : ${info[i].online || 0}, offline : ${info[i].offline || 0}\n`;
                } else {
                    ponInfo += `    PON ${info[i].port_id} = online : ${info[i].online || 0}, offline : ${info[i].offline || 0}\n`;
                }
            }
        }

        try {
            const onuData = await onuTable();

            if (typeOlt && typeOlt.toUpperCase() === 'GPON') {
                if (onuData && onuData.length > 0) {
                    const offlineONUs = onuData.filter(onu => onu.rstate === 2); // rstate 2 for offline
                    const initialONUs = onuData.filter(onu => onu.rstate === 0); // rstate 0 for initial

                    if (offlineONUs.length > 0 || initialONUs.length > 0) {
                        ponInfo += '\nDevice Offline\n';

                        for (const onu of offlineONUs) {
                            const onuName = onu.ont_name || 'Unknown';
                            ponInfo += `${onu.ont_sn || 'Unknown'} - ${onuName} | ${onu.last_d_cause}\n`;
                        }

                        for (const onu of initialONUs) {
                            const onuName = onu.ont_name || 'Unknown';
                            ponInfo += `${onu.ont_sn || 'Unknown'} - ${onuName} | initial\n`;
                        }
                    }
                }
            } else { // EPON Logic
                if (onuData && onuData.length > 0) {
                    const offlineONUs = onuData.filter(onu => {
                        const status = (onu.status || '').toLowerCase();
                        return status && status !== 'online' && status !== 'up' && status !== 'registered';
                    });

                    if (offlineONUs.length > 0) {
                        ponInfo += '\nDevice Offline\n';

                        for (const onu of offlineONUs) {
                            const onuName = onu.onu_name || 'Unknown';
                            const status = onu.status || 'Unknown';
                            ponInfo += `${onu.macaddr || 'Unknown'} (${onuName} - ${status})\n`;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch offline ONU data:', e.message);
        }

        return ponInfo;

    } catch (e) {
        return 'Maaf, tidak dapat terhubung ke perangkat OLT. Silahkan coba lagi nanti.';
    }
}


const onuDetail = async (onuName) => {
	let text;
	let respA;
	let onuTables = await onuTable();
	let finding;
	if (typeOlt && typeOlt.toUpperCase() === 'GPON') {
		finding = onuTables.find((val) =>
			(val.ont_sn && val.ont_sn.toLowerCase() == onuName.toLowerCase()) ||
			(val.ont_name && val.ont_name.toLowerCase() == onuName.toLowerCase())
		);

		if (finding && finding.rstate !== 1) { // rstate 1 is 'Online'
			finding._fromOfflineTable = true;
		}

	} else {
		finding = onuTables.find((val) =>
			(val.macaddr && val.macaddr.toLowerCase() == onuName.toLowerCase()) ||
			(val.onu_name && val.onu_name.toLowerCase() == onuName.toLowerCase())
		);
	}

	if (finding) {
		if (typeOlt && typeOlt.toUpperCase() === 'GPON') {
			if (finding._fromOfflineTable) {
				let statusText = 'Unknown';
				if (finding.rstate === 0) {
					statusText = 'Initial';
				} else if (finding.rstate === 1) {
					statusText = 'Online';
				} else if (finding.rstate === 2) {
					statusText = 'Offline';
				}

				let gponDetail = `ONU Name : ${finding.ont_name || '-'}\n`;
				gponDetail += `Description : ${finding.ont_description || '-'}\n`;
				gponDetail += `SN : ${finding.ont_sn || '-'}\n`;
				gponDetail += `ONU Status : ${statusText}\n`;
				gponDetail += `ONU RX Power : ${finding.receive_power || '-'} dBm\n`;
				gponDetail += `Start Time : ${finding.last_u_time || '-'}\n`;
				gponDetail += `Down Time : ${finding.last_d_time || '-'}\n`;
				gponDetail += `Down Cause : ${finding.last_d_cause || '-'}\n`;
				gponDetail += `\nCatatan: Tidak Terhubung ke OLT\n`;

				return gponDetail;
			} else {
				try {
					const authListResp = await handleTokenFailure(async () => {
						return await axios.get(olt + `/gponmgmt?form=optical_onu&port_id=0`, {
							headers: {
								"X-Token": xToken
							}
						});
					});

					const authList = authListResp.data.data || [];
					const authInfo = authList.find(item => item.ont_sn === finding.ont_sn);

					const portId = finding.port_id || (authInfo ? authInfo.port_id : undefined);
					const ontId = finding.ont_id || (authInfo ? authInfo.ont_id : undefined);

					if (portId === undefined || ontId === undefined) {
						return `Maaf, tidak dapat menemukan Port ID atau ONT ID untuk ONU ${onuName}.`;
					}

					const baseResp = await handleTokenFailure(async () => {
						return await axios.get(olt + `/gponont_mgmt?form=base&port_id=${portId}&ont_id=${ontId}`, {
							headers: {
								"X-Token": xToken
							}
						});
					});

					const ontOpticalResp = await handleTokenFailure(async () => {
						return await axios.get(olt + `/gponont_mgmt?form=ont_optical&port_id=${portId}&ont_id=${ontId}`, {
							headers: {
								"X-Token": xToken
							}
						});
					});

					const ontVersionResp = await handleTokenFailure(async () => {
						return await axios.get(olt + `/gponont_mgmt?form=ont_version&port_id=${portId}&ont_id=${ontId}`, {
							headers: {
								"X-Token": xToken
							}
						});
					});

					let baseData = baseResp.data.data || {};
					let ontOpticalData = ontOpticalResp.data.data || {};
					let ontVersionData = ontVersionResp.data.data || {};

					let rxPower = ontOpticalData.receive_power || '';
					let signalQuality = 'Unknown';

					if (rxPower && rxPower !== '-') {
						let powerValue = parseFloat(rxPower.replace(/[^\d.-]/g, ''));

						if (!isNaN(powerValue)) {
							if (powerValue >= -16) {
								signalQuality = 'Sangat BAIK';
							} else if (powerValue >= -24) {
								signalQuality = 'BAIK';
							} else if (powerValue >= -26) {
								signalQuality = 'BURUK';
							} else {
								signalQuality = 'Sangat BURUK';
							}
						}
					}

					let gponDetail = `ONU Name : ${finding.ont_name || baseData.ont_name || '-'}\n`;
					gponDetail += `Description : ${baseData.ont_description || '-'}\n`;
					gponDetail += `Tipe ONU : ${ontVersionData.equipmentid || '-'}(Version ID : ${ontVersionData.ont_version || '-'})\n`;
					gponDetail += `SN : ${finding.ont_sn || baseData.ont_sn || '-'}\n`;
					gponDetail += `ONU Status : ${baseData.rstate == 1 ? 'Online' : baseData.rstate == 2 ? 'Offline' : 'Unknown'}\n`;
					gponDetail += `Profil : ${baseData.lineprof_name || '-'}\n`;
					gponDetail += `Port : ${portId}/${ontId}\n`;
					gponDetail += `ONU Temperature : ${ontOpticalData.work_temperature || '-'}\n`;
					gponDetail += `ONU Tx Power : ${ontOpticalData.transmit_power || '-'}\n`;
					gponDetail += `ONU RX Power : ${ontOpticalData.receive_power || '-'}\n`;
					gponDetail += `Start Time : ${baseData.last_u_time || '-'}\n`;
					gponDetail += `Down Time : ${baseData.last_d_time || '-'}\n`;
					gponDetail += `Down Cause : ${baseData.last_d_cause || '-'}\n`;
					gponDetail += `Uptime : ${baseData.uptime || '-'}\n`;
					gponDetail += `\nKesimpulan : Hasil pengukuran ${signalQuality}\n`;

					return gponDetail;

				} catch (error) {
					return `Maaf, terjadi kesalahan saat mengambil data ONU: ${error.message}`;
				}
			}

		} else {
			try {
				const respA = await handleTokenFailure(async () => {
					return await axios.get(olt + '/onumgmt?form=optical-diagnose&port_id=' + finding.port_id + '&onu_id=' + finding.onu_id, {
						headers: {
							"X-Token": xToken
						}
					});
				});

				const respB = await handleTokenFailure(async () => {
					return await axios.get(olt + '/onumgmt?form=base-info&port_id=' + finding.port_id + '&onu_id=' + finding.onu_id, {
						headers: {
							"X-Token": xToken
						}
					});
				});

				let opticalDiagnostic = respA.data.data;
				let detail = respB.data.data;

				let rxPower = opticalDiagnostic.receive_power || '';
				let signalQuality = 'LOS';

				if (rxPower && rxPower !== '-') {
					let powerValue = parseFloat(rxPower.replace(/[^\d.-]/g, ''));

					if (!isNaN(powerValue)) {
						if (powerValue >= -16) {
							signalQuality = 'Sangat BAIK';
						} else if (powerValue >= -24) {
							signalQuality = 'BAIK';
						} else if (powerValue >= -26) {
							signalQuality = 'BURUK';
						} else {
							signalQuality = 'Sangat BURUK';
						}
					}
				}

				return text = `ONU Detail (EPON)
ONU Name : ${detail.onu_name || '-'}
Description : ${detail.onu_desc || '-'}
Tipe ONU : ${detail.extmodel || '-'} (Version ID : ${detail.hardware_ver || '-'})
Mac : ${detail.macaddr || '-'}
Status : ${detail.status || '-'}
Port ID : ${finding.port_id || '-'}/${finding.onu_id || '-'}
Jarak : ${detail.distance || '-'} M
ONU Temperatur : ${opticalDiagnostic.work_temprature || '-'}
ONU Voltage : ${opticalDiagnostic.work_voltage || '-'}
ONU Tx Power : ${opticalDiagnostic.transmit_power || '-'}
ONU Rx Power : ${opticalDiagnostic.receive_power || '-'}
Start Time : ${finding.register_time || '-'}
Down Time : ${finding.last_down_time || '-'}
Down Cause : ${finding.last_down_reason || '-'}

Kesimpulan : Hasil pengukuran ${signalQuality}
`;
			} catch (error) {
				return text = `Maaf, terjadi kesalahan saat mengambil data ONU: ${error.message}`;
			}
		}

	} else {
		let searchType = (typeOlt && typeOlt.toUpperCase() === 'GPON') ? 'Serial Number' : 'MAC Address';
		return `Maaf, ${onuName} tidak ditemukan.\nGunakan ${searchType} atau nama ONU untuk pencarian.`;
	}
}


const oltSystem = async () => {
	try {
		const systemResp = await handleTokenFailure(async () => {
			const response = await axios.get(olt + '/board?info=system', {
				headers: {
					'X-Token': xToken,
				},
			});
			if (!response || !response.data || !response.data.data) {
				throw new Error('Response from OLT is invalid');
			}
			return response;
		});

		const timeResp = await handleTokenFailure(async () => {
			const response = await axios.get(olt + '/time?form=info', {
				headers: {
					'X-Token': xToken,
				},
			});
			if (!response || !response.data || !response.data.data) {
				throw new Error('Response from OLT is invalid');
			}
			return response;
		});

		const {
			data: {
				device_type: type = 2 ? 'GPON' : type === 1 ? 'EPON' : String(type || 'Unknown')
			}
		} = systemResp.data || {};
		const configuredType = typeOlt || 'Not Set';

		let currentTime = '-';
		let deviceUptime = '-';

		if (timeResp && timeResp.data && timeResp.data.data) {
			const {
				data: {
					time_now: timeNow,
					uptime: uptimeTime
				}
			} = timeResp.data || {};
			if (Array.isArray(timeNow) && timeNow.length >= 6) {
				const [year, month, day, hour, minute, second] = timeNow;
				currentTime = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
			}

			if (Array.isArray(uptimeTime) && uptimeTime.length >= 4) {
				const [days, hours, minutes, seconds] = uptimeTime;
				deviceUptime = `${days} hari, ${hours} jam, ${minutes} menit, ${seconds} detik`;
			}
		}

		const lines = [
			'Info System OLT',
			`Vendor: ${systemResp.data.data?.vendor || '-'}`,
			`Produk: ${systemResp.data.data?.product_name || '-'}`,
			`Tipe OLT: ${configuredType}`,
			`Firmware: ${systemResp.data.data?.fw_ver || '-'}`,
			`MAC: ${systemResp.data.data?.macaddr || '-'}`,
			`SN: ${systemResp.data.data?.sn || '-'}`,
			`PON Ports: ${systemResp.data.data?.ponports != null ? systemResp.data.data.ponports : '-'}`,
			`Current Time: ${currentTime}`,
			`Uptime: ${deviceUptime}`,
		];

		return lines.join('\n');

	} catch (e) {
		return `Maaf, tidak dapat terhubung ke perangkat OLT untuk mengambil info sistem. Error: ${e.message || 'Unknown'}`;
	}
}


const rebootOnu = async (onuName) => {
	console.log(`[rebootOnu] Memulai proses reboot untuk ONU: ${onuName}`);
	try {
		if (!onuName || onuName.trim() === '') {
			console.log(`[rebootOnu] Error: Nama ONU kosong`);
			return 'Mohon masukkan nama atau identifikasi ONU yang akan di-reboot.';
		}

		let finding;
		const searchTerm = onuName.trim().toLowerCase();
		const onuData = await onuTable();

		console.log(`[rebootOnu] Mencari ONU dengan term: "${searchTerm}"`);
		console.log(`[rebootOnu] Tipe OLT terdeteksi: ${typeOlt || 'Tidak diketahui'}`);

		if (typeOlt && typeOlt.toUpperCase() === 'GPON') {
			console.log(`[rebootOnu] Proses reboot untuk GPON`);

			if (onuData && Array.isArray(onuData)) {
				finding = onuData.find((val) => {
					const ontSn = val.ont_sn ? val.ont_sn.toLowerCase() : '';
					const ontName = val.ont_name ? val.ont_name.toLowerCase() : '';

					return ontSn === searchTerm || ontName === searchTerm;
				});
			}

			if (!finding) {
				return `Maaf, ONU "${onuName}" tidak ditemukan.\nGunakan Serial Number atau nama ONU untuk pencarian.`;
			}

			if (!finding.identifier) {
				return `Tidak dapat menemukan identifier untuk ONU ${onuName}.`;
			}

			console.log(`[rebootOnu] GPON: Melakukan reboot untuk ONU dengan identifier: ${finding.identifier}`);
			const rebootResp = await handleTokenFailure(async () => {
				return await axios({
					method: 'post',
					url: olt + '/gponont_mgmt?form=info',
					headers: {
						"X-Token": xToken,
						"Content-Type": "application/json"
					},
					data: {
						method: "set",
						param: {
							identifier: finding.identifier,
							flags: 4,
							ont_name: "",
							ont_description: ""
						}
					}
				});
			});

			console.log(`[rebootOnu] GPON: Response reboot: ${JSON.stringify(rebootResp.data || {})}`);


			if (rebootResp.data &&
				(rebootResp.data.message === 'Success' ||
					rebootResp.data.message === 'success' ||
					rebootResp.data.status === 'success' ||
					rebootResp.data.code === 1)) {
				const successMsg = `✅ Perintah reboot berhasil dikirim ke ONU ${finding.ont_name || finding.ont_sn}\n` +
					`Serial Number: ${finding.ont_sn || '-'}\n` +
					`ONU akan restart dalam beberapa detik...`;
				console.log(`[rebootOnu] GPON: Reboot berhasil - ${finding.ont_name || finding.ont_sn}`);
				return successMsg;
			} else {
				console.log(`[rebootOnu] GPON: Reboot gagal - ${onuName}`);
				return `Gagal melakukan reboot ONU ${onuName}.`;
			}

		} else {
			finding = onuData.find((val) => {
				const macAddr = val.macaddr ? val.macaddr.toLowerCase() : '';
				const onuName = val.onu_name ? val.onu_name.toLowerCase() : '';

				return macAddr === searchTerm || onuName === searchTerm;
			});

			if (!finding) {
				return `Maaf, ONU "${onuName}" tidak ditemukan.\nGunakan MAC Address atau nama ONU untuk pencarian.`;
			}

			console.log(`[rebootOnu] EPON: Melakukan reboot untuk ONU dengan port_id: ${finding.port_id}, onu_id: ${finding.onu_id}`);
			const rebootResp = await handleTokenFailure(async () => {
				return await axios({
					method: 'post',
					url: olt + '/onumgmt?form=config',
					headers: {
						"X-Token": xToken,
						"Content-Type": "application/json"
					},
					data: {
						method: "set",
						param: {
							port_id: finding.port_id,
							onu_id: finding.onu_id,
							flags: 1,
							fec_mode: 1
						}
					}
				});
			});

			console.log(`[rebootOnu] EPON: Response reboot: ${JSON.stringify(rebootResp.data || {})}`);


			if (rebootResp.data &&
				(rebootResp.data.message === 'Success' ||
					rebootResp.data.message === 'success' ||
					rebootResp.data.status === 'success' ||
					rebootResp.data.code === 1)) {
				const successMsg = `✅ Perintah reboot berhasil dikirim ke ONU ${finding.onu_name}\n` +
					`MAC Address: ${finding.macaddr || '-'}\n` +
					`ONU akan restart dalam beberapa detik...`;
				console.log(`[rebootOnu] EPON: Reboot berhasil - ${finding.onu_name}`);
				return successMsg;
			} else {
				console.log(`[rebootOnu] EPON: Reboot gagal - ${onuName}`);
				return `Gagal melakukan reboot ONU ${onuName}.`;
			}
		}

	} catch (error) {
		console.log(`[rebootOnu] Error: ${error.message}`);
		throw new Error('Tidak dapat melakukan reboot ONU: ' + error.message);
	}
}



const changeOntName = async (onuName, newName) => {
	console.log(`[changeOntName] Memulai proses pergantian nama dari "${onuName}" menjadi "${newName}"`);
	try {
		if (!onuName || onuName.trim() === '') {
			console.log(`[changeOntName] Error: Nama ONU kosong`);
			return 'Mohon masukkan nama atau identifikasi ONU yang akan diubah namanya.';
		}

		if (!newName || newName.trim() === '') {
			console.log(`[changeOntName] Error: Nama baru kosong`);
			return 'Mohon masukkan nama baru untuk ONU.';
		}

		let finding;
		const searchTerm = onuName.trim().toLowerCase();
		const onuData = await onuTable();

		console.log(`[changeOntName] Mencari ONU dengan term: "${searchTerm}"`);
		console.log(`[changeOntName] Tipe OLT terdeteksi: ${typeOlt || 'Tidak diketahui'}`);

		if (typeOlt && typeOlt.toUpperCase() === 'GPON') {
			console.log(`[changeOntName] Proses pergantian nama untuk GPON`);

			if (onuData && Array.isArray(onuData)) {
				finding = onuData.find((val) => {
					const ontSn = val.ont_sn ? val.ont_sn.toLowerCase() : '';
					const ontName = val.ont_name ? val.ont_name.toLowerCase() : '';

					return ontSn === searchTerm || ontName === searchTerm;
				});
			}

			if (!finding) {
				console.log(`[changeOntName] GPON: Gagal: ONU "${onuName}" tidak ditemukan`);
				return `Maaf, ONU "${onuName}" tidak ditemukan.\nGunakan Serial Number atau nama ONU untuk pencarian.`;
			}

			if (!finding.identifier) {
				console.log(`[changeOntName] GPON: Gagal: Identifier tidak ditemukan untuk ONU ${onuName}`);
				return `Tidak dapat menemukan identifier untuk ONU ${onuName}.`;
			}

			console.log(`[changeOntName] GPON: Mengubah nama ONU ${finding.ont_name} (${finding.ont_sn}) menjadi "${newName}"`)
			const changeResp = await handleTokenFailure(async () => {
				return await axios({
					method: 'post',
					url: olt + '/gponont_mgmt?form=info',
					headers: {
						"X-Token": xToken,
						"Content-Type": "application/json"
					},
					data: {
						method: "set",
						param: {
							identifier: finding.identifier,
							flags: 8,
							ont_name: newName,
							ont_description: finding.ont_description || "No-description"
						}
					}
				});
			});

			console.log(`[changeOntName] GPON: Response perubahan nama: ${JSON.stringify(changeResp.data || {})}`);


			if (changeResp.data &&
				(changeResp.data.message === 'Success' ||
					changeResp.data.message === 'success' ||
					changeResp.data.status === 'success' ||
					changeResp.data.code === 1)) {

				console.log(`[changeOntName] GPON: Menyimpan konfigurasi dengan system_save`);
				try {
					const saveResp = await handleTokenFailure(async () => {
						return await axios({
							method: 'post',
							url: olt + '/system_save',
							headers: {
								"X-Token": xToken,
								"Content-Type": "application/json"
							},
							data: {
								method: "set",
								param: {}
							}
						});
					});
					console.log(`[changeOntName] GPON: system_save berhasil: ${JSON.stringify(saveResp.data || {})}`);

					const successMsg = `✅ Nama ONU berhasil diubah dan disimpan!\n` +
						`Dari: ${finding.ont_name || '-'}\n` +
						`Menjadi: ${newName}\n` +
						`Serial Number: ${finding.ont_sn || '-'}`;
					console.log(`[changeOntName] GPON: Perubahan nama berhasil - ${finding.ont_name} → ${newName}`);
					return successMsg;
				} catch (saveError) {
					console.log(`[changeOntName] GPON: Error system_save - ${saveError.message}`);
					const warningMsg = `✅ Nama ONU berhasil diubah!\n` +
						`Dari: ${finding.ont_name || '-'}\n` +
						`Menjadi: ${newName}\n` +
						`Serial Number: ${finding.ont_sn || '-'}\n\n` +
						`⚠️ Namun gagal menyimpan konfigurasi: ${saveError.message}`;
					console.log(`[changeOntName] GPON: Perubahan nama berhasil tapi system_save gagal`);
					return warningMsg;
				}
			} else {
				console.log(`[changeOntName] GPON: Gagal mengubah nama ONU ${onuName}`);
				return `Gagal mengubah nama ONU ${onuName}.`;
			}

		} else {
			console.log(`[changeOntName] Proses pergantian nama untuk EPON`);
			console.log(`[changeOntName] EPON: Jumlah ONU ditemukan: ${onuData.length}`);

			finding = onuData.find((val) => {
				const macAddr = val.macaddr ? val.macaddr.toLowerCase() : '';
				const onuName = val.onu_name ? val.onu_name.toLowerCase() : '';

				return macAddr === searchTerm || onuName === searchTerm;
			});

			if (finding) {
				console.log(`[changeOntName] EPON: ONU ditemukan: ${JSON.stringify({
                    name: finding.onu_name,
                    mac: finding.macaddr,
                    port_id: finding.port_id,
                    onu_id: finding.onu_id
                })}`);
			} else {
				console.log(`[changeOntName] EPON: ONU tidak ditemukan dengan term: "${searchTerm}"`);
			}

			if (!finding) {
				console.log(`[changeOntName] EPON: Gagal: ONU "${onuName}" tidak ditemukan`);
				return `Maaf, ONU "${onuName}" tidak ditemukan.\nGunakan MAC Address atau nama ONU untuk pencarian.`;
			}

			console.log(`[changeOntName] EPON: Mengubah nama ONU ${finding.onu_name} (${finding.macaddr}) menjadi "${newName}"`);
			const changeResp = await handleTokenFailure(async () => {
				return await axios({
					method: 'post',
					url: olt + '/onumgmt?form=config',
					headers: {
						"X-Token": xToken,
						"Content-Type": "application/json"
					},
					data: {
						method: "set",
						param: {
							port_id: finding.port_id,
							onu_id: finding.onu_id,
							flags: 8,
							fec_mode: 1,
							onu_name: newName,
							onu_desc: finding.onu_desc || ""
						}
					}
				});
			});

			console.log(`[changeOntName] EPON: Response perubahan nama: ${JSON.stringify(changeResp.data || {})}`);

			if (changeResp.data &&
				(changeResp.data.message === 'Success' ||
					changeResp.data.message === 'success' ||
					changeResp.data.status === 'success' ||
					changeResp.data.code === 1)) {

				console.log(`[changeOntName] EPON: Menyimpan konfigurasi dengan system_save`);
				try {
					const saveResp = await handleTokenFailure(async () => {
						return await axios({
							method: 'post',
							url: olt + '/system_save',
							headers: {
								"X-Token": xToken,
								"Content-Type": "application/json"
							},
							data: {
								method: "set",
								param: {}
							}
						});
					});
					console.log(`[changeOntName] EPON: system_save berhasil`);

					const successMsg = `✅ Nama ONU berhasil diubah dan disimpan!\n` +
						`Dari: ${finding.onu_name || '-'}\n` +
						`Menjadi: ${newName}\n` +
						`MAC Address: ${finding.macaddr || '-'}`;
					console.log(`[changeOntName] EPON: Perubahan nama berhasil - ${finding.onu_name} → ${newName}`);
					return successMsg;
				} catch (saveError) {
					console.log(`[changeOntName] EPON: Error system_save - ${saveError.message}`);
					const warningMsg = `✅ Nama ONU berhasil diubah!\n` +
						`Dari: ${finding.onu_name || '-'}\n` +
						`Menjadi: ${newName}\n` +
						`MAC Address: ${finding.macaddr || '-'}\n\n` +
						`⚠️ Namun gagal menyimpan konfigurasi: ${saveError.message}`;
					console.log(`[changeOntName] EPON: Perubahan nama berhasil tapi system_save gagal`);
					return warningMsg;
				}
			} else {
				console.log(`[changeOntName] EPON: Gagal mengubah nama ONU ${onuName}`);
				return `Gagal mengubah nama ONU ${onuName}.`;
			}
		}

	} catch (error) {
		console.log(`[changeOntName] Error: ${error.message}`);
		throw new Error('Tidak dapat mengubah nama ONU: ' + error.message);
	}
};


const getAllOnu = async () => {
	console.log(`[getAllOnu] Memulai proses pengambilan semua data ONU`);
	try {
		let onuList = [];
		const onuData = await onuTable();
		console.log(`[getAllOnu] Tipe OLT terdeteksi: ${typeOlt || 'Tidak diketahui'}`);

		if (typeOlt && typeOlt.toUpperCase() === 'GPON') {
			console.log(`[getAllOnu] Mengambil daftar ONU untuk GPON`);
			if (onuData && Array.isArray(onuData)) {
				console.log(`[getAllOnu] GPON: Jumlah ONU ditemukan: ${onuData.length}`);

				onuList = onuData.map(ont => {
					const status = ont.rstate === 1 ? '✅' : ont.rstate === 2 ? '❌' : ont.rstate === 0 ? '⚠️' : '❓';
					return {
						sn: ont.ont_sn || '-',
						name: ont.ont_name || '-',
						status: status,
						port: `${ont.port_id || '-'}/${ont.ont_id || '-'}`
					};
				});
				console.log(`[getAllOnu] GPON: Berhasil format ${onuList.length} ONU`);
			} else {
				console.log(`[getAllOnu] GPON: Tidak ada data ONU yang diterima dari API`);
			}
		} else {
			console.log(`[getAllOnu] Mengambil daftar ONU untuk EPON`);
			if (onuData && Array.isArray(onuData)) {
				console.log(`[getAllOnu] EPON: Jumlah ONU ditemukan: ${onuData.length}`);

				onuList = onuData.map(onu => {
					const status = (onu.status && onu.status.toLowerCase() === 'online') ? '✅' : '❌';
					return {
						sn: onu.macaddr || '-',
						name: onu.onu_name || '-',
						status: status,
						port: `${onu.port_id || '-'}/${onu.onu_id || '-'}`
					};
				});
				console.log(`[getAllOnu] EPON: Berhasil format ${onuList.length} ONU`);
			} else {
				console.log(`[getAllOnu] EPON: Tidak ada data ONU yang diterima dari API`);
			}
		}

		onuList.sort((a, b) => a.name.localeCompare(b.name));
		console.log(`[getAllOnu] Total ONU ditemukan setelah diurutkan: ${onuList.length}`);

		return onuList;
	} catch (error) {
		console.log(`[getAllOnu] Error: ${error.message}`);
		throw new Error('Tidak dapat mengambil daftar ONU: ' + error.message);
	}
};

const getBadSignalOnus = async () => {
	console.log(`[getBadSignalOnus] Memulai proses pengecekan redaman buruk`);
	try {
		const allOnus = await onuTable();
		const badOnusList = [];

		if (!allOnus || allOnus.length === 0) {
			console.log(`[getBadSignalOnus] Tidak ada ONU yang ditemukan dari onuTable`);
			return [];
		}

		console.log(`[getBadSignalOnus] Memeriksa ${allOnus.length} ONU`);
		const threshold = -25.0;

		for (const onu of allOnus) {
			let rxPowerStr = null;
			let name = '-';
			let identifier = '-';

			if (typeOlt && typeOlt.toUpperCase() === 'GPON') {
				rxPowerStr = onu.receive_power;
				name = onu.ont_name || 'No-Name';
				identifier = onu.ont_sn;
			} else { // EPON
				// Diasumsikan 'receive_power' ada di data. Jika tidak, tidak akan ada yang terdeteksi.
				rxPowerStr = onu.receive_power;
				name = onu.onu_name || 'No-Name';
				identifier = onu.macaddr;
			}

			if (rxPowerStr && rxPowerStr !== '-') {
				let powerValue = parseFloat(rxPowerStr.replace(/[^\d.-]/g, ''));

				if (!isNaN(powerValue) && powerValue < threshold) {
					badOnusList.push({
						name: name,
						identifier: identifier,
						power: powerValue.toFixed(2)
					});
				}
			}
		}

		console.log(`[getBadSignalOnus] Ditemukan ${badOnusList.length} ONU dengan redaman buruk`);
		// Urutkan berdasarkan redaman terburuk
		badOnusList.sort((a, b) => a.power - b.power);

		return badOnusList;
	} catch (error) {
		console.log(`[getBadSignalOnus] Error: ${error.message}`);
		throw new Error('Tidak dapat mengambil data redaman ONU: ' + error.message);
	}
};

// GANTI baris module.exports yang lama dengan yang ini
module.exports = {
	ponHSGQ,
	onuDetail,
	oltSystem,
	rebootOnu,
	changeOntName,
	getAllOnu,
	getBadSignalOnus, // <--- TAMBAHKAN INI
	typeOlt
};