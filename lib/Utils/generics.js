"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bytesToCrockford = exports.trimUndefined = exports.isWABusinessPlatform = exports.getCodeFromWSError = exports.getCallStatusFromNode = exports.getErrorCodeFromStreamError = exports.getStatusFromReceiptType = exports.generateMdTagPrefix = exports.fetchLatestWaWebVersion = exports.fetchLatestBaileysVersion = exports.printQRIfNecessaryListener = exports.bindWaitForConnectionUpdate = exports.bindWaitForEvent = exports.generateMessageID = exports.generateMessageIDV2 = exports.promiseTimeout = exports.delayCancellable = exports.delay = exports.debouncedTimeout = exports.unixTimestampSeconds = exports.toNumber = exports.encodeBigEndian = exports.generateRegistrationId = exports.encodeWAMessage = exports.unpadRandomMax16 = exports.writeRandomPadMax16 = exports.getKeyAuthor = exports.BufferJSON = exports.Browsers = void 0;

const boom_1 = require("@hapi/boom");
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const os_1 = require("os");
const WAProto_1 = require("../../WAProto");
const baileys_version_json_1 = require("../Defaults/baileys-version.json");
const Types_1 = require("../Types");
const WABinary_1 = require("../WABinary");

const PLATFORM_MAP = {
    'aix': 'AIX',
    'darwin': 'Mac OS',
    'win32': 'Windows',
    'android': 'Android',
    'freebsd': 'FreeBSD',
    'openbsd': 'OpenBSD',
    'sunos': 'Solaris'
};

exports.Browsers = {
    ubuntu: (browser) => ['Ubuntu', browser, '22.04.4'],
    macOS: (browser) => ['Mac OS', browser, '14.4.1'],
    baileys: (browser) => ['Baileys', browser, '6.5.0'],
    windows: (browser) => ['Windows', browser, '10.0.22631'],
    appropriate: (browser) => [PLATFORM_MAP[(0, os_1.platform)()] || 'Ubuntu', browser, (0, os_1.release)()]
};

const getPlatformId = (browser) => {
    const platformType = WAProto_1.proto.DeviceProps.PlatformType[browser.toUpperCase()];
    return platformType ? platformType.toString() : '1';
};
exports.getPlatformId = getPlatformId;

exports.BufferJSON = {
    replacer: (k, value) => {
        if (Buffer.isBuffer(value) || value instanceof Uint8Array || (value?.type === 'Buffer')) {
            return { type: 'Buffer', data: Buffer.from(value?.data || value).toString('base64') };
        }
        return value;
    },
    reviver: (_, value) => {
        if (typeof value === 'object' && !!value && (value.buffer === true || value.type === 'Buffer')) {
            const val = value.data || value.value;
            return typeof val === 'string' ? Buffer.from(val, 'base64') : Buffer.from(val || []);
        }
        return value;
    }
};

const getKeyAuthor = (key, meId = 'me') =>
    ((key?.fromMe) ? meId : (key?.participant || key?.remoteJid)) || '';
exports.getKeyAuthor = getKeyAuthor;

const writeRandomPadMax16 = (msg) => {
    const pad = (0, crypto_1.randomBytes)(1);
    pad[0] &= 0xf;
    pad[0] = pad[0] || 0xf;
    return Buffer.concat([msg, Buffer.alloc(pad[0], pad[0])]);
};
exports.writeRandomPadMax16 = writeRandomPadMax16;

const unpadRandomMax16 = (e) => {
    const t = new Uint8Array(e);
    if (t.length === 0) throw new Error('unpadPkcs7 given empty bytes');
    const r = t[t.length - 1];
    if (r > t.length) throw new Error(`unpad given ${t.length} bytes, but pad is ${r}`);
    return new Uint8Array(t.buffer, t.byteOffset, t.length - r);
};
exports.unpadRandomMax16 = unpadRandomMax16;

const encodeWAMessage = (message) => (0, exports.writeRandomPadMax16)(WAProto_1.proto.Message.encode(message).finish());
exports.encodeWAMessage = encodeWAMessage;

const generateRegistrationId = () => Uint16Array.from((0, crypto_1.randomBytes)(2))[0] & 16383;
exports.generateRegistrationId = generateRegistrationId;

const encodeBigEndian = (e, t = 4) => {
    let r = e;
    const a = new Uint8Array(t);
    for (let i = t - 1; i >= 0; i--) {
        a[i] = r & 255;
        r >>>= 8;
    }
    return a;
};
exports.encodeBigEndian = encodeBigEndian;

