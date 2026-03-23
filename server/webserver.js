/**
* @description MeshCommander web server
* @author Ylian Saint-Hilaire
* @copyright Intel Corporation 2018-2020
* @license Apache-2.0
* @version v0.0.3
*/

module.exports.CreateWebServer = function (args) {
    var obj = {};
    
    obj.fs = require('fs');
    obj.net = require('net');
    obj.tls = require('tls');
    obj.dgram = require('dgram');
    obj.path = require('path');
    obj.args = args;
    obj.express = require('express');
    obj.app = obj.express();
    obj.expressWs = require('express-ws')(obj.app);
    obj.interceptor = require('./interceptor');
    obj.common = require('./common.js');
    obj.iderServer = require('./amt-ider-server.js').CreateServerIder();
    obj.constants = require('crypto').constants || require('constants');
    obj.computerlist = null;
    obj.activeIderSessions = {}; // host -> ider session

    obj.debug = function (msg) { if (args.debug) { console.log(msg); } }
    
    obj.getAmtPassword = function(host) {
        if (!obj.computerlist || obj.computerlist == null) return null;
        for (var i in obj.computerlist) { if (obj.computerlist[i].host == host) { return [obj.computerlist[i].user, obj.computerlist[i].pass]; } }
        return null;
    }
    
    // Indicates to ExpressJS that the public folder should be used to serve static files. Mesh Commander will be at "default.htm".
    obj.app.use(obj.express.static(obj.path.join(__dirname, '..', 'public')));

    // Redirect "/" to the Mesh Commander web application.
    obj.app.get('/', function (req, res) {
        res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
        res.redirect('/default.htm');
    });
    
    // Config file paths - use external path if provided (for Electron/asar), fallback to local
    obj.configPath = args.configPath || obj.path.join(__dirname, 'computerlist.config');
    obj.settingsPath = args.settingsPath || obj.path.join(__dirname, 'settings.json');

    // Get settings
    obj.app.get('/settings.ashx', function (req, res) {
        res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0', 'Content-Type': 'application/json' });
        obj.fs.readFile(obj.settingsPath, 'utf8', function (err, data) {
            if (err) { res.send('{}'); return; }
            try { JSON.parse(data); res.send(data); } catch (e) { res.send('{}'); }
        });
    });

    // Save settings
    obj.app.post('/settings.ashx', obj.express.json(), function (req, res) {
        res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
        if (typeof req.body !== 'object') { res.status(400).send('Invalid data'); return; }
        obj.fs.writeFile(obj.settingsPath, JSON.stringify(req.body, null, 2), 'utf8', function (err) {
            if (err) { res.status(500).send('Failed to save'); return; }
            res.send('OK');
        });
    });

    // Get computer list
    obj.app.get('/webrelay.ashx', function (req, res) {
        res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
        if (req.query.action == 'getcomputerlist') {
            obj.fs.readFile(obj.configPath, 'utf8', function (err, data) {
                var list = [];
                if (err == null) { try { list = JSON.parse(data); } catch (e) { list = []; } }
                obj.computerlist = obj.common.Clone(list);
                // Send full list including passwords (local-only app, no security risk)
                res.set({ 'Content-Type': 'application/json' });
                res.send(JSON.stringify(list));
            });
            return;
        }
        try { res.end(); } catch (e) { }
    });

    // Save computer list
    obj.app.post('/webrelay.ashx', obj.express.json(), function (req, res) {
        res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
        if (req.query.action == 'savecomputerlist') {
            var list = req.body;
            if (!Array.isArray(list)) { res.status(400).send('Invalid data'); return; }
            // Merge passwords: client doesn't have them (stripped on GET), so preserve existing ones
            if (obj.computerlist) {
                var passMap = {};
                for (var i in obj.computerlist) {
                    var c = obj.computerlist[i];
                    if (c.host && c.pass) { passMap[c.host] = { user: c.user, pass: c.pass }; }
                }
                for (var i in list) {
                    if (!list[i].pass && list[i].host && passMap[list[i].host]) {
                        list[i].pass = passMap[list[i].host].pass;
                        if (!list[i].user || list[i].user === '') { list[i].user = passMap[list[i].host].user; }
                    }
                }
            }
            obj.computerlist = obj.common.Clone(list);
            obj.fs.writeFile(obj.configPath, JSON.stringify(list, null, 2), 'utf8', function (err) {
                if (err) { res.status(500).send('Failed to save'); return; }
                res.send('OK');
            });
            return;
        }
        try { res.end(); } catch (e) { }
    });
    
    // Scan local network for AMT devices (ports 16992/16993)
    obj.app.get('/amt-scan.ashx', function (req, res) {
        res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0', 'Content-Type': 'application/json' });
        var os = require('os');
        var interfaces = os.networkInterfaces();
        var subnets = [];
        for (var name in interfaces) {
            for (var i in interfaces[name]) {
                var iface = interfaces[name][i];
                if (iface.family === 'IPv4' && !iface.internal && iface.cidr) {
                    var parts = iface.address.split('.');
                    subnets.push(parts[0] + '.' + parts[1] + '.' + parts[2]);
                }
            }
        }
        if (subnets.length === 0) { res.send(JSON.stringify({ devices: [], error: 'No network interfaces found' })); return; }

        var found = [];
        var pending = 0;
        var timeout = parseInt(req.query.timeout) || 800;
        var ports = [16992, 16993];

        function scanHost(subnet, host) {
            var ip = subnet + '.' + host;
            for (var p = 0; p < ports.length; p++) {
                (function (ip, port) {
                    pending++;
                    var sock = new obj.net.Socket();
                    sock.setTimeout(timeout);
                    sock.on('connect', function () {
                        if (!found.some(function (d) { return d.ip === ip; })) {
                            found.push({ ip: ip, port: port, tls: port === 16993 ? 1 : 0 });
                        }
                        sock.destroy();
                    });
                    sock.on('timeout', function () { sock.destroy(); });
                    sock.on('error', function () { });
                    sock.on('close', function () {
                        pending--;
                        if (pending === 0) { res.send(JSON.stringify({ devices: found })); }
                    });
                    sock.connect(port, ip);
                })(ip, ports[p]);
            }
        }

        // Scan each subnet, skip .0 and .255
        for (var s = 0; s < subnets.length; s++) {
            for (var h = 1; h < 255; h++) { scanHost(subnets[s], h); }
        }
    });

    // Server-side IDER: mount ISO directly from Node.js (no browser relay)
    obj.app.use(obj.express.json());

    obj.app.post('/ider-server.ashx', function (req, res) {
        res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0', 'Content-Type': 'application/json' });
        var action = req.body.action;

        if (action === 'start') {
            var host = req.body.host;
            var port = parseInt(req.body.port) || 16994;
            var user = req.body.user;
            var pass = req.body.pass;
            var tlsFlag = parseInt(req.body.tls) || 0;
            var isoPath = req.body.isoPath;
            var mountMode = req.body.mountMode || 'cdrom';
            var iderStart = parseInt(req.body.iderStart) || 0;

            if (!host || !user || !pass || !isoPath) { res.status(400).send(JSON.stringify({ error: 'Missing parameters' })); return; }

            // Stop existing session for this host
            if (obj.activeIderSessions[host]) { obj.activeIderSessions[host].Stop(); delete obj.activeIderSessions[host]; }

            var session = obj.iderServer.startSession({
                host: host, port: port, user: user, pass: pass, tls: tlsFlag,
                isoPath: isoPath, mountMode: mountMode, iderStart: iderStart,
                onStatus: function (status, data) {
                    // Store latest status
                    if (obj.activeIderSessions[host]) { obj.activeIderSessions[host]._status = status; obj.activeIderSessions[host]._statusData = data; }
                },
                onError: function (err) {
                    if (obj.activeIderSessions[host]) { obj.activeIderSessions[host]._status = 'error'; obj.activeIderSessions[host]._error = err; }
                }
            });

            if (session) {
                obj.activeIderSessions[host] = session;
                res.send(JSON.stringify({ status: 'starting', host: host }));
            } else {
                res.status(500).send(JSON.stringify({ error: 'Failed to start IDER session' }));
            }
        } else if (action === 'stop') {
            var host = req.body.host;
            if (obj.activeIderSessions[host]) {
                obj.activeIderSessions[host].Stop();
                delete obj.activeIderSessions[host];
                res.send(JSON.stringify({ status: 'stopped', host: host }));
            } else {
                res.send(JSON.stringify({ status: 'not_running', host: host }));
            }
        } else if (action === 'status') {
            var host = req.body.host;
            var session = obj.activeIderSessions[host];
            if (session) {
                res.send(JSON.stringify({ status: session._status || 'unknown', error: session._error, bytesToAmt: session.bytesToAmt, bytesFromAmt: session.bytesFromAmt, readbfr: session.iderinfo ? session.iderinfo.readbfr : 0 }));
            } else {
                res.send(JSON.stringify({ status: 'not_running' }));
            }
        } else {
            res.status(400).send(JSON.stringify({ error: 'Unknown action' }));
        }
    });

    // RMCP Presence Ping - batch ping multiple AMT hosts via UDP 623
    obj.app.get('/rmcp-ping.ashx', function (req, res) {
        res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0', 'Content-Type': 'application/json' });
        var hostsParam = req.query.hosts;
        if (!hostsParam) { res.status(400).send(JSON.stringify({ error: 'Missing hosts parameter' })); return; }
        var hosts = hostsParam.split(',').filter(function (h) { return h.trim().length > 0; }).map(function (h) { return h.trim(); });
        if (hosts.length === 0) { res.send(JSON.stringify([])); return; }

        var pingPacket = Buffer.from([0x06, 0x00, 0xff, 0x06, 0x00, 0x00, 0x11, 0xbe, 0x80, 0x00, 0x00, 0x00]);
        var timeout = parseInt(req.query.timeout) || 2000;
        var results = {};
        for (var i = 0; i < hosts.length; i++) { results[hosts[i]] = { host: hosts[i], status: 'offline' }; }

        var responded = false;
        var client = obj.dgram.createSocket('udp4');

        var timer = setTimeout(function () {
            if (!responded) {
                responded = true;
                try { client.close(); } catch (e) { }
                var arr = [];
                for (var h in results) { arr.push(results[h]); }
                res.send(JSON.stringify(arr));
            }
        }, timeout + 500);

        client.on('error', function () {
            if (!responded) {
                responded = true;
                clearTimeout(timer);
                try { client.close(); } catch (e) { }
                var arr = [];
                for (var h in results) { arr.push(results[h]); }
                res.send(JSON.stringify(arr));
            }
        });

        client.on('message', function (data, rinfo) {
            if (responded) return;
            var ip = rinfo.address;
            if (results[ip] && data.length >= 22) {
                if (((data[12] === 0) || (data[13] !== 0) || (data[14] !== 1) || (data[15] !== 0x57)) && (data[21] & 32)) {
                    var minorVersion = data[18] & 0x0F;
                    var majorVersion = (data[18] >> 4) & 0x0F;
                    var provisioningState = data[19] & 0x03;
                    var openPort = (data[16] * 256) + data[17];
                    var dualPorts = ((data[19] & 0x04) !== 0);
                    results[ip] = {
                        host: ip,
                        status: 'online',
                        amtVersion: majorVersion + '.' + minorVersion,
                        provisioningState: provisioningState,
                        openPort: openPort,
                        dualPorts: dualPorts
                    };
                } else {
                    results[ip] = { host: ip, status: 'online' };
                }
            }
        });

        client.bind(0, function () {
            for (var i = 0; i < hosts.length; i++) {
                try { client.send(pingPacket, 0, 12, 623, hosts[i]); } catch (e) { }
            }
        });
    });

    // Indicates to ExpressJS what we want to handle websocket requests on "/webrelay.ashx". This is the same URL as IIS making things simple, we can use the same web application for both IIS and Node.
    obj.app.ws('/webrelay.ashx', function (ws, req) {
        ws._req = req;
        ws._tcpReady = false;
        ws._msgBuffer = [];

        // When data is received from the web socket, forward the data into the associated TCP connection.
        // If the TCP connection is pending, buffer up the data until it connects.
        ws.on('message', function (msg) {
            // Ensure msg is a Buffer for direct binary relay
            if (!(msg instanceof Buffer)) { msg = Buffer.from(msg); }

            if (ws.interceptor) {
                // Interceptor expects binary string, convert only when interceptor is active
                var str = msg.toString('binary');
                str = ws.interceptor.processBrowserData(str);
                msg = Buffer.from(str, 'binary');
            }
            if (ws._tcpReady) {
                ws.forwardclient.write(msg);
            } else {
                ws._msgBuffer.push(msg); // Buffer until TCP is connected
            }
        });

        // If the web socket is closed, close the associated TCP connection.
        ws.on('close', function () {
            obj.debug("Closing web socket connection to " + req.query.host + ':' + req.query.port + '.');
            if (ws.forwardclient) { try { ws.forwardclient.destroy(); } catch (e) { } }
        });

        // Flush buffered messages when TCP connects
        function flushBuffer() {
            ws._tcpReady = true;
            for (var i = 0; i < ws._msgBuffer.length; i++) {
                ws.forwardclient.write(ws._msgBuffer[i]);
            }
            ws._msgBuffer = [];
        }

        // We got a new web socket connection, initiate a TCP connection to the target Intel AMT host/port.
        obj.debug("Opening web socket connection to " + req.query.host + ':' + req.query.port + '.');
        if (req.query.tls == 0) {
            // If this is TCP (without TLS) set a normal TCP socket
            ws.forwardclient = new obj.net.Socket();
            ws.forwardclient.setNoDelay(true); // Disable Nagle for lower latency
            ws.forwardclient.forwardwsocket = ws;
        } else {
            // If TLS is going to be used, setup a TLS socket
            var tlsoptions = { minVersion: 'TLSv1', maxVersion: (req.query.tls1only == 1) ? 'TLSv1' : undefined, ciphers: 'RSA+AES:!aNULL:!MD5:!DSS', secureOptions: obj.constants.SSL_OP_NO_SSLv2 | obj.constants.SSL_OP_NO_SSLv3 | obj.constants.SSL_OP_NO_COMPRESSION | obj.constants.SSL_OP_CIPHER_SERVER_PREFERENCE, rejectUnauthorized: false };
            ws.forwardclient = obj.tls.connect(req.query.port, req.query.host, tlsoptions, function () {
                obj.debug("TLS connected to " + req.query.host + ':' + req.query.port + '.');
                ws.forwardclient.socket.setNoDelay(true); // Disable Nagle for lower latency
                flushBuffer();
            });
            ws.forwardclient.forwardwsocket = ws;
        }

        // When we receive data on the TCP connection, forward it back into the web socket connection.
        ws.forwardclient.on('data', function (data) {
            // data is already a Buffer from TCP socket
            if (ws.interceptor) {
                var str = data.toString('binary');
                str = ws.interceptor.processAmtData(str);
                data = Buffer.from(str, 'binary');
            }
            try { ws.send(data); } catch (ex) { }
        });
        
        // If the TCP connection closes, disconnect the associated web socket.
        ws.forwardclient.on('close', function () {
            obj.debug("TCP disconnected from " + req.query.host + ':' + req.query.port + '.');
            try { ws.close(); } catch (ex) { }
        });
        
        // If the TCP connection causes an error, disconnect the associated web socket.
        ws.forwardclient.on('error', function (err) {
            obj.debug("TCP disconnected with error from " + req.query.host + ':' + req.query.port + ': ' + err.code + ', ' + req.url);
            try { ws.close(); } catch (ex) { }
        });
        
        // Fetch Intel AMT credentials & Setup interceptor
        var credentials = obj.getAmtPassword(req.query.host);
        if (credentials != null) {
            if (req.query.p == 1) { ws.interceptor = obj.interceptor.CreateHttpInterceptor({ host: req.query.host, port: req.query.port, user: credentials[0], pass: credentials[1] }); }
            else if (req.query.p == 2) { ws.interceptor = obj.interceptor.CreateRedirInterceptor({ user: credentials[0], pass: credentials[1] }); }
        }
        
        if (req.query.tls == 0) {
            // A TCP connection to Intel AMT just connected, send any pending data and start forwarding.
            ws.forwardclient.connect(req.query.port, req.query.host, function () {
                obj.debug("TCP connected to " + req.query.host + ':' + req.query.port + '.');
                flushBuffer();
            });
        }
    });

    // Start the ExpressJS web server
    var port = 3000;
    if (args.port != null) { port = parseInt(args.port); }
    if (isNaN(port) || (port == null) || (typeof port != 'number') || (port < 0) || (port > 65536)) { port = 3000; }
    if (args.any != null) {
        obj.app.listen(port, function () { console.log("Remote-AMT-KVM running on http://*:" + port + '.'); });
    } else {
        obj.app.listen(port, '127.0.0.1', function () { console.log("Remote-AMT-KVM running on http://127.0.0.1:" + port + '.'); });
    }

    return obj;
}