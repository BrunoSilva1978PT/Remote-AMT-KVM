/**
* @description Server-side IDER/USB-R module - SCSI emulation in Node.js
* Talks directly to AMT via TCP, no WebSocket relay needed.
* Based on MeshCentral amt-ider-module.js (Apache 2.0)
* @author Ylian Saint-Hilaire (original), adapted for Remote-AMT-KVM
* @version v1.0.0
*/

const fs = require('fs');
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

module.exports.CreateServerIder = function () {

    function ShortToStrX(v) { return String.fromCharCode(v & 0xFF, (v >> 8) & 0xFF); }
    function IntToStrX(v) { return String.fromCharCode(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF); }
    function IntToStr(v) { return String.fromCharCode((v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF); }
    function ReadShort(v, p) { return (v.charCodeAt(p) << 8) + v.charCodeAt(p + 1); }
    function ReadShortX(v, p) { return (v.charCodeAt(p + 1) << 8) + v.charCodeAt(p); }
    function ReadInt(v, p) { return (v.charCodeAt(p) * 0x1000000) + (v.charCodeAt(p + 1) << 16) + (v.charCodeAt(p + 2) << 8) + v.charCodeAt(p + 3); }
    function ReadIntX(v, p) { return (v.charCodeAt(p + 3) * 0x1000000) + (v.charCodeAt(p + 2) << 16) + (v.charCodeAt(p + 1) << 8) + v.charCodeAt(p); }

    // Mode Sense arrays (same as client-side)
    var IDE_ModeSence_LS120Disk_Page_Array = String.fromCharCode(0x00, 0x26, 0x31, 0x80, 0x00, 0x00, 0x00, 0x00, 0x05, 0x1E, 0x10, 0xA9, 0x08, 0x20, 0x02, 0x00, 0x03, 0xC3, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xD0, 0x00, 0x00);
    var IDE_ModeSence_3F_LS120_Array = String.fromCharCode(0x00, 0x5c, 0x24, 0x80, 0x00, 0x00, 0x00, 0x00, 0x01, 0x0a, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x03, 0x16, 0x00, 0xa0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x12, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xa0, 0x00, 0x00, 0x00, 0x05, 0x1E, 0x10, 0xA9, 0x08, 0x20, 0x02, 0x00, 0x03, 0xC3, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xD0, 0x00, 0x00, 0x08, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0b, 0x06, 0x00, 0x00, 0x00, 0x11, 0x24, 0x31);
    var IDE_ModeSence_FloppyDisk_Page_Array = String.fromCharCode(0x00, 0x26, 0x24, 0x80, 0x00, 0x00, 0x00, 0x00, 0x05, 0x1E, 0x04, 0xB0, 0x02, 0x12, 0x02, 0x00, 0x00, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xD0, 0x00, 0x00);
    var IDE_ModeSence_3F_Floppy_Array = String.fromCharCode(0x00, 0x5c, 0x24, 0x80, 0x00, 0x00, 0x00, 0x00, 0x01, 0x0a, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x03, 0x16, 0x00, 0xa0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x12, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xa0, 0x00, 0x00, 0x00, 0x05, 0x1e, 0x04, 0xb0, 0x02, 0x12, 0x02, 0x00, 0x00, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xd0, 0x00, 0x00, 0x08, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0b, 0x06, 0x00, 0x00, 0x00, 0x11, 0x24, 0x31);
    var IDE_ModeSence_CD_1A_Array = String.fromCharCode(0x00, 0x12, 0x01, 0x80, 0x00, 0x00, 0x00, 0x00, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
    var IDE_ModeSence_CD_1D_Array = String.fromCharCode(0x00, 0x12, 0x01, 0x80, 0x00, 0x00, 0x00, 0x00, 0x1D, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
    var IDE_ModeSence_CD_2A_Array = String.fromCharCode(0x00, 0x20, 0x01, 0x80, 0x00, 0x00, 0x00, 0x00, 0x2a, 0x18, 0x00, 0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
    var IDE_ModeSence_3F_CD_Array = String.fromCharCode(0x00, 0x28, 0x01, 0x80, 0x00, 0x00, 0x00, 0x00, 0x01, 0x06, 0x00, 0xff, 0x00, 0x00, 0x00, 0x00, 0x2a, 0x18, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
    var IDE_CD_ConfigArrayProfileList = String.fromCharCode(0x00, 0x00, 0x03, 0x04, 0x00, 0x08, 0x01, 0x00);
    var IDE_CD_ConfigArrayCore = String.fromCharCode(0x00, 0x01, 0x03, 0x04, 0x00, 0x00, 0x00, 0x02);
    var IDE_CD_Morphing = String.fromCharCode(0x00, 0x02, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00);
    var IDE_CD_ConfigArrayRemovable = String.fromCharCode(0x00, 0x03, 0x03, 0x04, 0x29, 0x00, 0x00, 0x02);
    var IDE_CD_ConfigArrayRandom = String.fromCharCode(0x00, 0x10, 0x01, 0x08, 0x00, 0x00, 0x08, 0x00, 0x00, 0x01, 0x00, 0x00);
    var IDE_CD_Read = String.fromCharCode(0x00, 0x1E, 0x03, 0x00);
    var IDE_CD_PowerManagement = String.fromCharCode(0x01, 0x00, 0x03, 0x00);
    var IDE_CD_Timeout = String.fromCharCode(0x01, 0x05, 0x03, 0x00);
    var IDE_ModeSence_FloppyError_Recovery_Array = String.fromCharCode(0x00, 0x12, 0x24, 0x80, 0x00, 0x00, 0x00, 0x00, 0x01, 0x0A, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00);
    var IDE_ModeSence_Ls120Error_Recovery_Array = String.fromCharCode(0x00, 0x12, 0x31, 0x80, 0x00, 0x00, 0x00, 0x00, 0x01, 0x0A, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00);
    var IDE_ModeSence_CDError_Recovery_Array = String.fromCharCode(0x00, 0x0E, 0x01, 0x80, 0x00, 0x00, 0x00, 0x00, 0x01, 0x06, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00);
    var IDE_ModeSence_UsbDisk_Page_Array = String.fromCharCode(0x00, 0x12, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x08, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
    var IDE_ModeSence_3F_UsbDisk_Array = String.fromCharCode(0x00, 0x1C, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x01, 0x0A, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x08, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
    var IDE_ModeSence_UsbDiskError_Recovery_Array = String.fromCharCode(0x00, 0x12, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x01, 0x0A, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00);

    // Start a server-side IDER session
    // opts: { host, port, user, pass, tls, isoPath, mountMode, iderStart, onStatus, onError }
    function startSession(opts) {
        var obj = {};
        obj.protocol = 3; // IDER
        obj.bytesToAmt = 0;
        obj.bytesFromAmt = 0;
        obj.rx_timeout = 30000;
        obj.tx_timeout = 0;
        obj.heartbeat = 20000;
        obj.version = 1;
        obj.acc = '';
        obj.inSequence = 0;
        obj.outSequence = 0;
        obj.iderinfo = null;
        obj.enabled = false;
        obj.iderStart = opts.iderStart || 0;
        obj.floppy = null;
        obj.cdrom = null;
        obj.floppyReady = false;
        obj.cdromReady = false;
        obj.socket = null;
        obj.authState = 0;
        obj.opts = opts;

        // Open the ISO file
        try {
            var stats = fs.statSync(opts.isoPath);
            if (opts.mountMode === 'usb') {
                obj.floppy = { size: stats.size, fd: fs.openSync(opts.isoPath, 'r') };
                // Dummy cdrom (2048 bytes of zeros)
                obj.cdrom = { size: 2048, dummy: true };
            } else {
                obj.cdrom = { size: stats.size, fd: fs.openSync(opts.isoPath, 'r') };
            }
        } catch (e) {
            if (opts.onError) opts.onError('Cannot open file: ' + e.message);
            return null;
        }

        // Connect to AMT
        function connect() {
            var port = opts.port;
            if (opts.tls == 0) {
                obj.socket = new net.Socket();
                obj.socket.setNoDelay(true);
                obj.socket.connect(port, opts.host, onConnected);
            } else {
                var tlsoptions = { minVersion: 'TLSv1', ciphers: 'RSA+AES:!aNULL:!MD5:!DSS', rejectUnauthorized: false };
                obj.socket = tls.connect(port, opts.host, tlsoptions, onConnected);
            }
            obj.socket.on('data', onData);
            obj.socket.on('close', function () { console.log('IDER-Server: TCP closed'); obj.Stop(); });
            obj.socket.on('error', function (e) { console.log('IDER-Server: TCP error:', e.code); if (opts.onError) opts.onError('TCP error: ' + e.code); obj.Stop(); });
        }

        function onConnected() {
            if (opts.tls != 0 && obj.socket.socket) obj.socket.socket.setNoDelay(true);
            console.log('IDER-Server: TCP connected to ' + opts.host + ':' + opts.port);
            if (opts.onStatus) opts.onStatus('connected');
            // Send IDER start redirection
            var buf = Buffer.from([0x10, 0x00, 0x00, 0x00, 0x49, 0x44, 0x45, 0x52]);
            obj.socket.write(buf);
            obj.authState = 1;
        }

        function onData(data) {
            // Convert Buffer to binary string for protocol processing
            var str = data.toString('binary');
            obj.bytesFromAmt += str.length;
            obj.acc += str;
            processData();
        }

        function processData() {
            while (obj.acc.length > 0) {
                var len = 0;
                if (obj.authState < 5) {
                    len = processAuth();
                } else {
                    len = processIderDataWrapper();
                    // Check sequence number for ALL IDER messages (bytes 4-7)
                    if (len > 0 && obj.acc.length >= 8) {
                        var seq = ReadIntX(obj.acc, 4);
                        if (obj.inSequence !== seq) { console.log('IDER: Out of sequence', obj.inSequence, seq); obj.Stop(); return; }
                        obj.inSequence++;
                    }
                }
                if (len === 0) return;
                obj.acc = obj.acc.substring(len);
            }
        }

        // Authentication state machine (same as interceptor but inline)
        function processAuth() {
            if (obj.acc.length < 1) return 0;
            var cmd = obj.acc.charCodeAt(0);

            if (cmd === 0x11) { // StartRedirectionSessionReply
                if (obj.acc.length < 4) return 0;
                if (obj.acc.charCodeAt(1) !== 0) { if (opts.onError) opts.onError('Redirect start failed'); obj.Stop(); return 0; }
                if (obj.acc.length < 13) return 0;
                var oemlen = obj.acc.charCodeAt(12);
                if (obj.acc.length < 13 + oemlen) return 0;
                // Send auth query
                sendRaw(String.fromCharCode(0x13, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00));
                obj.authState = 2;
                return 13 + oemlen;
            }
            if (cmd === 0x14) { // AuthenticateSessionReply
                if (obj.acc.length < 9) return 0;
                var l = ReadIntX(obj.acc, 5);
                if (obj.acc.length < 9 + l) return 0;
                var authstatus = obj.acc.charCodeAt(1);
                var authType = obj.acc.charCodeAt(4);

                if (authType === 0 && authstatus === 0) {
                    // Step 1: Query response - list of available auth methods
                    // Check if digest (4) is available, then send empty digest to trigger challenge
                    var methods = [];
                    for (var mi = 0; mi < l; mi++) { methods.push(obj.acc.charCodeAt(9 + mi)); }
                    console.log('IDER-Server: Auth methods available:', methods);
                    if (methods.indexOf(4) >= 0) {
                        // Send empty digest auth request to trigger challenge (same as client-side)
                        var authurl = '/RedirectionService';
                        var emptyAuth = String.fromCharCode(0x13, 0x00, 0x00, 0x00, 0x04) +
                            IntToStrX(opts.user.length + authurl.length + 8) +
                            String.fromCharCode(opts.user.length) + opts.user +
                            String.fromCharCode(0x00, 0x00) +
                            String.fromCharCode(authurl.length) + authurl +
                            String.fromCharCode(0x00, 0x00, 0x00, 0x00);
                        sendRaw(emptyAuth);
                    } else {
                        if (opts.onError) opts.onError('Digest auth not supported');
                        obj.Stop();
                    }
                    return 9 + l;
                } else if (authType === 4 && authstatus === 1 && obj.authState < 4) { // DIGEST challenge (only process once)
                    obj.authState = 4; // Mark as "credentials sent, waiting for result"
                    var realmlen = obj.acc.charCodeAt(9);
                    var realm = obj.acc.substring(10, 10 + realmlen);
                    var noncelen = obj.acc.charCodeAt(10 + realmlen);
                    var nonce = obj.acc.substring(11 + realmlen, 11 + realmlen + noncelen);
                    var qoplen = obj.acc.charCodeAt(11 + realmlen + noncelen);
                    var qop = obj.acc.substring(12 + realmlen + noncelen, 12 + realmlen + noncelen + qoplen);

                    // Send digest auth response (match interceptor format exactly)
                    var cnonce = crypto.randomBytes(5).toString('hex');
                    var nc = 2;
                    var ncStr = nc.toString();
                    var authurl = '/RedirectionService';
                    var ha1 = crypto.createHash('md5').update(opts.user + ':' + realm + ':' + opts.pass).digest('hex');
                    var ha2 = crypto.createHash('md5').update(':' + authurl).digest('hex');
                    var response = crypto.createHash('md5').update(ha1 + ':' + nonce + ':' + ncStr + ':' + cnonce + ':' + qop + ':' + ha2).digest('hex');

                    var totalLen = opts.user.length + realm.length + nonce.length + authurl.length + cnonce.length + ncStr.length + response.length + qop.length + 8;
                    var authBuf = String.fromCharCode(0x13, 0x00, 0x00, 0x00, 0x04) + IntToStrX(totalLen) +
                        String.fromCharCode(opts.user.length) + opts.user +
                        String.fromCharCode(realm.length) + realm +
                        String.fromCharCode(nonce.length) + nonce +
                        String.fromCharCode(authurl.length) + authurl +
                        String.fromCharCode(cnonce.length) + cnonce +
                        String.fromCharCode(ncStr.length) + ncStr +
                        String.fromCharCode(response.length) + response +
                        String.fromCharCode(qop.length) + qop;
                    sendRaw(authBuf);
                } else if (authType !== 0 && authstatus === 0) { // SUCCESS (real auth, not query)
                    obj.authState = 5;
                    var remaining = obj.acc.length - (9 + l);
                    console.log('IDER-Server: Authenticated successfully, remaining acc=' + remaining);
                    if (opts.onStatus) opts.onStatus('authenticated');
                    startIder();
                } else {
                    if (opts.onError) opts.onError('Authentication failed');
                    obj.Stop();
                }
                return 9 + l;
            }
            return 0;
        }

        function startIder() {
            obj.inSequence = 0;
            obj.outSequence = 0;
            g_readQueue = [];
            g_media = null;
            g_reset = false;

            // Send OPEN_SESSION
            var openCmd = ShortToStrX(obj.rx_timeout) + ShortToStrX(obj.tx_timeout) + ShortToStrX(obj.heartbeat) + IntToStrX(obj.version);
            console.log('IDER-Server: Sending OPEN_SESSION, data length=' + openCmd.length);
            sendCommand(0x40, openCmd);

            // Keepalive ping every 5 seconds
            obj.pingTimer = setInterval(function () { sendCommand(0x44); }, 5000);

            if (opts.onStatus) opts.onStatus('ider_started');
        }

        function processIderDataWrapper() {
            if (obj.acc.length < 8) return 0;
            var cmd = obj.acc.charCodeAt(0);
            var len = processIderData();
            if (len > 0) {
                console.log('IDER-Server: Recv cmd=0x' + cmd.toString(16) + ' len=' + len + ' seq=' + (obj.inSequence - 1));
            }
            return len;
        }

        // IDER protocol processing (same logic as client-side but with fs.readSync)
        function processIderData() {
            if (obj.acc.length < 8) return 0;

            switch (obj.acc.charCodeAt(0)) {
                case 0x41: // OPEN_SESSION reply
                    if (obj.acc.length < 30) return 0;
                    var olen = obj.acc.charCodeAt(29);
                    if (obj.acc.length < 30 + olen) return 0;
                    obj.iderinfo = {};
                    obj.iderinfo.major = obj.acc.charCodeAt(8);
                    obj.iderinfo.minor = obj.acc.charCodeAt(9);
                    obj.iderinfo.readbfr = ReadShortX(obj.acc, 16);
                    obj.iderinfo.writebfr = ReadShortX(obj.acc, 18);
                    obj.iderinfo.proto = obj.acc.charCodeAt(21);
                    if (obj.iderinfo.proto !== 0 || obj.iderinfo.readbfr > 65536) { obj.Stop(); return 0; }
                    if (opts.onStatus) opts.onStatus('session_open', { readbfr: obj.iderinfo.readbfr });

                    if (obj.iderStart === 0) { sendDisableEnableFeatures(3, IntToStrX(0x01 + 0x08)); }
                    else if (obj.iderStart === 1) { sendDisableEnableFeatures(3, IntToStrX(0x01 + 0x10)); }
                    else if (obj.iderStart === 2) { sendDisableEnableFeatures(3, IntToStrX(0x01 + 0x18)); }
                    return 30 + olen;
                case 0x43: obj.Stop(); return 8; // CLOSE
                case 0x44: sendCommand(0x45); return 8; // KEEPALIVEPING → PONG
                case 0x45: return 8; // KEEPALIVEPONG
                case 0x46: // RESETOCCURED
                    if (obj.acc.length < 9) return 0;
                    if (g_media === null) { sendCommand(0x47); }
                    else { g_reset = true; }
                    return 9;
                case 0x49: // STATUS_DATA
                    if (obj.acc.length < 13) return 0;
                    var type = obj.acc.charCodeAt(8);
                    var value = ReadIntX(obj.acc, 9);
                    if (type === 1 && (value & 1)) {
                        if (obj.iderStart === 0) { sendDisableEnableFeatures(3, IntToStrX(0x01 + 0x08)); }
                        else if (obj.iderStart === 1) { sendDisableEnableFeatures(3, IntToStrX(0x01 + 0x10)); }
                        else if (obj.iderStart === 2) { sendDisableEnableFeatures(3, IntToStrX(0x01 + 0x18)); }
                    }
                    if (type === 2) { obj.enabled = (value & 2) ? true : false; }
                    return 13;
                case 0x4A: if (obj.acc.length < 11) return 0; return 11; // ERROR
                case 0x4B: return 8; // HEARTBEAT
                case 0x50: // COMMAND WRITTEN (SCSI command)
                    if (obj.acc.length < 28) return 0;
                    var device = (obj.acc.charCodeAt(14) & 0x10) ? 0xB0 : 0xA0;
                    var deviceFlags = obj.acc.charCodeAt(14);
                    var cdb = obj.acc.substring(16, 28);
                    var featureRegister = obj.acc.charCodeAt(9);
                    handleSCSI(device, cdb, featureRegister, deviceFlags);
                    return 28;
                case 0x53: // DATA FROM HOST (write)
                    if (obj.acc.length < 14) return 0;
                    var wlen = ReadShortX(obj.acc, 9);
                    if (obj.acc.length < 14 + wlen) return 0;
                    sendCommand(0x51, String.fromCharCode(0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x87, 0x70, 0x03, 0x00, 0x00, 0x00, 0xa0, 0x51, 0x07, 0x27, 0x00), true);
                    return 14 + wlen;
                default:
                    console.log('IDER-Server: Unknown command', obj.acc.charCodeAt(0));
                    return 8;
            }
        }

        // SCSI command handler
        function handleSCSI(dev, cdb, featureRegister, deviceFlags) {
            var lba, len;

            // Dummy cdrom returns no-medium for everything
            var media = (dev === 0xA0) ? obj.floppy : obj.cdrom;
            if (!media || media.dummy) {
                sendCommandEndResponse(1, 0x02, dev, 0x3a, 0x00);
                return;
            }

            switch (cdb.charCodeAt(0)) {
                case 0x00: // TEST_UNIT_READY
                    if (dev === 0xA0) {
                        if (!obj.floppyReady) { obj.floppyReady = true; sendCommandEndResponse(1, 0x06, dev, 0x28, 0x00); return; }
                    } else {
                        if (!obj.cdromReady) { obj.cdromReady = true; sendCommandEndResponse(1, 0x06, dev, 0x28, 0x00); return; }
                    }
                    sendCommandEndResponse(1, 0x00, dev, 0x00, 0x00);
                    break;
                case 0x08: // READ_6
                    lba = ((cdb.charCodeAt(1) & 0x1f) << 16) + (cdb.charCodeAt(2) << 8) + cdb.charCodeAt(3);
                    len = cdb.charCodeAt(4); if (len === 0) len = 256;
                    sendDiskData(dev, lba, len, featureRegister);
                    break;
                case 0x0a: // WRITE_6
                    sendCommandEndResponse(1, 0x02, dev, 0x3a, 0x00);
                    break;
                case 0x1a: // MODE_SENSE_6
                    if ((cdb.charCodeAt(2) === 0x3f) && (cdb.charCodeAt(3) === 0x00)) {
                        var a = (dev === 0xA0) ? 0x00 : 0x05;
                        sendDataToHost(dev, true, String.fromCharCode(0, a, 0x80, 0), featureRegister & 1);
                    } else {
                        sendCommandEndResponse(1, 0x05, dev, 0x24, 0x00);
                    }
                    break;
                case 0x1b: sendCommandEndResponse(1, 0, dev); break; // START_STOP
                case 0x1e: sendCommandEndResponse(1, 0x00, dev, 0x00, 0x00); break; // ALLOW_MEDIUM_REMOVAL
                case 0x23: // READ_FORMAT_CAPACITIES
                    sendDataToHost(dev, true, IntToStr(8) + String.fromCharCode(0x00, 0x00, 0x0b, 0x40, 0x02, 0x00, 0x02, 0x00), featureRegister & 1);
                    break;
                case 0x25: // READ_CAPACITY
                    var capLen = (dev === 0xA0) ? (media.size >> 9) - 1 : (media.size >> 11) - 1;
                    sendDataToHost(deviceFlags, true, IntToStr(capLen) + String.fromCharCode(0, 0, (dev === 0xB0) ? 0x08 : 0x02, 0), featureRegister & 1);
                    break;
                case 0x28: // READ_10
                    lba = ReadInt(cdb, 2);
                    len = ReadShort(cdb, 7);
                    sendDiskData(dev, lba, len, featureRegister);
                    break;
                case 0x2a: case 0x2e: // WRITE_10/WRITE_AND_VERIFY
                    lba = ReadInt(cdb, 2); len = ReadShort(cdb, 7);
                    sendGetDataFromHost(dev, 512 * len);
                    break;
                case 0x43: // READ_TOC
                    if (dev === 0xA0) { sendCommandEndResponse(1, 0x05, dev, 0x20, 0x00); break; }
                    var msf = cdb.charCodeAt(1) & 0x02;
                    var format = cdb.charCodeAt(2) & 0x07;
                    if (format === 0) format = cdb.charCodeAt(9) >> 6;
                    if (format === 1) { sendDataToHost(dev, true, String.fromCharCode(0x00, 0x0a, 0x01, 0x01, 0x00, 0x14, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00), featureRegister & 1); }
                    else if (format === 0) {
                        if (msf) { sendDataToHost(dev, true, String.fromCharCode(0x00, 0x12, 0x01, 0x01, 0x00, 0x14, 0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x14, 0xaa, 0x00, 0x00, 0x00, 0x34, 0x13), featureRegister & 1); }
                        else { sendDataToHost(dev, true, String.fromCharCode(0x00, 0x12, 0x01, 0x01, 0x00, 0x14, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x14, 0xaa, 0x00, 0x00, 0x00, 0x00, 0x00), featureRegister & 1); }
                    }
                    break;
                case 0x46: // GET_CONFIGURATION
                    var sendall = (cdb.charCodeAt(1) !== 2);
                    var firstcode = ReadShort(cdb, 2);
                    var buflen = ReadShort(cdb, 7);
                    if (buflen === 0) { sendDataToHost(dev, true, IntToStr(0x003c) + IntToStr(0x0008), featureRegister & 1); break; }
                    var r = IntToStr(0x0008);
                    if (firstcode === 0) { r += IDE_CD_ConfigArrayProfileList; }
                    if ((firstcode === 0x1) || (sendall && (firstcode < 0x1))) { r += IDE_CD_ConfigArrayCore; }
                    if ((firstcode === 0x2) || (sendall && (firstcode < 0x2))) { r += IDE_CD_Morphing; }
                    if ((firstcode === 0x3) || (sendall && (firstcode < 0x3))) { r += IDE_CD_ConfigArrayRemovable; }
                    if ((firstcode === 0x10) || (sendall && (firstcode < 0x10))) { r += IDE_CD_ConfigArrayRandom; }
                    if ((firstcode === 0x1E) || (sendall && (firstcode < 0x1E))) { r += IDE_CD_Read; }
                    if ((firstcode === 0x100) || (sendall && (firstcode < 0x100))) { r += IDE_CD_PowerManagement; }
                    if ((firstcode === 0x105) || (sendall && (firstcode < 0x105))) { r += IDE_CD_Timeout; }
                    r = IntToStr(r.length) + r;
                    if (r.length > buflen) r = r.substring(0, buflen);
                    sendDataToHost(dev, true, r, featureRegister & 1);
                    break;
                case 0x4a: // GET_EVENT_STATUS
                    var present = 0x00;
                    if ((dev === 0xA0) && obj.floppy && !obj.floppy.dummy) { present = 0x02; }
                    else if ((dev === 0xB0) && obj.cdrom && !obj.cdrom.dummy) { present = 0x02; }
                    sendDataToHost(dev, true, String.fromCharCode(0x00, present, 0x80, 0x00), featureRegister & 1);
                    break;
                case 0x51: sendCommandEndResponse(0, 0x05, dev, 0x20, 0x00); break; // READ_DISC_INFO
                case 0x55: sendCommandEndResponse(1, 0x05, dev, 0x20, 0x00); break; // MODE_SELECT_10
                case 0x5a: // MODE_SENSE_10
                    var msBuflen = ReadShort(cdb, 7);
                    if (msBuflen === 0) { sendDataToHost(dev, true, IntToStr(0x003c) + IntToStr(0x0008), featureRegister & 1); break; }
                    var sectorCount = (dev === 0xA0) ? (media.size >> 9) : (media.size >> 11);
                    var isUsbDisk = (dev === 0xA0) && (sectorCount > 0x3C300);
                    var msR = null;
                    switch (cdb.charCodeAt(2) & 0x3f) {
                        case 0x01: if (dev === 0xA0) { msR = isUsbDisk ? IDE_ModeSence_UsbDiskError_Recovery_Array : ((sectorCount <= 0xb40) ? IDE_ModeSence_FloppyError_Recovery_Array : IDE_ModeSence_Ls120Error_Recovery_Array); } else { msR = IDE_ModeSence_CDError_Recovery_Array; } break;
                        case 0x05: if (dev === 0xA0 && !isUsbDisk) { msR = (sectorCount <= 0xb40) ? IDE_ModeSence_FloppyDisk_Page_Array : IDE_ModeSence_LS120Disk_Page_Array; } break;
                        case 0x08: if (isUsbDisk) { msR = IDE_ModeSence_UsbDisk_Page_Array; } break;
                        case 0x3f: if (dev === 0xA0) { msR = isUsbDisk ? IDE_ModeSence_3F_UsbDisk_Array : ((sectorCount <= 0xb40) ? IDE_ModeSence_3F_Floppy_Array : IDE_ModeSence_3F_LS120_Array); } else { msR = IDE_ModeSence_3F_CD_Array; } break;
                        case 0x1A: if (dev === 0xB0) { msR = IDE_ModeSence_CD_1A_Array; } break;
                        case 0x1D: if (dev === 0xB0) { msR = IDE_ModeSence_CD_1D_Array; } break;
                        case 0x2A: if (dev === 0xB0) { msR = IDE_ModeSence_CD_2A_Array; } break;
                    }
                    if (msR === null) { sendCommandEndResponse(0, 0x05, dev, 0x20, 0x00); }
                    else { sendDataToHost(dev, true, msR, featureRegister & 1); }
                    break;
                default:
                    sendCommandEndResponse(0, 0x05, dev, 0x20, 0x00);
                    break;
            }
        }

        // Disk read with synchronous fs.readSync (no FileReader overhead)
        var g_readQueue = [], g_dev, g_lba, g_len, g_media = null, g_reset = false;

        function sendDiskData(dev, lba, len, featureRegister) {
            var media = (dev === 0xA0) ? obj.floppy : obj.cdrom;
            if (!media || media.dummy) { sendCommandEndResponse(1, 0x02, dev, 0x3a, 0x00); return; }
            var mediaBlocks = (dev === 0xA0) ? (media.size >> 9) : (media.size >> 11);
            if (len < 0 || lba + len > mediaBlocks) { sendCommandEndResponse(1, 0x05, dev, 0x21, 0x00); return; }
            if (len === 0) { sendCommandEndResponse(1, 0x00, dev, 0x00, 0x00); return; }

            if (dev === 0xA0) { lba <<= 9; len <<= 9; } else { lba <<= 11; len <<= 11; }

            if (g_media !== null) {
                g_readQueue.push({ media: media, dev: dev, lba: lba, len: len, fr: featureRegister });
            } else {
                g_media = media;
                g_dev = dev;
                g_lba = lba;
                g_len = len;
                sendDiskDataEx(featureRegister);
            }
        }

        function sendDiskDataEx(featureRegister) {
            var len = g_len, lba = g_lba;
            if (g_len > obj.iderinfo.readbfr) { len = obj.iderinfo.readbfr; }
            g_len -= len;
            g_lba += len;

            // Synchronous read directly from file - no async FileReader overhead
            var buffer = Buffer.alloc(len);
            try { fs.readSync(g_media.fd, buffer, 0, len, lba); } catch (e) { /* read error */ }
            var data = buffer.toString('binary');

            sendDataToHost(g_dev, (g_len === 0), data, featureRegister & 1);
            if ((g_len > 0) && !g_reset) {
                // Use setImmediate to avoid blocking the event loop but stay fast
                setImmediate(function () { sendDiskDataEx(featureRegister); });
            } else {
                g_media = null;
                if (g_reset) { sendCommand(0x47); g_readQueue = []; g_reset = false; }
                else if (g_readQueue.length > 0) {
                    var op = g_readQueue.shift();
                    g_media = op.media; g_dev = op.dev; g_lba = op.lba; g_len = op.len;
                    sendDiskDataEx(op.fr);
                }
            }
        }

        // Protocol send functions
        function sendRaw(x) {
            if (obj.socket) {
                var buf = Buffer.from(x, 'binary');
                console.log('IDER-Server: Send ' + buf.length + ' bytes, cmd=0x' + buf[0].toString(16) + ' hex=' + buf.toString('hex').substring(0, 60));
                obj.socket.write(buf);
                obj.bytesToAmt += x.length;
            }
        }

        function sendCommand(cmdid, data, completed, dma) {
            if (!data) data = '';
            var attributes = ((cmdid > 50) && completed) ? 2 : 0;
            if (dma) attributes += 1;
            var x = String.fromCharCode(cmdid, 0, 0, attributes) + IntToStrX(obj.outSequence++) + data;
            sendRaw(x);
        }

        function sendCommandEndResponse(error, sense, device, asc, asq) {
            if (error) { sendCommand(0x51, String.fromCharCode(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xc5, 0, 3, 0, 0, 0, device, 0x50, 0, 0, 0), true); }
            else { sendCommand(0x51, String.fromCharCode(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x87, (sense << 4), 3, 0, 0, 0, device, 0x51, sense, asc || 0, asq || 0), true); }
        }

        function sendDataToHost(device, completed, data, dma) {
            var dmalen = dma ? 0 : data.length;
            if (completed) {
                sendCommand(0x54, String.fromCharCode(0, (data.length & 0xff), (data.length >> 8), 0, dma ? 0xb4 : 0xb5, 0, 2, 0, (dmalen & 0xff), (dmalen >> 8), device, 0x58, 0x85, 0, 3, 0, 0, 0, device, 0x50, 0, 0, 0, 0, 0, 0) + data, completed, dma);
            } else {
                sendCommand(0x54, String.fromCharCode(0, (data.length & 0xff), (data.length >> 8), 0, dma ? 0xb4 : 0xb5, 0, 2, 0, (dmalen & 0xff), (dmalen >> 8), device, 0x58, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0) + data, completed, dma);
            }
        }

        function sendDisableEnableFeatures(type, data) { if (!data) data = ''; sendCommand(0x48, String.fromCharCode(type) + data); }

        function sendGetDataFromHost(device, chunksize) {
            sendCommand(0x52, String.fromCharCode(0, (chunksize & 0xff), (chunksize >> 8), 0, 0xb5, 0, 0, 0, (chunksize & 0xff), (chunksize >> 8), device, 0x58, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), false);
        }

        obj.Stop = function () {
            if (obj.pingTimer) { clearInterval(obj.pingTimer); obj.pingTimer = null; }
            if (obj.floppy && obj.floppy.fd) { try { fs.closeSync(obj.floppy.fd); } catch (e) { } }
            if (obj.cdrom && obj.cdrom.fd) { try { fs.closeSync(obj.cdrom.fd); } catch (e) { } }
            if (obj.socket) { try { obj.socket.destroy(); } catch (e) { } obj.socket = null; }
            if (opts.onStatus) opts.onStatus('stopped');
        };

        connect();
        return obj;
    }

    return { startSession: startSession };
};