const toNumber = (t) => {
    if (typeof t === 'object' && t) {
        if ('toNumber' in t && typeof t.toNumber === 'function') return t.toNumber();
        if ('low' in t) return t.low;
    }
    return typeof t === 'number' ? t : 0;
};
exports.toNumber = toNumber;

const unixTimestampSeconds = (date = new Date()) => Math.floor(date.getTime() / 1000);
exports.unixTimestampSeconds = unixTimestampSeconds;

const debouncedTimeout = (intervalMs = 1000, task) => {
    let timeout;
    return {
        start: (newIntervalMs, newTask) => {
            task = newTask || task;
            intervalMs = newIntervalMs || intervalMs;
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => task?.(), intervalMs);
        },
        cancel: () => timeout && clearTimeout(timeout),
        setTask: (newTask) => task = newTask,
        setInterval: (newInterval) => intervalMs = newInterval
    };
};
exports.debouncedTimeout = debouncedTimeout;

const delay = (ms) => (0, exports.delayCancellable)(ms).delay;
exports.delay = delay;

const delayCancellable = (ms) => {
    const stack = new Error().stack;
    let timeout;
    let reject;
    const delay = new Promise((resolve, _reject) => {
        timeout = setTimeout(resolve, ms);
        reject = _reject;
    });
    const cancel = () => {
        clearTimeout(timeout);
        reject?.(new boom_1.Boom('Cancelled', { statusCode: 500, data: { stack } }));
    };
    return { delay, cancel };
};
exports.delayCancellable = delayCancellable;

async function promiseTimeout(ms, promise) {
    if (!ms) return new Promise(promise);
    const stack = new Error().stack;
    const { delay, cancel } = (0, exports.delayCancellable)(ms);
    const p = new Promise((resolve, reject) => {
        delay.then(() => reject(new boom_1.Boom('Timed Out', {
            statusCode: Types_1.DisconnectReason.timedOut,
            data: { stack }
        }))).catch(reject);
        promise(resolve, reject);
    }).finally(cancel);
    return p;
}
exports.promiseTimeout = promiseTimeout;

const generateMessageID = () => 'MUTSUMI' + (0, crypto_1.randomBytes)(7).toString('hex').toUpperCase();
exports.generateMessageID = generateMessageID;

const generateMessageIDV2 = (userId) => {
    const data = Buffer.alloc(8 + 20 + 16);
    data.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));
    try {
        const id = (0, WABinary_1.jidDecode)(userId);
        if (id?.user) {
            data.write(id.user.slice(0, 15), 8); // prevent overflow
            data.write('@c.us', 8 + id.user.length);
        }
    } catch { }
    const random = (0, crypto_1.randomBytes)(16);
    random.copy(data, 28);
    const hash = (0, crypto_1.createHash)('sha256').update(data).digest();
    return 'MUTSUMI' + hash.toString('hex').toUpperCase().substring(0, 18);
};
exports.generateMessageIDV2 = generateMessageIDV2;

function bindWaitForEvent(ev, event) {
    return async (check, timeoutMs) => {
        let listener;
        let closeListener;
        await (0, exports.promiseTimeout)(timeoutMs, (resolve, reject) => {
            closeListener = ({ connection, lastDisconnect }) => {
                if (connection === 'close') {
                    reject(lastDisconnect?.error || new boom_1.Boom('Connection Closed', { statusCode: Types_1.DisconnectReason.connectionClosed }));
                }
            };
            ev.on('connection.update', closeListener);
            listener = (update) => {
                if (check(update)) resolve();
            };
            ev.on(event, listener);
        }).finally(() => {
            ev.off(event, listener);
            ev.off('connection.update', closeListener);
        });
    };
}
exports.bindWaitForEvent = bindWaitForEvent;

const bindWaitForConnectionUpdate = (ev) => (0, exports.bindWaitForEvent)(ev, 'connection.update');
exports.bindWaitForConnectionUpdate = bindWaitForConnectionUpdate;

const printQRIfNecessaryListener = (ev, logger) => {
    ev.on('connection.update', async ({ qr }) => {
        if (qr) {
            try {
                const QR = await import('qrcode-terminal').then(m => m.default || m);
                QR?.generate(qr, { small: true });
            } catch {
                logger.error('QR code terminal not added as dependency');
            }
        }
    });
};
exports.printQRIfNecessaryListener = printQRIfNecessaryListener;

const fetchLatestBaileysVersion = async (options = {}) => {
    try {
        const result = await axios_1.default.get('https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json', {
            ...options,
            responseType: 'json'
        });
        return { version: result.data.version, isLatest: true };
    } catch (error) {
        return { version: baileys_version_json_1.version, isLatest: false, error };
    }
};
exports.fetchLatestBaileysVersion = fetchLatestBaileysVersion;

const fetchLatestWaWebVersion = async (options) => {
    try {
        const result = await axios_1.default.get('https://web.whatsapp.com/check-update?version=1&platform=web', {
            ...options,
            responseType: 'json'
        });
        const version = result.data.currentVersion.split('.');
        return { version: [+version[0], +version[1], +version[2]], isLatest: true };
    } catch (error) {
        return { version: baileys_version_json_1.version, isLatest: false, error };
    }
};
exports.fetchLatestWaWebVersion = fetchLatestWaWebVersion;

const generateMdTagPrefix = () => {
    const bytes = (0, crypto_1.randomBytes)(4);
    return `${bytes.readUInt16BE()}.${bytes.readUInt16BE(2)}-`;
};
exports.generateMdTagPrefix = generateMdTagPrefix;

const STATUS_MAP = {
    'played': WAProto_1.proto.WebMessageInfo.Status.PLAYED,
    'read': WAProto_1.proto.WebMessageInfo.Status.READ,
    'read-self': WAProto_1.proto.WebMessageInfo.Status.READ
};
const getStatusFromReceiptType = (type) => typeof type === 'undefined' ? WAProto_1.proto.WebMessageInfo.Status.DELIVERY_ACK : STATUS_MAP[type];
exports.getStatusFromReceiptType = getStatusFromReceiptType;

const CODE_MAP = {
    conflict: Types_1.DisconnectReason.connectionReplaced
};

const getErrorCodeFromStreamError = (node) => {
    const [reasonNode] = (0, WABinary_1.getAllBinaryNodeChildren)(node);
    let reason = reasonNode?.tag || 'unknown';
    const statusCode = +(node.attrs.code || CODE_MAP[reason] || Types_1.DisconnectReason.badSession);
    if (statusCode === Types_1.DisconnectReason.restartRequired) reason = 'restart required';
    return { reason, statusCode };
};
exports.getErrorCodeFromStreamError = getErrorCodeFromStreamError;

const getCallStatusFromNode = ({ tag, attrs }) => {
    switch (tag) {
        case 'offer': case 'offer_notice': return 'offer';
        case 'terminate': return attrs.reason === 'timeout' ? 'timeout' : 'reject';
        case 'reject': return 'reject';
        case 'accept': return 'accept';
        default: return 'ringing';
    }
};
exports.getCallStatusFromNode = getCallStatusFromNode;

const getCodeFromWSError = (error) => {
    let statusCode = 500;
    if (error?.message?.includes('Unexpected server response: ')) {
        const code = +error.message.slice('Unexpected server response: '.length);
        if (!Number.isNaN(code) && code >= 400) statusCode = code;
    } else if (error?.code?.startsWith('E') || error?.message?.includes('timed out')) {
        statusCode = 408;
    }
    return statusCode;
};
exports.getCodeFromWSError = getCodeFromWSError;

const isWABusinessPlatform = (platform) => platform === 'smbi' || platform === 'smba';
exports.isWABusinessPlatform = isWABusinessPlatform;

function trimUndefined(obj) {
    for (const key in obj) {
        if (typeof obj[key] === 'undefined') delete obj[key];
    }
    return obj;
}
exports.trimUndefined = trimUndefined;

const CROCKFORD_CHARACTERS = '123456789ABCDEFGHJKLMNPQRSTVWXYZ';
function bytesToCrockford(buffer) {
    let value = 0, bitCount = 0;
    const crockford = [];
    for (let i = 0; i < buffer.length; i++) {
        value = (value << 8) | (buffer[i] & 0xff);
        bitCount += 8;
        while (bitCount >= 5) {
            crockford.push(CROCKFORD_CHARACTERS.charAt((value >>> (bitCount - 5)) & 31));
            bitCount -= 5;
        }
    }
    if (bitCount > 0) crockford.push(CROCKFORD_CHARACTERS.charAt((value << (5 - bitCount)) & 31));
    return crockford.join('');
}
exports.bytesToCrockford = bytesToCrockford;
